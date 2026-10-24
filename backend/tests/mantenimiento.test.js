process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar } = crearEntorno();

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const { calcularEstadoService } = require(path.join(SRC, 'utils', 'estadoService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/mantenimientos`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  sembrar();
});

// Vehículos sembrados (todos Colectivo, odómetro 1.000 km): 7 (interno 12),
// 8 (13, En taller), 9 (14) y 10 (15, Dado de baja). Usuario 10 = el del token.
const tokenDe = (perfil) =>
  generarToken({ id: 10, personaId: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });

function pedir(ruta, { metodo = 'GET', body, perfil = 'ADMINISTRADOR', token } = {}) {
  const headers = {};
  if (token !== null) headers.Authorization = `Bearer ${token ?? tokenDe(perfil)}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${ruta}`, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
}

async function pedirJson(ruta, opciones) {
  const res = await pedir(ruta, opciones);
  return { status: res.status, body: await res.json() };
}

const DIA_MS = 24 * 60 * 60 * 1000;
const diaCordoba = (offsetDias = 0) =>
  new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDias * DIA_MS).toISOString().slice(0, 10);
const HOY = diaCordoba();

const vehiculo = (id) => db.vehiculos.find((v) => v.id === id);
const planDe = (vehiculoId) => db.planesMantenimiento.find((p) => p.vehiculoId === vehiculoId);

function sembrarPlan(vehiculoId, kmUltimoService, plantillaMantenimientoId = 1) {
  db.planesMantenimiento.push({ id: db.siguienteId++, vehiculoId, plantillaMantenimientoId, kmUltimoService, activo: true });
}

// Cambia el tipo de un vehículo sembrado (todos arrancan como Colectivo).
function cambiarTipo(vehiculoId, tipoVehiculoId, descripcion) {
  Object.assign(vehiculo(vehiculoId), { tipoVehiculoId, tipoVehiculo: { id: tipoVehiculoId, descripcion, orden: tipoVehiculoId } });
}

// Sin tiposArregloIds es un service; con tipos, un arreglo (filas en la tabla intermedia).
function sembrarRegistro({ vehiculoId = 7, tiposArregloIds = [], detalles = {}, fecha, kilometraje = 1000, ...resto }) {
  const fila = {
    id: db.siguienteId++,
    vehiculoId,
    planMantenimientoId: null,
    esServicePreventivo: tiposArregloIds.length === 0,
    fecha: new Date(`${fecha}T12:00:00-03:00`),
    kilometraje,
    descripcion: null,
    repuestos: null,
    responsableId: null,
    costo: null,
    observaciones: null,
    usuarioId: 5,
    creadoEn: new Date(),
    ...resto,
  };
  db.mantenimientosRealizados.push(fila);
  for (const tipoArregloId of tiposArregloIds) {
    db.mantenimientosTiposArreglo.push({ mantenimientoId: fila.id, tipoArregloId, detalle: detalles[tipoArregloId] ?? null });
  }
  return fila;
}

describe('calcularEstadoService (95 % del intervalo)', () => {
  const estado = (kmDesdeService, intervaloKm) =>
    calcularEstadoService({ kilometraje: 100000 + kmDesdeService, kmUltimoService: 100000, intervaloKm, porcentajeAviso: 95 });

  test('colectivo (20.000 km): 18.999 al día, 19.000 próximo, 20.000 vencido', () => {
    assert.equal(estado(18999, 20000).estado, 'AL_DIA');
    assert.equal(estado(19000, 20000).estado, 'PROXIMO');
    assert.equal(estado(20000, 20000).estado, 'VENCIDO');
  });

  test('Trafic avisa a los 14.250 km y Utilitario a los 9.500', () => {
    assert.equal(estado(14249, 15000).estado, 'AL_DIA');
    assert.equal(estado(14250, 15000).estado, 'PROXIMO');
    assert.equal(estado(14250, 15000).kmAviso, 14250);
    assert.equal(estado(9499, 10000).estado, 'AL_DIA');
    assert.equal(estado(9500, 10000).estado, 'PROXIMO');
  });

  test('devuelve próximo service, km restantes, excedidos y la fracción consumida', () => {
    const alDia = estado(5000, 20000);
    assert.equal(alDia.kmProximoService, 120000);
    assert.equal(alDia.kmRestantes, 15000);
    assert.equal(alDia.kmExcedidos, 0);
    assert.equal(alDia.porcentajeConsumido, 0.25);

    const vencido = estado(21200, 20000);
    assert.equal(vencido.kmRestantes, 0);
    assert.equal(vencido.kmExcedidos, 1200);
  });

  test('un último service por encima del odómetro no cuenta km negativos', () => {
    const r = calcularEstadoService({ kilometraje: 900, kmUltimoService: 1000, intervaloKm: 20000, porcentajeAviso: 95 });
    assert.equal(r.kmDesdeService, 0);
    assert.equal(r.estado, 'AL_DIA');
  });
});

describe('GET /tipos-arreglo', () => {
  test('devuelve solo los activos, ordenados por orden', async () => {
    const { status, body } = await pedirJson('/tipos-arreglo', { perfil: 'PERSONAL_TALLER' });
    assert.equal(status, 200);
    assert.deepEqual(
      body.tiposArreglo.map((t) => t.nombre),
      ['Engrase', 'Cambio de cubiertas', 'Frenos', 'Otro']
    );
    const otro = body.tiposArreglo.find((t) => t.nombre === 'Otro');
    assert.equal(otro.requiereDetalle, true);
    assert.ok(otro.descripcion);
  });
});

describe('GET /planes (estado del service de la flota)', () => {
  test('incluye los vehículos sin plan (SIN_PLAN) y excluye los dados de baja', async () => {
    sembrarPlan(7, 0);
    const { status, body } = await pedirJson('/planes');
    assert.equal(status, 200);
    const porId = Object.fromEntries(body.vehiculos.map((v) => [v.vehiculo.id, v]));
    assert.deepEqual(Object.keys(porId).map(Number).sort(), [7, 8, 9]);
    assert.equal(porId[7].estado, 'AL_DIA');
    assert.equal(porId[9].estado, 'SIN_PLAN');
    assert.equal(porId[9].plan, null);
    // Sin plan igual trae la plantilla de su tipo (para "service cada 20.000 km").
    assert.equal(porId[9].plantilla.intervaloKm, 20000);
  });

  test('trae marca y modelo del vehículo (B1)', async () => {
    const { body } = await pedirJson('/planes');
    const v = body.vehiculos[0].vehiculo;
    assert.equal(v.marca, 'Mercedes');
    assert.equal(v.modelo, 'O500');
    assert.equal(v.tipoVehiculo, 'Colectivo');
  });

  test('el estado avanza con el odómetro: al día, próximo (95 %) y vencido', async () => {
    sembrarPlan(7, 1000);
    const estadoDe7 = async () => (await pedirJson('/planes')).body.vehiculos.find((v) => v.vehiculo.id === 7);

    vehiculo(7).kilometraje = 1000 + 18999;
    assert.equal((await estadoDe7()).estado, 'AL_DIA');

    vehiculo(7).kilometraje = 1000 + 19000;
    const proximo = await estadoDe7();
    assert.equal(proximo.estado, 'PROXIMO');
    assert.equal(proximo.kmRestantes, 1000);
    assert.equal(proximo.kmProximoService, 21000);

    vehiculo(7).kilometraje = 21050;
    const vencido = await estadoDe7();
    assert.equal(vencido.estado, 'VENCIDO');
    assert.equal(vencido.kmExcedidos, 50);
  });

  test('usa el intervalo de la plantilla del tipo (Trafic, 15.000 km)', async () => {
    cambiarTipo(9, 3, 'Trafic');
    sembrarPlan(9, 0, 3);
    vehiculo(9).kilometraje = 14250;
    const { body } = await pedirJson('/planes');
    const trafic = body.vehiculos.find((v) => v.vehiculo.id === 9);
    assert.equal(trafic.estado, 'PROXIMO');
    assert.equal(trafic.plantilla.intervaloKm, 15000);
  });
});

describe('POST /planes (asignar plan)', () => {
  test('toma la plantilla del tipo y, sin km, el odómetro actual', async () => {
    const { status, body } = await pedirJson('/planes', { metodo: 'POST', body: { vehiculoId: 7 }, perfil: 'PERSONAL_TALLER' });
    assert.equal(status, 201);
    assert.equal(body.estado.plan.kmUltimoService, 1000);
    assert.equal(body.estado.kmProximoService, 21000);
    assert.equal(body.estado.estado, 'AL_DIA');
    assert.equal(planDe(7).plantillaMantenimientoId, 1);
  });

  test('acepta un último service anterior, pero no uno por encima del odómetro', async () => {
    const ok = await pedirJson('/planes', { metodo: 'POST', body: { vehiculoId: 7, kmUltimoService: 500 } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.estado.kmProximoService, 20500);

    const mal = await pedirJson('/planes', { metodo: 'POST', body: { vehiculoId: 7, kmUltimoService: 5000 } });
    assert.equal(mal.status, 400);
    assert.ok(mal.body.errores.kmUltimoService);
  });

  test('rechaza un vehículo inexistente o dado de baja', async () => {
    const inexistente = await pedirJson('/planes', { metodo: 'POST', body: { vehiculoId: 9999 } });
    assert.equal(inexistente.status, 400);
    assert.ok(inexistente.body.errores.vehiculoId);

    const baja = await pedirJson('/planes', { metodo: 'POST', body: { vehiculoId: 10 } });
    assert.equal(baja.status, 400);
    assert.match(baja.body.errores.vehiculoId, /baja/);
  });
});

describe('POST /services', () => {
  const service = (body, perfil = 'PERSONAL_TALLER') =>
    pedirJson('/services', { metodo: 'POST', body: { vehiculoId: 7, fecha: HOY, ...body }, perfil });

  test('reinicia el conteo del plan y guarda la observación', async () => {
    sembrarPlan(7, 0);
    vehiculo(7).kilometraje = 19500;
    const { status, body } = await service({ kilometraje: 19500, observaciones: '  Sin novedades  ' });
    assert.equal(status, 201);
    assert.equal(body.registro.tipo, 'SERVICE');
    assert.deepEqual(body.registro.tiposArreglo, []);
    assert.equal(body.registro.observaciones, 'Sin novedades');
    assert.equal(body.registro.vehiculo.marca, 'Mercedes');
    assert.equal(body.registro.usuario, 'Chofer Token');
    assert.equal(planDe(7).kmUltimoService, 19500);

    const guardado = db.mantenimientosRealizados.at(-1);
    assert.equal(guardado.esServicePreventivo, true);
    assert.equal(guardado.planMantenimientoId, planDe(7).id);
    assert.equal(guardado.costo, null);
    assert.equal(guardado.responsableId, null);
  });

  test('un service con menos km que el último no baja el conteo (B3)', async () => {
    sembrarPlan(7, 40000);
    vehiculo(7).kilometraje = 45000;
    const { status } = await service({ kilometraje: 30000, fecha: diaCordoba(-200) });
    assert.equal(status, 201);
    assert.equal(planDe(7).kmUltimoService, 40000);
    assert.equal(db.lecturas.length, 0);
  });

  test('con km mayor al odómetro crea una lectura MANTENIMIENTO y actualiza el vehículo (B5)', async () => {
    sembrarPlan(7, 0);
    const { status } = await service({ kilometraje: 21100 });
    assert.equal(status, 201);
    assert.equal(db.lecturas.length, 1);
    assert.equal(db.lecturas[0].valorKm, 21100);
    assert.equal(db.origenes[db.lecturas[0].origenId], 'MANTENIMIENTO');
    assert.equal(db.lecturas[0].usuarioId, 10);
    assert.equal(vehiculo(7).kilometraje, 21100);
  });

  test('sin plan, lo crea con la plantilla de su tipo', async () => {
    const { status } = await service({ kilometraje: 1000 });
    assert.equal(status, 201);
    assert.equal(planDe(7).kmUltimoService, 1000);
    assert.equal(planDe(7).plantillaMantenimientoId, 1);
  });

  test('si algo falla no queda un plan huérfano ni el registro (B4)', async () => {
    // Una lectura previa mayor al km cargado: crearLectura lo rechaza adentro
    // de la transacción, después de crear el plan y el registro.
    db.lecturas.push({ id: 1, vehiculoId: 7, valorKm: 5000, fechaHora: new Date('2026-01-01T00:00:00Z'), origenId: 4 });
    const { status, body } = await service({ kilometraje: 3000 });
    assert.equal(status, 400);
    assert.match(body.errores.kilometraje, /5000/);
    assert.equal(planDe(7), undefined);
    assert.equal(db.mantenimientosRealizados.length, 0);
    assert.equal(vehiculo(7).kilometraje, 1000);

    db.lecturas.length = 0;
    db.fallos.createMantenimiento = true;
    const res = await pedir('/services', { metodo: 'POST', body: { vehiculoId: 7, fecha: HOY, kilometraje: 2000 } });
    assert.equal(res.status, 500);
    assert.equal(planDe(7), undefined);
  });

  test('rechaza tipos de arreglo, costo y responsable (no son parte del service)', async () => {
    const { status, body } = await service({
      kilometraje: 1000,
      tipoArregloId: 3,
      tiposArregloIds: [3],
      costo: 1000,
      responsableId: 1,
    });
    assert.equal(status, 400);
    assert.ok(body.errores.tipoArregloId);
    assert.ok(body.errores.tiposArregloIds);
    assert.ok(body.errores.costo);
    assert.ok(body.errores.responsableId);
    assert.equal(db.mantenimientosRealizados.length, 0);
  });

  test('valida todo junto: fecha futura, km inválido y vehículo dado de baja', async () => {
    const { status, body } = await service({ vehiculoId: 10, fecha: diaCordoba(1), kilometraje: -5 });
    assert.equal(status, 400);
    assert.match(body.errores.fecha, /posterior a hoy/);
    assert.ok(body.errores.kilometraje);
    assert.match(body.errores.vehiculoId, /baja/);
  });

  test('la fecha es obligatoria y se interpreta como día de Córdoba', async () => {
    const sinFecha = await service({ fecha: undefined, kilometraje: 1000 });
    assert.equal(sinFecha.status, 400);
    assert.ok(sinFecha.body.errores.fecha);

    const ok = await service({ fecha: '2026-03-12', kilometraje: 1000 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.registro.fecha, '2026-03-12T15:00:00.000Z');
  });

  test('una observación de más de 500 caracteres → 400', async () => {
    const { status, body } = await service({ kilometraje: 1000, observaciones: 'a'.repeat(501) });
    assert.equal(status, 400);
    assert.ok(body.errores.observaciones);
  });
});

describe('POST /arreglos', () => {
  const arreglo = (body) =>
    pedirJson('/arreglos', { metodo: 'POST', body: { vehiculoId: 7, fecha: HOY, kilometraje: 1000, ...body }, perfil: 'PERSONAL_TALLER' });

  test('guarda el tipo, el responsable y no toca el plan', async () => {
    sembrarPlan(7, 500);
    const { status, body } = await arreglo({
      tiposArregloIds: [3],
      responsableId: 1,
      repuestos: '2 cubiertas 295/80',
    });
    assert.equal(status, 201);
    assert.equal(body.registro.tipo, 'ARREGLO');
    assert.deepEqual(body.registro.tiposArreglo, [{ id: 3, nombre: 'Cambio de cubiertas', detalle: null }]);
    assert.equal(body.registro.responsable, 'Gomería Río Tercero');
    assert.equal(db.mantenimientosRealizados.at(-1).responsableId, 1);
    assert.equal(db.mantenimientosRealizados.at(-1).planMantenimientoId, null);
    assert.equal(planDe(7).kmUltimoService, 500);
  });

  test('el responsable es opcional y no crea plan', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1] });
    assert.equal(status, 201);
    assert.equal(body.registro.responsable, null);
    assert.equal(planDe(7), undefined);
  });

  test('un responsable que no está en el catálogo → 400', async () => {
    for (const responsableId of [99, 'abc', 0]) {
      const { status, body } = await arreglo({ tiposArregloIds: [1], responsableId });
      assert.equal(status, 400);
      assert.equal(body.errores.responsableId, 'El responsable no existe');
    }
    assert.equal(db.mantenimientosRealizados.length, 0);
  });

  test('el responsable como texto (API vieja) → 400 que pide responsableId', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1], responsable: 'Gomería' });
    assert.equal(status, 400);
    assert.match(body.errores.responsable, /responsableId/);
  });

  test('guarda varios tipos en un solo registro, en el orden del catálogo', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [3, 1] });
    assert.equal(status, 201);
    assert.deepEqual(body.registro.tiposArreglo, [
      { id: 1, nombre: 'Engrase', detalle: null },
      { id: 3, nombre: 'Cambio de cubiertas', detalle: null },
    ]);
    assert.equal(db.mantenimientosRealizados.length, 1);
    assert.equal(db.mantenimientosTiposArreglo.length, 2);
  });

  test('ids repetidos se guardan una sola vez', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1, 1] });
    assert.equal(status, 201);
    assert.deepEqual(
      body.registro.tiposArreglo.map((t) => t.id),
      [1]
    );
  });

  test('lista vacía o que no es un array → 400', async () => {
    for (const tiposArregloIds of [[], 3, '3', null, {}]) {
      const { status, body } = await arreglo({ tiposArregloIds });
      assert.equal(status, 400, JSON.stringify(tiposArregloIds));
      assert.equal(body.errores.tiposArregloIds, 'Elegí al menos un tipo de trabajo');
    }
  });

  test('un tipo válido junto con uno inactivo o inexistente → 400 y no guarda nada', async () => {
    for (const tiposArregloIds of [[1, 9], [1, 77], [1, 'x']]) {
      const { status, body } = await arreglo({ tiposArregloIds });
      assert.equal(status, 400, JSON.stringify(tiposArregloIds));
      assert.equal(body.errores.tiposArregloIds, 'El tipo de trabajo no es válido');
    }
    assert.equal(db.mantenimientosRealizados.length, 0);
  });

  test('"Otro" guarda su detalle y la descripción es opcional', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1, 8], detallesTipos: { 8: '  Cambio de espejo ' } });
    assert.equal(status, 201);
    assert.deepEqual(body.registro.tiposArreglo, [
      { id: 1, nombre: 'Engrase', detalle: null },
      { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' },
    ]);
    assert.equal(body.registro.descripcion, null);
  });

  test('"Otro" sin detalle, con detalle vacío o de más de 60 → 400', async () => {
    const casos = [
      [undefined, 'Contá qué trabajo se hizo (obligatorio para "Otro")'],
      [{}, 'Contá qué trabajo se hizo (obligatorio para "Otro")'],
      [{ 8: '   ' }, 'Contá qué trabajo se hizo (obligatorio para "Otro")'],
      [{ 8: 'x'.repeat(61) }, 'Hasta 60 caracteres'],
    ];
    for (const [detallesTipos, mensaje] of casos) {
      const { status, body } = await arreglo({ tiposArregloIds: [1, 8], detallesTipos, descripcion: 'Algo' });
      assert.equal(status, 400, JSON.stringify(detallesTipos));
      assert.equal(body.errores.detallesTipos, mensaje);
      assert.equal(body.errores.descripcion, undefined);
    }
    assert.equal(db.mantenimientosRealizados.length, 0);
    assert.equal((await arreglo({ tiposArregloIds: [8], detallesTipos: { 8: 'x'.repeat(60) } })).status, 201);
  });

  test('detalle para un tipo que no lo lleva o no está marcado → 400', async () => {
    const noLleva = await arreglo({ tiposArregloIds: [1], detallesTipos: { 1: 'x' } });
    assert.equal(noLleva.status, 400);
    assert.equal(noLleva.body.errores.detallesTipos, '"Engrase" no lleva detalle');

    const noMarcado = await arreglo({ tiposArregloIds: [1], detallesTipos: { 8: 'x' } });
    assert.equal(noMarcado.status, 400);
    assert.equal(noMarcado.body.errores.detallesTipos, 'El detalle es de un tipo que no está marcado');
  });

  test('detallesTipos que no es un objeto, o con un detalle que no es texto → 400', async () => {
    for (const detallesTipos of ['x', [1], 5]) {
      const { status, body } = await arreglo({ tiposArregloIds: [8], detallesTipos });
      assert.equal(status, 400, JSON.stringify(detallesTipos));
      assert.equal(body.errores.detallesTipos, 'Los detalles de los tipos no son válidos');
    }
    const noTexto = await arreglo({ tiposArregloIds: [8], detallesTipos: { 8: 5 } });
    assert.equal(noTexto.body.errores.detallesTipos, 'Los detalles de los tipos no son válidos');
  });

  test('rechaza tipoArregloId (formato viejo)', async () => {
    const { status, body } = await arreglo({ tipoArregloId: 3 });
    assert.equal(status, 400);
    assert.equal(body.errores.tipoArregloId, 'Ahora se mandan varios tipos en "tiposArregloIds"');
  });

  test('sin tipo, con un tipo inactivo o inexistente → 400', async () => {
    const sinTipo = await arreglo({});
    assert.equal(sinTipo.status, 400);
    assert.ok(sinTipo.body.errores.tiposArregloIds);

    const inactivo = await arreglo({ tiposArregloIds: [9] });
    assert.equal(inactivo.status, 400);
    assert.ok(inactivo.body.errores.tiposArregloIds);

    const inexistente = await arreglo({ tiposArregloIds: [77] });
    assert.equal(inexistente.status, 400);
  });

  test('"Otro" solo, sin detalle → 400 en el detalle, no en la descripción', async () => {
    const sin = await arreglo({ tiposArregloIds: [8], descripcion: '   ' });
    assert.equal(sin.status, 400);
    assert.match(sin.body.errores.detallesTipos, /"Otro"/);
    assert.equal(sin.body.errores.descripcion, undefined);
  });

  test('rechaza el costo', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1], costo: 5000 });
    assert.equal(status, 400);
    assert.ok(body.errores.costo);
  });

  test('con km mayor al odómetro también crea la lectura', async () => {
    const { status } = await arreglo({ tiposArregloIds: [4], kilometraje: 3500 });
    assert.equal(status, 201);
    assert.equal(db.lecturas.length, 1);
    assert.equal(vehiculo(7).kilometraje, 3500);
  });

  test('con km menor al odómetro → 400 y no guarda nada; igual al odómetro se acepta', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [4], kilometraje: 999 });
    assert.equal(status, 400);
    assert.match(body.errores.kilometraje, /menor al odómetro actual \(1000 km\)/);
    assert.equal(db.mantenimientosRealizados.length, 0);

    const igual = await arreglo({ tiposArregloIds: [4], kilometraje: 1000 });
    assert.equal(igual.status, 201);
    assert.equal(db.lecturas.length, 0);
  });

  test('un arreglo anterior acepta menos km, sin lectura ni cambio de odómetro', async () => {
    const { status } = await arreglo({ tiposArregloIds: [4], kilometraje: 500, fecha: diaCordoba(-30), esAnterior: true });
    assert.equal(status, 201);
    assert.equal(db.mantenimientosRealizados.length, 1);
    assert.equal(db.lecturas.length, 0);
    assert.equal(vehiculo(7).kilometraje, 1000);
  });

  test('un arreglo anterior con km igual o mayor al odómetro → 400', async () => {
    for (const kilometraje of [1000, 3500]) {
      const { status, body } = await arreglo({ tiposArregloIds: [4], kilometraje, esAnterior: true });
      assert.equal(status, 400);
      assert.match(body.errores.kilometraje, /anterior tiene que tener menos km/);
    }
    assert.equal(db.mantenimientosRealizados.length, 0);
  });

  test('esAnterior que no es booleano → 400; el service lo rechaza', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [4], kilometraje: 500, esAnterior: 'si' });
    assert.equal(status, 400);
    assert.ok(body.errores.esAnterior);

    const service = await pedirJson('/services', {
      metodo: 'POST',
      body: { vehiculoId: 7, fecha: HOY, kilometraje: 500, esAnterior: true },
      perfil: 'PERSONAL_TALLER',
    });
    assert.equal(service.status, 400);
    assert.ok(service.body.errores.esAnterior);
  });

  test('fecha futura y vehículo dado de baja → 400', async () => {
    const { status, body } = await arreglo({ tiposArregloIds: [1], vehiculoId: 10, fecha: diaCordoba(2) });
    assert.equal(status, 400);
    assert.ok(body.errores.fecha);
    assert.ok(body.errores.vehiculoId);
  });
});

describe('GET /historial', () => {
  function sembrarHistorial() {
    cambiarTipo(9, 3, 'Trafic');
    vehiculo(9).numeroInterno = '2';
    sembrarRegistro({ vehiculoId: 7, fecha: '2026-01-10', kilometraje: 10000, observaciones: 'Service enero' });
    sembrarRegistro({ vehiculoId: 7, tiposArregloIds: [1, 3], fecha: '2026-02-15', kilometraje: 15000, responsableId: 1 });
    sembrarRegistro({ vehiculoId: 9, tiposArregloIds: [4], fecha: '2026-03-20', kilometraje: 5000 });
    sembrarRegistro({ vehiculoId: 10, fecha: '2026-04-01', kilometraje: 80000 }); // dado de baja: su historial se ve
    sembrarRegistro({ vehiculoId: 9, fecha: '2026-05-05', kilometraje: 8000 });
  }

  test('toda la flota, más reciente primero, con vehículo y usuario', async () => {
    sembrarHistorial();
    const { status, body } = await pedirJson('/historial');
    assert.equal(status, 200);
    assert.equal(body.total, 5);
    assert.equal(body.pagina, 1);
    assert.equal(body.porPagina, 30);
    assert.equal(body.vehiculo, null);
    assert.deepEqual(
      body.items.map((i) => i.fecha.slice(0, 10)),
      ['2026-05-05', '2026-04-01', '2026-03-20', '2026-02-15', '2026-01-10']
    );
    const arreglo = body.items.find((i) => i.tipo === 'ARREGLO' && i.responsable);
    assert.equal(arreglo.responsable, 'Gomería Río Tercero');
    assert.equal(arreglo.vehiculo.marca, 'Mercedes');
    assert.equal(arreglo.vehiculo.modelo, 'O500');
    assert.equal(arreglo.usuario, 'Ana Pérez');
  });

  test('filtra por tipo, tipo de arreglo, tipo de vehículo y fechas', async () => {
    sembrarHistorial();
    const services = (await pedirJson('/historial?tipo=SERVICE')).body;
    assert.equal(services.total, 3);
    assert.ok(services.items.every((i) => i.tipo === 'SERVICE'));

    const frenos = (await pedirJson('/historial?tipoArregloId=4')).body;
    assert.equal(frenos.total, 1);
    assert.deepEqual(
      frenos.items[0].tiposArreglo.map((t) => t.nombre),
      ['Frenos']
    );

    // Un arreglo con varios tipos aparece al filtrar por cualquiera de ellos.
    for (const id of [1, 3]) {
      const filtrado = (await pedirJson(`/historial?tipoArregloId=${id}`)).body;
      assert.equal(filtrado.total, 1);
      assert.deepEqual(
        filtrado.items[0].tiposArreglo.map((t) => t.nombre),
        ['Engrase', 'Cambio de cubiertas']
      );
    }

    const trafic = (await pedirJson('/historial?tipoVehiculoId=3')).body;
    assert.equal(trafic.total, 2);

    const rango = (await pedirJson('/historial?desde=2026-02-15&hasta=2026-03-20')).body;
    assert.deepEqual(rango.items.map((i) => i.fecha.slice(0, 10)), ['2026-03-20', '2026-02-15']);
  });

  test('busca por interno, dominio o marca', async () => {
    sembrarHistorial();
    assert.equal((await pedirJson('/historial?busqueda=ae454')).body.total, 2);
    assert.equal((await pedirJson('/historial?busqueda=12')).body.total, 2);
    assert.equal((await pedirJson('/historial?busqueda=mercedes')).body.total, 5);
    assert.equal((await pedirJson('/historial?busqueda=volvo')).body.total, 0);
  });

  test('con vehiculoId filtra y trae el estado del service del vehículo', async () => {
    sembrarHistorial();
    sembrarPlan(7, 0);
    const { body } = await pedirJson('/historial?vehiculoId=7');
    assert.equal(body.total, 2);
    assert.equal(body.vehiculo.vehiculo.id, 7);
    assert.equal(body.vehiculo.estado, 'AL_DIA');

    const inexistente = await pedirJson('/historial?vehiculoId=999');
    assert.equal(inexistente.status, 404);
  });

  test('pagina con pagina y porPagina', async () => {
    sembrarHistorial();
    const primera = (await pedirJson('/historial?porPagina=2')).body;
    assert.equal(primera.items.length, 2);
    assert.equal(primera.total, 5);
    const tercera = (await pedirJson('/historial?porPagina=2&pagina=3')).body;
    assert.deepEqual(tercera.items.map((i) => i.fecha.slice(0, 10)), ['2026-01-10']);
  });

  test('ordena por más antiguo, km y número de interno (orden natural)', async () => {
    sembrarHistorial();
    const antiguo = (await pedirJson('/historial?orden=fecha_asc')).body.items;
    assert.equal(antiguo[0].fecha.slice(0, 10), '2026-01-10');

    const km = (await pedirJson('/historial?orden=km_desc')).body.items.map((i) => i.kilometraje);
    assert.deepEqual(km, [80000, 15000, 10000, 8000, 5000]);

    // Interno "2" antes que "12" y "15"; dentro de cada vehículo, más reciente primero.
    const interno = (await pedirJson('/historial?orden=interno&porPagina=4')).body;
    assert.deepEqual(
      interno.items.map((i) => `${i.vehiculo.numeroInterno}@${i.fecha.slice(0, 10)}`),
      ['2@2026-05-05', '2@2026-03-20', '12@2026-02-15', '12@2026-01-10']
    );
    assert.equal(interno.total, 5);
  });

  test('cada tipo trae su detalle ("Otro") o null', async () => {
    sembrarRegistro({ vehiculoId: 7, tiposArregloIds: [1, 8], detalles: { 8: 'Cambio de espejo' }, fecha: '2026-06-01' });
    const { body } = await pedirJson('/historial?tipoArregloId=8');
    assert.deepEqual(body.items[0].tiposArreglo, [
      { id: 1, nombre: 'Engrase', detalle: null },
      { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' },
    ]);
  });

  test('parámetros inválidos → 400', async () => {
    const { status, body } = await pedirJson('/historial?tipo=OTRO&orden=x&desde=ayer');
    assert.equal(status, 400);
    assert.ok(body.errores.tipo);
    assert.ok(body.errores.orden);
    assert.ok(body.errores.desde);
  });
});

describe('GET /evaluar-viaje', () => {
  test('avisa si el viaje hace pasar el service, o si ya está vencido', async () => {
    sembrarPlan(7, 1000); // próximo a los 21.000
    vehiculo(7).kilometraje = 20000;

    let { body } = await pedirJson('/evaluar-viaje?vehiculoId=7&kilometrosEstimados=500', { perfil: 'ENCARGADO' });
    assert.equal(body.advertencia.tieneAdvertencia, false);

    ({ body } = await pedirJson('/evaluar-viaje?vehiculoId=7&kilometrosEstimados=1200', { perfil: 'ENCARGADO' }));
    assert.equal(body.advertencia.tieneAdvertencia, true);
    assert.equal(body.advertencia.superaEnViaje, true);
    assert.equal(body.advertencia.kmFinalEstimado, 21200);
    assert.equal(body.advertencia.kmProximoService, 21000);
    assert.match(body.advertencia.mensaje, /21\.200 km/);

    vehiculo(7).kilometraje = 21500;
    ({ body } = await pedirJson('/evaluar-viaje?vehiculoId=7&kilometrosEstimados=200', { perfil: 'ENCARGADO' }));
    assert.equal(body.advertencia.yaVencido, true);
    assert.equal(body.advertencia.kmExcedidos, 500);
  });

  test('sin plan o dado de baja no avisa', async () => {
    let { body } = await pedirJson('/evaluar-viaje?vehiculoId=9&kilometrosEstimados=50000');
    assert.equal(body.advertencia.tieneAdvertencia, false);

    sembrarPlan(10, 0);
    vehiculo(10).kilometraje = 50000;
    ({ body } = await pedirJson('/evaluar-viaje?vehiculoId=10&kilometrosEstimados=10'));
    assert.equal(body.advertencia.tieneAdvertencia, false);
  });
});

describe('Permisos', () => {
  const RUTAS = [
    ['GET', '/tipos-arreglo'],
    ['GET', '/planes'],
    ['POST', '/planes'],
    ['POST', '/services'],
    ['POST', '/arreglos'],
    ['GET', '/historial'],
    ['GET', '/evaluar-viaje?vehiculoId=7'],
  ];

  test('CHOFER → 403 en todo el módulo', async () => {
    for (const [metodo, ruta] of RUTAS) {
      const res = await pedir(ruta, { metodo, body: metodo === 'POST' ? {} : undefined, perfil: 'CHOFER' });
      assert.equal(res.status, 403, `${metodo} ${ruta}`);
    }
  });

  test('sin token → 401', async () => {
    for (const [metodo, ruta] of RUTAS) {
      const res = await pedir(ruta, { metodo, token: null });
      assert.equal(res.status, 401, `${metodo} ${ruta}`);
    }
  });

  test('PERSONAL_TALLER y ENCARGADO pueden usar el módulo', async () => {
    assert.equal((await pedir('/planes', { perfil: 'PERSONAL_TALLER' })).status, 200);
    assert.equal((await pedir('/historial', { perfil: 'ENCARGADO' })).status, 200);
  });
});
