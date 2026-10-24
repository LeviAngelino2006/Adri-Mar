// Tests de los pendientes administrativos del listado de viajes: la regla de
// cada badge (pendienteAdministrativo), que el filtro de la base
// (FILTRO_ADMINISTRATIVO_PENDIENTE) diga exactamente lo mismo, y que solo
// Administrador/Encargado reciban el dato o puedan usar el filtro.
//
// App real de Express con JWT real y un doble de Prisma en memoria (mismo
// enfoque que viajes.test.js): no tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Fixtures ----------------------------------------------------------------

function viaje(id, { estado = 'PROGRAMADO', precio = null, estadoPago = null } = {}) {
  return {
    id,
    estadoViaje: { descripcion: estado },
    precio,
    estadoPagoClienteId: estadoPago ? { PENDIENTE: 1, PAGADO: 2, PARCIAL: 3 }[estadoPago] : null,
    estadoPagoCliente: estadoPago ? { id: 1, descripcion: estadoPago } : null,
    choferId: null,
    chofer: null,
    vehiculoId: null,
    vehiculo: null,
    origenId: null,
    origen: null,
    destinoId: null,
    destino: null,
    clienteId: null,
    cliente: null,
    paradas: [],
    choferesCandidatos: [],
    vehiculosCandidatos: [],
    metodoPagoClienteId: null,
    metodoPagoCliente: null,
    fechaPagoCliente: null,
    pagoChofer: null,
    estadoPagoChoferId: null,
    estadoPagoChofer: null,
    fechaPagoChofer: null,
    metodoPagoChoferId: null,
    metodoPagoChofer: null,
    fechaInicio: null,
    fechaFin: null,
    kilometrosEstimados: null,
    cantidadPasajeros: null,
    horaInicioReal: null,
    horaFinReal: null,
    observacionFinal: null,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
  };
}

// [nombre, viaje, pendiente esperado]
const CASOS = [
  // SIN_PRECIO: cualquier estado salvo CANCELADO.
  ['PROGRAMADO sin precio', viaje(1), 'SIN_PRECIO'],
  ['PROGRAMADO sin precio y con estado de pago PAGADO', viaje(2, { estadoPago: 'PAGADO' }), 'SIN_PRECIO'],
  ['A_CONFIRMAR sin precio', viaje(3, { estado: 'A_CONFIRMAR' }), 'SIN_PRECIO'],
  ['EN_VIAJE sin precio', viaje(4, { estado: 'EN_VIAJE' }), 'SIN_PRECIO'],
  ['FINALIZADO sin precio', viaje(5, { estado: 'FINALIZADO' }), 'SIN_PRECIO'],
  // Con precio y sin cobrar, antes de finalizar: no es un pendiente.
  ['PROGRAMADO con precio y sin estado de pago', viaje(6, { precio: '1000.00' }), null],
  ['PROGRAMADO con precio y PENDIENTE', viaje(7, { precio: '1000.00', estadoPago: 'PENDIENTE' }), null],
  ['A_CONFIRMAR con precio y sin estado de pago', viaje(8, { estado: 'A_CONFIRMAR', precio: '1000.00' }), null],
  ['EN_VIAJE con precio y PARCIAL', viaje(9, { estado: 'EN_VIAJE', precio: '1000.00', estadoPago: 'PARCIAL' }), null],
  ['PROGRAMADO con precio y PAGADO', viaje(10, { precio: '1000.00', estadoPago: 'PAGADO' }), null],
  // COBRO_PENDIENTE: solo FINALIZADO con precio y pago distinto de PAGADO.
  ['FINALIZADO con precio y sin estado de pago', viaje(11, { estado: 'FINALIZADO', precio: '1000.00' }), 'COBRO_PENDIENTE'],
  ['FINALIZADO con precio y PENDIENTE', viaje(12, { estado: 'FINALIZADO', precio: '5.00', estadoPago: 'PENDIENTE' }), 'COBRO_PENDIENTE'],
  ['FINALIZADO con precio y PARCIAL', viaje(13, { estado: 'FINALIZADO', precio: '5.00', estadoPago: 'PARCIAL' }), 'COBRO_PENDIENTE'],
  ['FINALIZADO con precio 0 y PENDIENTE (0 es un precio cargado)', viaje(14, { estado: 'FINALIZADO', precio: '0.00', estadoPago: 'PENDIENTE' }), 'COBRO_PENDIENTE'],
  ['FINALIZADO con precio y PAGADO', viaje(15, { estado: 'FINALIZADO', precio: '1000.00', estadoPago: 'PAGADO' }), null],
  // CANCELADO: nunca.
  ['CANCELADO sin precio', viaje(16, { estado: 'CANCELADO' }), null],
  ['CANCELADO con precio sin cobrar', viaje(17, { estado: 'CANCELADO', precio: '10.00', estadoPago: 'PENDIENTE' }), null],
];

// Evalúa un `where` de Prisma sobre una fila en memoria (ver el helper): si el
// filtro empieza a usar algo que el evaluador no conoce, falla en vez de dar un
// resultado inventado.
const { cumple } = require('./helpers/whereEnMemoria');

// --- Doble de Prisma -----------------------------------------------------------

const llamadasFindMany = [];
let filas = [];

const prismaFalso = {
  viaje: {
    findMany: async (args) => {
      llamadasFindMany.push(args);
      return args.where ? filas.filter((f) => cumple(f, args.where)) : filas;
    },
  },
  lecturaOdometro: { findFirst: async () => null },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const { pendienteAdministrativo, FILTRO_ADMINISTRATIVO_PENDIENTE } = require(path.join(SRC, 'services', 'viajeService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  llamadasFindMany.length = 0;
  filas = CASOS.map(([, v]) => v);
});

async function pedir(ruta, perfil) {
  const respuesta = await fetch(`${base}${ruta}`, {
    headers: { Authorization: `Bearer ${generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil, habilitadoParaConducir: true })}` },
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

// --- Tests ---------------------------------------------------------------------

describe('pendientes administrativos: la regla', () => {
  for (const [nombre, v, esperado] of CASOS) {
    test(`${nombre} -> ${esperado ?? 'sin pendiente'}`, () => {
      assert.equal(pendienteAdministrativo(v), esperado);
    });
  }

  test('el filtro de la base dice exactamente lo mismo que la regla, caso por caso', () => {
    for (const [nombre, v, esperado] of CASOS) {
      assert.equal(cumple(v, FILTRO_ADMINISTRATIVO_PENDIENTE), esperado !== null, nombre);
    }
  });
});

describe('GET /viajes?administrativoPendiente=true', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil}: 200, filtra en la base y trae solo los que tienen badge`, async () => {
      const { status, json } = await pedir('/viajes?administrativoPendiente=true', perfil);

      assert.equal(status, 200);
      assert.deepEqual(llamadasFindMany[0].where.AND, [FILTRO_ADMINISTRATIVO_PENDIENTE]);
      const esperados = CASOS.filter(([, , p]) => p !== null).map(([, v]) => v.id);
      assert.deepEqual(json.viajes.map((v) => v.id), esperados);
      assert.ok(json.viajes.every((v) => v.pendienteAdministrativo !== null));
    });
  }

  test('se combina con los otros filtros (estado)', async () => {
    const { status } = await pedir('/viajes?administrativoPendiente=true&estado=FINALIZADO', 'ADMINISTRADOR');
    assert.equal(status, 200);
    const { where } = llamadasFindMany[0];
    assert.deepEqual(where.estadoViaje, { descripcion: { equals: 'FINALIZADO' } });
    assert.deepEqual(where.AND, [FILTRO_ADMINISTRATIVO_PENDIENTE]);
  });

  for (const valor of ['false', '1', '']) {
    test(`administrativoPendiente=${JSON.stringify(valor)} no filtra (solo 'true' activa el filtro)`, async () => {
      const { status } = await pedir(`/viajes?administrativoPendiente=${valor}`, 'ADMINISTRADOR');
      assert.equal(status, 200);
      assert.ok(!('AND' in llamadasFindMany[0].where));
    });
  }

  test('PERSONAL_TALLER: 403 y no se consulta la base', async () => {
    const { status, json } = await pedir('/viajes?administrativoPendiente=true', 'PERSONAL_TALLER');
    assert.equal(status, 403);
    assert.ok(json.error);
    assert.equal(llamadasFindMany.length, 0);
  });

  test('CHOFER: 403 (no accede al listado general)', async () => {
    const { status } = await pedir('/viajes?administrativoPendiente=true', 'CHOFER');
    assert.equal(status, 403);
    assert.equal(llamadasFindMany.length, 0);
  });
});

describe('pendienteAdministrativo en la respuesta', () => {
  test('ADMINISTRADOR lo recibe en cada viaje del listado, con el valor de la regla', async () => {
    const { json } = await pedir('/viajes', 'ADMINISTRADOR');
    const porId = new Map(json.viajes.map((v) => [v.id, v.pendienteAdministrativo]));
    for (const [nombre, v, esperado] of CASOS) {
      assert.equal(porId.get(v.id), esperado, nombre);
    }
  });

  test('PERSONAL_TALLER no recibe la clave (ni precio ni estado de pago)', async () => {
    const { status, json } = await pedir('/viajes', 'PERSONAL_TALLER');
    assert.equal(status, 200);
    assert.ok(json.viajes.length > 0);
    for (const v of json.viajes) {
      assert.ok(!('pendienteAdministrativo' in v));
      assert.ok(!('precio' in v));
      assert.ok(!('estadoPagoCliente' in v));
    }
  });

  test('CHOFER en /mis-viajes no recibe la clave, aunque mande el parámetro del filtro', async () => {
    // Viajes de este chofer (id 10 del token), así la respuesta no viene vacía.
    filas = CASOS.map(([, v]) => ({ ...v, choferId: 10 }));
    const { status, json } = await pedir('/viajes/mis-viajes?administrativoPendiente=true', 'CHOFER');
    assert.equal(status, 200);
    assert.ok(!('AND' in llamadasFindMany[0].where), 'mis-viajes no aplica el filtro administrativo');
    assert.ok(json.viajes.length > 0);
    for (const v of json.viajes) assert.ok(!('pendienteAdministrativo' in v));
  });
});
