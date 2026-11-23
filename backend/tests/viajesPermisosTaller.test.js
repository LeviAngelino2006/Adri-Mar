// Visibilidad de viajes por perfil: Personal de Taller sin habilitación para
// conducir no ve ninguno; con habilitación ve solo los suyos; Chofer, Encargado y
// Administrador siguen igual. App real de Express con JWT real y un doble de
// Prisma en memoria que aplica el `where` (helpers/whereEnMemoria).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cumple, ordenar } = require('./helpers/whereEnMemoria');

const SRC = path.join(__dirname, '..', 'src');

const PERSONA_TALLER = 30;
const PERSONA_AJENA = 8;

const lugar = (id, nombre) => ({ id, nombre, nombreNormalizado: nombre.toLowerCase(), placeId: null, latitud: null, longitud: null });

function viaje(id, estado, choferId) {
  return {
    id,
    estadoViaje: { descripcion: estado },
    fechaInicio: new Date('2026-10-25T12:00:00Z'),
    fechaFin: null,
    precio: null,
    estadoPagoClienteId: null,
    estadoPagoCliente: null,
    choferId,
    chofer: choferId ? { id: choferId, nombre: 'Chofer', apellido: String(choferId), telefono: null } : null,
    vehiculoId: null,
    vehiculo: null,
    origenId: 1,
    origen: lugar(1, 'Río Tercero'),
    destinoId: 2,
    destino: lugar(2, 'Córdoba'),
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
    kilometrosEstimados: null,
    cantidadPasajeros: null,
    odometroInicial: null,
    odometroFinal: null,
    horaInicioReal: null,
    horaFinReal: null,
    observacionFinal: null,
    lecturasOdometro: [],
  };
}

const FILAS = [
  viaje(1, 'PROGRAMADO', PERSONA_TALLER),
  viaje(2, 'PROGRAMADO', PERSONA_AJENA),
  viaje(3, 'FINALIZADO', PERSONA_TALLER),
  viaje(4, 'A_CONFIRMAR', PERSONA_TALLER),
];

const prismaFalso = {
  viaje: {
    findMany: async (args) => ordenar(args.where ? FILAS.filter((f) => cumple(f, args.where)) : FILAS, args.orderBy),
    findUnique: async ({ where }) => FILAS.find((f) => f.id === where.id) ?? null,
    findFirst: async () => null,
  },
  persona: { findMany: async () => [] },
  vehiculo: { findMany: async () => [] },
  lecturaOdometro: { findFirst: async () => null, findMany: async () => [] },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
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

const SESIONES = {
  tallerSinHabilitacion: { perfil: 'PERSONAL_TALLER', personaId: PERSONA_TALLER, habilitadoParaConducir: false },
  tallerHabilitado: { perfil: 'PERSONAL_TALLER', personaId: PERSONA_TALLER, habilitadoParaConducir: true },
  chofer: { perfil: 'CHOFER', personaId: PERSONA_AJENA, habilitadoParaConducir: true },
  encargado: { perfil: 'ENCARGADO', personaId: 5, habilitadoParaConducir: false },
  administrador: { perfil: 'ADMINISTRADOR', personaId: 6, habilitadoParaConducir: false },
};

async function pedir(metodo, ruta, quien, body) {
  const token = generarToken({ id: 10, nombreUsuario: 'test', ...SESIONES[quien] });
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const idsDe = (json) => json.viajes.map((v) => v.id).sort((a, b) => a - b);

describe('Taller sin habilitación para conducir: no ve viajes', () => {
  test('el listado, Mis viajes y las opciones de filtros responden 403', async () => {
    for (const ruta of ['/viajes', '/viajes?vista=proximos', '/viajes/mis-viajes', '/viajes/opciones-filtros']) {
      const { status, json } = await pedir('GET', ruta, 'tallerSinHabilitacion');
      assert.equal(status, 403, ruta);
      assert.equal(json.viajes, undefined, ruta);
    }
  });

  test('comenzar y finalizar responden 403 aunque el viaje figure a su nombre', async () => {
    for (const accion of ['comenzar', 'finalizar']) {
      const { status } = await pedir('PATCH', `/viajes/1/${accion}`, 'tallerSinHabilitacion', { odometroInicial: 1, odometroFinal: 2 });
      assert.equal(status, 403, accion);
    }
  });
});

describe('Taller con habilitación: ve solo sus viajes', () => {
  test('el listado devuelve únicamente donde es el chofer (sin A confirmar)', async () => {
    const { status, json } = await pedir('GET', '/viajes', 'tallerHabilitado');
    assert.equal(status, 200);
    assert.deepEqual(idsDe(json), [1, 3]);
  });

  test('pedir el choferId de otra persona no amplía lo que ve', async () => {
    const { json } = await pedir('GET', `/viajes?choferId=${PERSONA_AJENA}`, 'tallerHabilitado');
    assert.deepEqual(idsDe(json), [1, 3]);
  });

  test('Mis viajes devuelve los suyos', async () => {
    const { status, json } = await pedir('GET', '/viajes/mis-viajes', 'tallerHabilitado');
    assert.equal(status, 200);
    assert.deepEqual(idsDe(json), [1, 3]);
  });

  test('no puede filtrar por datos administrativos ni pedir las opciones de filtros', async () => {
    assert.equal((await pedir('GET', '/viajes?administrativoPendiente=true', 'tallerHabilitado')).status, 403);
    assert.equal((await pedir('GET', '/viajes/opciones-filtros', 'tallerHabilitado')).status, 403);
  });

  test('un viaje ajeno no se puede comenzar ni finalizar (403)', async () => {
    for (const accion of ['comenzar', 'finalizar']) {
      const { status } = await pedir('PATCH', `/viajes/2/${accion}`, 'tallerHabilitado', { odometroInicial: 1, odometroFinal: 2 });
      assert.equal(status, 403, accion);
    }
  });

  test('sigue sin poder gestionar viajes', async () => {
    assert.equal((await pedir('POST', '/viajes', 'tallerHabilitado', {})).status, 403);
    assert.equal((await pedir('PUT', '/viajes/1', 'tallerHabilitado', {})).status, 403);
    assert.equal((await pedir('PATCH', '/viajes/1/cancelar', 'tallerHabilitado')).status, 403);
  });
});

describe('Chofer, Encargado y Administrador no cambian', () => {
  test('el Chofer ve solo los suyos en Mis viajes y no entra al listado de gestión', async () => {
    const propios = await pedir('GET', '/viajes/mis-viajes', 'chofer');
    assert.deepEqual(idsDe(propios.json), [2]);
    assert.equal((await pedir('GET', '/viajes', 'chofer')).status, 403);
  });

  test('Encargado y Administrador ven todos, con sus filtros y opciones', async () => {
    for (const quien of ['encargado', 'administrador']) {
      assert.deepEqual(idsDe((await pedir('GET', '/viajes', quien)).json), [1, 2, 3, 4], quien);
      assert.deepEqual(idsDe((await pedir('GET', `/viajes?choferId=${PERSONA_AJENA}`, quien)).json), [2], quien);
      assert.equal((await pedir('GET', '/viajes/opciones-filtros', quien)).status, 200, quien);
    }
  });
});
