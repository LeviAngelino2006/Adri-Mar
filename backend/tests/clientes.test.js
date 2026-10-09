// Tests de GET /clientes?busqueda= (lo que usa SelectorBuscarOCrear): la
// búsqueda ignora mayúsculas y acentos porque filtra por nombreNormalizado.
//
// Usan la app real de Express con un JWT real y un doble de Prisma en memoria:
// no tocan la base de datos ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma (tabla de clientes en memoria) ------------------------

let filas = [];
let proximoId = 1;

const prismaFalso = {
  cliente: {
    // Filtra por la columna nombreNormalizado (nunca por nombre), igual que la
    // consulta real: así un test no pasa por casualidad comparando con acentos.
    findMany: async ({ where, select, orderBy, take } = {}) => {
      assert.ok(!where || !('nombre' in where), 'la búsqueda debe filtrar por nombreNormalizado, no por nombre');
      const contiene = where?.nombreNormalizado?.contains;
      assert.ok(contiene === undefined || !where.nombreNormalizado.mode, 'no hace falta mode: insensitive');
      let resultado = filas.filter((f) => contiene === undefined || f.nombreNormalizado.includes(contiene));
      if (orderBy?.nombre === 'asc') {
        resultado = [...resultado].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
      }
      if (take !== undefined) resultado = resultado.slice(0, take);
      // Sin select devuelve la fila completa (con nombreNormalizado): si el
      // service no lo pide, el test de "no se expone" lo detecta.
      return resultado.map((f) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, f[k]])) : { ...f }));
    },
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
});

async function buscar(busqueda, perfil = 'ADMINISTRADOR') {
  const query = busqueda === undefined ? '' : `?busqueda=${encodeURIComponent(busqueda)}`;
  const respuesta = await fetch(`${base}/clientes${query}`, {
    headers: { Authorization: `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}` },
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

// nombreNormalizado escrito a mano (no calculado con normalizarNombre) para que
// el test no dependa de la misma función que prueba.
function cargarFila(nombre, nombreNormalizado) {
  filas.push({ id: proximoId++, nombre, nombreNormalizado, creadoEn: new Date('2026-01-01T00:00:00Z') });
}

// --- Tests -----------------------------------------------------------------

describe('GET /clientes?busqueda=', () => {
  beforeEach(() => {
    // Cargados desordenados a propósito, para comprobar el orden por nombre.
    cargarFila('Villa María Cereales', 'villa maria cereales');
    cargarFila('Río Tercero SA', 'rio tercero sa');
  });

  const nombres = (json) => json.clientes.map((c) => c.nombre);

  for (const [descripcion, texto, esperado] of [
    ['"rio" (sin acento) encuentra "Río Tercero SA"', 'rio', ['Río Tercero SA']],
    ['"RÍO" (mayúsculas y acento) encuentra "Río Tercero SA"', 'RÍO', ['Río Tercero SA']],
    ['"maria" (sin acento) encuentra "Villa María Cereales"', 'maria', ['Villa María Cereales']],
    ['"María" (con acento) encuentra "Villa María Cereales"', 'María', ['Villa María Cereales']],
    ['"  rio   tercero " (espacios de más) encuentra "Río Tercero SA"', '  rio   tercero ', ['Río Tercero SA']],
    ['un texto que no está no devuelve nada', 'cordoba', []],
  ]) {
    test(descripcion, async () => {
      const { status, json } = await buscar(texto);
      assert.equal(status, 200);
      assert.deepEqual(nombres(json), esperado);
    });
  }

  test('sin texto devuelve todos, ordenados por nombre', async () => {
    const { status, json } = await buscar(undefined);
    assert.equal(status, 200);
    assert.deepEqual(nombres(json), ['Río Tercero SA', 'Villa María Cereales']);
  });

  test('un texto de solo espacios se comporta como sin texto', async () => {
    const { json } = await buscar('   ');
    assert.deepEqual(nombres(json), ['Río Tercero SA', 'Villa María Cereales']);
  });

  test('la respuesta nunca incluye nombreNormalizado', async () => {
    for (const texto of [undefined, 'rio']) {
      const { json } = await buscar(texto);
      assert.ok(json.clientes.length > 0);
      for (const cliente of json.clientes) {
        assert.deepEqual(Object.keys(cliente).sort(), ['creadoEn', 'id', 'nombre']);
      }
    }
  });

  test('CHOFER: 403', async () => {
    const { status } = await buscar('rio', 'CHOFER');
    assert.equal(status, 403);
  });
});
