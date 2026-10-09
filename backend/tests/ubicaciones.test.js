// Tests de POST /ubicaciones (también lo que usa SelectorBuscarOCrear): el
// nombre se guarda con formato de título y nunca se crea una ubicación
// duplicada, sin importar mayúsculas, acentos ni espacios.
//
// Usan la app real de Express con un JWT real y un doble de Prisma en memoria:
// no tocan la base de datos ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma (tabla de ubicaciones en memoria) ---------------------

let filas = [];
let proximoId = 1;
let creaciones = [];
// Simula la carrera entre dos requests: el primer findUnique no ve la fila
// que la otra request ya insertó, y el INSERT choca contra el índice único.
let ocultarEnLaPrimeraBusqueda = false;

const publico = (fila) => ({ id: fila.id, nombre: fila.nombre, creadoEn: fila.creadoEn });

const prismaFalso = {
  ubicacion: {
    findUnique: async ({ where: { nombreNormalizado } }) => {
      if (ocultarEnLaPrimeraBusqueda) {
        ocultarEnLaPrimeraBusqueda = false;
        return null;
      }
      const fila = filas.find((f) => f.nombreNormalizado === nombreNormalizado);
      return fila ? publico(fila) : null;
    },
    create: async ({ data }) => {
      if (filas.some((f) => f.nombreNormalizado === data.nombreNormalizado)) {
        const error = new Error('Unique constraint failed');
        error.code = 'P2002';
        throw error;
      }
      creaciones.push(data);
      const fila = { id: proximoId++, creadoEn: new Date('2026-01-01T00:00:00Z'), ...data };
      filas.push(fila);
      return publico(fila);
    },
    findMany: async () => filas.map(publico),
  },
};

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
  filas = [];
  proximoId = 1;
  creaciones = [];
  ocultarEnLaPrimeraBusqueda = false;
});

async function crear(nombre, perfil = 'ADMINISTRADOR') {
  const respuesta = await fetch(`${base}/ubicaciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}` },
    body: JSON.stringify({ nombre }),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

// --- Tests -----------------------------------------------------------------

describe('POST /ubicaciones', () => {
  test('guarda el nombre con formato de título', async () => {
    const { status, json } = await crear('RIO TERCERO');

    assert.equal(status, 200);
    assert.equal(json.ubicacion.nombre, 'Rio Tercero');
    assert.equal(creaciones.length, 1);
    assert.equal(creaciones[0].nombre, 'Rio Tercero');
    // Lo que se compara para detectar duplicados no cambia con el formato.
    assert.equal(creaciones[0].nombreNormalizado, 'rio tercero');
  });

  test('"RIO TERCERO" y después "rio tercero": queda una sola, "Rio Tercero"', async () => {
    const primera = await crear('RIO TERCERO');
    const segunda = await crear('rio tercero');

    assert.equal(segunda.status, 200);
    assert.equal(segunda.json.ubicacion.id, primera.json.ubicacion.id);
    assert.equal(segunda.json.ubicacion.nombre, 'Rio Tercero');
    assert.equal(filas.length, 1);
    assert.equal(creaciones.length, 1, 'la segunda vez no debe crear nada');
  });

  test('un acento distinto o espacios repetidos devuelven la existente, no crean otra', async () => {
    const primera = await crear('rio tercero');

    for (const variante of ['Río Tercero', 'RÍO TERCERO', '  rio    tercero  ']) {
      const { status, json } = await crear(variante);
      assert.equal(status, 200, variante);
      assert.equal(json.ubicacion.id, primera.json.ubicacion.id, variante);
    }
    assert.equal(filas.length, 1);
    // Se devuelve la que ya estaba: no se pisa su nombre con el de la variante.
    assert.equal(filas[0].nombre, 'Rio Tercero');
  });

  test('respeta los acentos que escribe el usuario y las palabras de enlace', async () => {
    const { json } = await crear('  CANCHA DE OLAETA ');
    assert.equal(json.ubicacion.nombre, 'Cancha de Olaeta');

    const conAcento = await crear('córdoba CAPITAL');
    assert.equal(conAcento.json.ubicacion.nombre, 'Córdoba Capital');
  });

  test('nunca expone el nombre normalizado', async () => {
    const { json } = await crear('Almafuerte');
    assert.deepEqual(Object.keys(json.ubicacion).sort(), ['creadoEn', 'id', 'nombre']);
  });

  test('un nombre vacío o de solo espacios: 400 y no se crea nada', async () => {
    for (const nombre of ['', '    ', undefined]) {
      const { status, json } = await crear(nombre);
      assert.equal(status, 400);
      assert.ok('nombre' in json.errores);
    }
    assert.equal(creaciones.length, 0);
  });

  test('carrera entre dos requests: si el INSERT choca con el índice único, devuelve la ganadora', async () => {
    filas.push({ id: 7, nombre: 'Rio Tercero', nombreNormalizado: 'rio tercero', creadoEn: new Date('2026-01-01T00:00:00Z') });
    proximoId = 8;
    ocultarEnLaPrimeraBusqueda = true;

    const { status, json } = await crear('RIO TERCERO');

    assert.equal(status, 200);
    assert.equal(json.ubicacion.id, 7);
    assert.equal(filas.length, 1);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se crea nada`, async () => {
      const { status } = await crear('Rio Tercero', perfil);
      assert.equal(status, 403);
      assert.equal(creaciones.length, 0);
    });
  }
});
