// Tests del 409 de PATCH /viajes/:id/comenzar cuando el chofer o el vehículo ya
// tienen otro viaje En viaje: el mensaje que se le muestra a quien comienza.
//
// Levantan la app real de Express con un JWT real y el cliente de Prisma
// reemplazado por un doble en memoria: NO tocan la base de datos ni leen el
// .env. Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma -------------------------------------------------------

const CHOFER_ID = 5;
const VEHICULO_ID = 7;
const ESTADOS_VIAJE = { A_CONFIRMAR: 1, PROGRAMADO: 2, EN_VIAJE: 3 };

// Qué otro viaje En viaje encuentra el chequeo: 'vehiculo', 'chofer' o null.
let enCursoPor = null;
// Si la transacción choca contra el índice único (la carrera entre dos comienzos).
let chocaIndiceUnico = false;
let transacciones = 0;

const viajeProgramado = {
  id: 1,
  choferId: CHOFER_ID,
  vehiculoId: VEHICULO_ID,
  estadoViajeId: ESTADOS_VIAJE.PROGRAMADO,
  estadoViaje: { descripcion: 'PROGRAMADO' },
};

const prismaFalso = {
  viaje: {
    findUnique: async () => viajeProgramado,
    findFirst: async ({ where }) => {
      if (where.estadoViajeId !== ESTADOS_VIAJE.EN_VIAJE) return null;
      if (enCursoPor === 'vehiculo' && where.vehiculoId === VEHICULO_ID) return { id: 99 };
      if (enCursoPor === 'chofer' && where.choferId === CHOFER_ID) return { id: 99 };
      return null;
    },
  },
  usuario: {
    findUnique: async () => ({ id: CHOFER_ID, habilitadoParaConducir: true, estadoUsuario: { descripcion: 'ACTIVO' } }),
  },
  persona: {
    findUnique: async () => ({ id: CHOFER_ID, habilitadoParaConducir: true, activo: true }),
  },
  vehiculo: {
    findUnique: async () => ({ id: VEHICULO_ID, estadoVehiculo: { descripcion: 'OPERATIVO' } }),
  },
  estadoViaje: {
    findUnique: async ({ where: { descripcion } }) => ({ id: ESTADOS_VIAJE[descripcion], descripcion }),
  },
  $transaction: async () => {
    transacciones += 1;
    if (chocaIndiceUnico) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    throw new Error('Este test no llega a comenzar el viaje');
  },
};

// Tiene que estar antes de cargar la app: los services hacen
// require('./prismaClient') al cargarse.
const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

// --- Helpers ---------------------------------------------------------------

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
  enCursoPor = null;
  chocaIndiceUnico = false;
  transacciones = 0;
});

async function comenzar({ id, perfil }) {
  const token = generarToken({ id, nombreUsuario: `test-${id}`, perfil, habilitadoParaConducir: true });
  const respuesta = await fetch(`${base}/viajes/1/comenzar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ odometroInicial: 1000 }),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const EL_CHOFER = { id: CHOFER_ID, perfil: 'CHOFER' };
const UN_GESTOR = { id: 10, perfil: 'ADMINISTRADOR' };

// --- Tests -----------------------------------------------------------------

describe('Comenzar con otro viaje en curso: 409 con un mensaje claro', () => {
  test('el chofer con otro viaje en curso: "Ya tenés un viaje en curso"', async () => {
    enCursoPor = 'chofer';
    const { status, json } = await comenzar(EL_CHOFER);
    assert.equal(status, 409);
    assert.equal(json.error, 'Ya tenés un viaje en curso. Finalizalo para comenzar otro.');
    assert.equal(transacciones, 0, 'no se llega a tocar el viaje');
  });

  test('un gestor que comienza el viaje de un chofer en curso: el mensaje habla del chofer', async () => {
    enCursoPor = 'chofer';
    const { status, json } = await comenzar(UN_GESTOR);
    assert.equal(status, 409);
    assert.equal(json.error, 'Este chofer ya tiene un viaje en curso. Tiene que finalizarlo para comenzar otro.');
  });

  test('el vehículo en otro viaje en curso', async () => {
    enCursoPor = 'vehiculo';
    for (const quien of [EL_CHOFER, UN_GESTOR]) {
      const { status, json } = await comenzar(quien);
      assert.equal(status, 409);
      assert.equal(json.error, 'Este vehículo ya está en otro viaje en curso.');
    }
  });

  test('carrera contra el índice único (P2002): 409 sin repetir "En viaje en curso"', async () => {
    chocaIndiceUnico = true;
    const { status, json } = await comenzar(EL_CHOFER);
    assert.equal(status, 409);
    assert.equal(json.error, 'El vehículo o el chofer ya están en otro viaje en curso.');
    assert.equal(transacciones, 1);
  });

  test('ningún mensaje repite "En viaje en curso"', async () => {
    for (const caso of ['chofer', 'vehiculo']) {
      enCursoPor = caso;
      const { json } = await comenzar(EL_CHOFER);
      assert.doesNotMatch(json.error, /En viaje en curso/);
    }
  });
});
