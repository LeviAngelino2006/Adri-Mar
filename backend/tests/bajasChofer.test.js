// Tests de la baja y la deshabilitación de quien maneja (H6 y H7 de
// docs/auditoria-ux/personal-usuarios.md, tanda 2): un chofer con viajes
// Programados, de cualquier fecha, no se da de baja ni se deshabilita hasta
// reasignarlos (409 con la lista); sus candidaturas en viajes A confirmar no
// bloquean y se borran en la misma transacción. Los escenarios salen de G5, G5b
// y G6 de las pruebas contra la API de la auditoría (Ramiro con los viajes 6 y 7,
// Federico con el 8 y los dos candidatos del viaje 11).
//
// Levantan la app real con un JWT real, la sesión tomada del token
// (helpers/sesionDelToken.js) y Prisma en memoria con estado
// (helpers/prismaFalsoCuentas.js): NO tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');
const { crearCuentas } = require('./helpers/prismaFalsoCuentas');
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');

const { prisma, db, sembrar, perfilPorId, estadoPorId } = crearCuentas();
instalarEnCache(SRC, prisma);
instalarSesionDelToken(SRC);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

const ADMIN_EXTERNO = { id: 999, personaId: 999, perfil: 'ADMINISTRADOR' };

async function pedir(metodo, ruta, { como = ADMIN_EXTERNO, body } = {}) {
  const token = generarToken({ ...como, nombreUsuario: `test-${como.id}`, habilitadoParaConducir: false });
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const persona = (id) => db.personas.find((p) => p.id === id);
const estadoCuentaDe = (personaId) =>
  estadoPorId(db.usuarios.find((u) => u.personaId === personaId).estadoUsuarioId).descripcion;
const candidaturasDe = (personaId) => db.candidatos.filter((c) => c.personaId === personaId).map((c) => c.viajeId);

function datosDe(id, cambios = {}) {
  const p = persona(id);
  return {
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni,
    perfil: perfilPorId(p.perfilId).descripcion,
    habilitadoParaConducir: p.habilitadoParaConducir,
    ...cambios,
  };
}

const RAMIRO = 14;
const LUCIA = 3; // Encargada habilitada para conducir.
const FEDERICO = 15;

// Fechas de Córdoba (UTC-3) de la auditoría.
const fecha = (dia, hora = '06:30') => new Date(`${dia}T${hora}:00-03:00`);

beforeEach(() => {
  sembrar();
  db.personas.push({
    ...persona(RAMIRO),
    id: FEDERICO,
    nombre: 'Federico',
    apellido: 'Luna',
    dni: '30000015',
  });
  db.viajes.push(
    // Ramiro: dos Programados (G5b). El 7 va primero en el arreglo para ver que
    // la respuesta los ordena por fecha.
    { id: 7, estado: 'PROGRAMADO', choferId: RAMIRO, fechaInicio: fecha('2026-11-02'), origen: 'Río Tercero', destino: 'Villa Carlos Paz' },
    { id: 6, estado: 'PROGRAMADO', choferId: RAMIRO, fechaInicio: fecha('2026-10-30'), origen: 'Río Tercero', destino: 'Rosario' },
    { id: 3, estado: 'FINALIZADO', choferId: RAMIRO, fechaInicio: fecha('2026-10-10'), origen: 'Río Tercero', destino: 'Córdoba' },
    // Lucía: uno Programado (lo maneja aunque sea Encargada).
    { id: 8, estado: 'PROGRAMADO', choferId: LUCIA, fechaInicio: fecha('2026-10-31'), origen: 'Río Tercero', destino: 'Almafuerte' },
    // El A confirmar con candidatos (G5) y uno cancelado que todavía los guarda.
    { id: 11, estado: 'A_CONFIRMAR', choferId: null, fechaInicio: fecha('2026-11-05'), origen: 'Río Tercero', destino: 'Mendoza' },
    { id: 12, estado: 'CANCELADO', choferId: null, fechaInicio: fecha('2026-10-20'), origen: 'Río Tercero', destino: 'Embalse' }
  );
  db.candidatos.push(
    { viajeId: 11, personaId: RAMIRO },
    { viajeId: 11, personaId: LUCIA },
    { viajeId: 11, personaId: FEDERICO },
    { viajeId: 12, personaId: FEDERICO }
  );
});

describe('H6: dar de baja a quien tiene viajes Programados', () => {
  test('G5b: Ramiro con dos Programados → 409 con la lista ordenada por fecha, y nada cambia', async () => {
    const { status, json } = await pedir('PATCH', `/personas/${RAMIRO}/baja`);

    assert.equal(status, 409);
    assert.equal(json.error, 'Tiene 2 viajes programados. Reasignalos antes de darla de baja.');
    assert.deepEqual(json.viajes, [
      { id: 6, fecha: '2026-10-30T09:30:00.000Z', origen: 'Río Tercero', destino: 'Rosario' },
      { id: 7, fecha: '2026-11-02T09:30:00.000Z', origen: 'Río Tercero', destino: 'Villa Carlos Paz' },
    ]);
    // Ni la persona, ni la cuenta, ni las candidaturas.
    assert.equal(persona(RAMIRO).activo, true);
    assert.equal(estadoCuentaDe(RAMIRO), 'ACTIVO');
    assert.deepEqual(candidaturasDe(RAMIRO), [11]);
  });

  test('con uno solo, el mensaje va en singular', async () => {
    db.viajes.splice(db.viajes.findIndex((v) => v.id === 7), 1);

    const { status, json } = await pedir('PATCH', `/personas/${RAMIRO}/baja`);

    assert.equal(status, 409);
    assert.equal(json.error, 'Tiene 1 viaje programado. Reasignalo antes de darla de baja.');
    assert.deepEqual(json.viajes.map((v) => v.id), [6]);
  });

  test('un Programado de una fecha que ya pasó también bloquea', async () => {
    db.viajes.splice(0, db.viajes.length, {
      id: 5,
      estado: 'PROGRAMADO',
      choferId: RAMIRO,
      fechaInicio: fecha('2026-09-01'),
      origen: 'Río Tercero',
      destino: 'Córdoba',
    });

    const { status, json } = await pedir('PATCH', `/personas/${RAMIRO}/baja`);

    assert.equal(status, 409);
    assert.deepEqual(json.viajes.map((v) => v.id), [5]);
  });

  test('un Programado sin origen ni destino cargados viaja con null', async () => {
    db.viajes.splice(0, db.viajes.length, { id: 5, estado: 'PROGRAMADO', choferId: RAMIRO, fechaInicio: fecha('2026-11-01') });

    const { json } = await pedir('PATCH', `/personas/${RAMIRO}/baja`);

    assert.deepEqual(json.viajes, [{ id: 5, fecha: '2026-11-01T09:30:00.000Z', origen: null, destino: null }]);
  });

  test('con solo candidaturas pasa: las de A confirmar se borran y la respuesta dice cuántas', async () => {
    const { status, json } = await pedir('PATCH', `/personas/${FEDERICO}/baja`);

    assert.equal(status, 200);
    assert.equal(json.persona.activo, false);
    assert.equal(json.candidaturasQuitadas, 1);
    // La del viaje cancelado queda (es historia); las de los demás, también.
    assert.deepEqual(candidaturasDe(FEDERICO), [12]);
    assert.deepEqual(candidaturasDe(RAMIRO), [11]);
    assert.deepEqual(candidaturasDe(LUCIA), [11]);
  });

  test('sin viajes ni candidaturas, candidaturasQuitadas es 0', async () => {
    const { status, json } = await pedir('PATCH', '/personas/7/baja');

    assert.equal(status, 200);
    assert.equal(json.candidaturasQuitadas, 0);
  });

  test('En viaje sigue como antes: 409 con su mensaje, aunque además tenga Programados', async () => {
    db.viajes.push({ id: 9, estado: 'EN_VIAJE', choferId: RAMIRO, fechaInicio: fecha('2026-10-25') });

    const { status, json } = await pedir('PATCH', `/personas/${RAMIRO}/baja`);

    assert.equal(status, 409);
    assert.equal(
      json.error,
      'La persona tiene un viaje En viaje en curso como chofer. Debe finalizarse antes de darla de baja.'
    );
    assert.equal(json.viajes, undefined);
  });
});

describe('H7: deshabilitar para conducir a quien tiene viajes Programados', () => {
  test('G6: Lucía con un Programado → 409 con la lista, y sigue habilitada', async () => {
    const { status, json } = await pedir('PUT', `/personas/${LUCIA}`, {
      body: datosDe(LUCIA, { habilitadoParaConducir: false }),
    });

    assert.equal(status, 409);
    assert.equal(json.error, 'Tiene 1 viaje programado. Reasignalo antes de deshabilitarla.');
    assert.deepEqual(json.viajes, [
      { id: 8, fecha: '2026-10-31T09:30:00.000Z', origen: 'Río Tercero', destino: 'Almafuerte' },
    ]);
    assert.equal(persona(LUCIA).habilitadoParaConducir, true);
    assert.deepEqual(candidaturasDe(LUCIA), [11]);
  });

  test('con solo candidaturas pasa: se borran y la respuesta dice cuántas', async () => {
    db.viajes.splice(db.viajes.findIndex((v) => v.id === 8), 1);

    const { status, json } = await pedir('PUT', `/personas/${LUCIA}`, {
      body: datosDe(LUCIA, { habilitadoParaConducir: false }),
    });

    assert.equal(status, 200);
    assert.equal(json.persona.habilitadoParaConducir, false);
    assert.equal(json.candidaturasQuitadas, 1);
    assert.deepEqual(candidaturasDe(LUCIA), []);
    assert.deepEqual(candidaturasDe(RAMIRO), [11]);
  });

  test('las candidaturas se borran en la misma transacción: si el cambio falla, vuelven', async () => {
    db.viajes.splice(db.viajes.findIndex((v) => v.id === 8), 1);

    // El DNI de Ramiro: la actualización choca con el único después de borrar.
    const { status, json } = await pedir('PUT', `/personas/${LUCIA}`, {
      body: datosDe(LUCIA, { habilitadoParaConducir: false, dni: persona(RAMIRO).dni }),
    });

    assert.equal(status, 400);
    assert.deepEqual(json.errores, { dni: 'Ese DNI ya está registrado' });
    assert.equal(persona(LUCIA).habilitadoParaConducir, true);
    assert.deepEqual(candidaturasDe(LUCIA), [11]);
  });

  test('editar otros datos sin tocar la habilitación no mira los viajes ni las candidaturas', async () => {
    const { status, json } = await pedir('PUT', `/personas/${LUCIA}`, {
      body: datosDe(LUCIA, { telefono: '3571 40-0003' }),
    });

    assert.equal(status, 200);
    assert.equal(json.candidaturasQuitadas, 0);
    assert.deepEqual(candidaturasDe(LUCIA), [11]);
  });

  test('mandar false a quien ya no estaba habilitado no es deshabilitar', async () => {
    const hugo = 7;
    db.viajes.push({ id: 20, estado: 'PROGRAMADO', choferId: hugo, fechaInicio: fecha('2026-11-10') });

    const { status } = await pedir('PUT', `/personas/${hugo}`, { body: datosDe(hugo, { habilitadoParaConducir: false }) });

    assert.equal(status, 200);
  });

  test('En viaje sigue como antes: 409 con su mensaje', async () => {
    db.viajes.push({ id: 9, estado: 'EN_VIAJE', choferId: LUCIA, fechaInicio: fecha('2026-10-25') });

    const { status, json } = await pedir('PUT', `/personas/${LUCIA}`, {
      body: datosDe(LUCIA, { habilitadoParaConducir: false }),
    });

    assert.equal(status, 409);
    assert.equal(
      json.error,
      'La persona tiene un viaje En viaje en curso como chofer. Debe finalizarse antes de deshabilitarla para conducir.'
    );
  });
});
