// Tests de /mantenimientos/responsables (lo que usa el SelectorBuscarOCrear de
// "Responsable" en la pestaña Arreglos): buscar o crear con deduplicación por
// nombre normalizado.
//
// Usan la app real de Express con un JWT real y un doble de Prisma en memoria
// (mismo enfoque que marcasModelos.test.js): no tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma (responsables en memoria) -----------------------------

let responsables = [];
let proximoId = 1;

function proyectar(fila, select) {
  return select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : { ...fila };
}

function errorUnico() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

const prismaFalso = {
  responsableMantenimiento: {
    findMany: async ({ where, select, orderBy, take } = {}) => {
      const contiene = where?.nombreNormalizado?.contains;
      let filas = responsables.filter((f) => contiene === undefined || f.nombreNormalizado.includes(contiene));
      if (orderBy?.nombre === 'asc') filas = [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre));
      return filas.slice(0, take).map((f) => proyectar(f, select));
    },
    findUnique: async ({ where, select }) => {
      const fila = responsables.find((r) =>
        where.id !== undefined ? r.id === where.id : r.nombreNormalizado === where.nombreNormalizado
      );
      return fila ? proyectar(fila, select) : null;
    },
    create: async ({ data, select }) => {
      if (responsables.some((r) => r.nombreNormalizado === data.nombreNormalizado)) throw errorUnico();
      const fila = { id: proximoId++, creadoEn: new Date(), ...data };
      responsables.push(fila);
      return proyectar(fila, select);
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
  base = `http://127.0.0.1:${servidor.address().port}/api/mantenimientos/responsables`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  responsables = [];
  proximoId = 1;
});

async function pedir(metodo, consulta = '', { body, perfil = 'PERSONAL_TALLER' } = {}) {
  const respuesta = await fetch(`${base}${consulta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${generarToken({ id: 1, personaId: 1, nombreUsuario: 'test', perfil })}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

// --- Tests -----------------------------------------------------------------

describe('responsables de arreglos: buscar o crear', () => {
  test('crear dos veces el mismo responsable con otra escritura devuelve la misma fila', async () => {
    const primera = await pedir('POST', '', { body: { nombre: '  Taller Gómez ' } });
    const segunda = await pedir('POST', '', { body: { nombre: 'taller   GOMEZ' } });

    assert.equal(primera.status, 200);
    assert.deepEqual(Object.keys(primera.json.responsable).sort(), ['creadoEn', 'id', 'nombre']);
    assert.equal(primera.json.responsable.nombre, 'Taller Gómez', 'se guarda lo tipeado, solo con trim');
    assert.equal(segunda.json.responsable.id, primera.json.responsable.id);
    assert.equal(responsables.length, 1);
  });

  test('la búsqueda ignora mayúsculas y acentos y no expone nombreNormalizado', async () => {
    await pedir('POST', '', { body: { nombre: 'Taller Gómez' } });
    await pedir('POST', '', { body: { nombre: 'Gomería Río Tercero' } });
    await pedir('POST', '', { body: { nombre: 'Chapería Luna' } });

    const { status, json } = await pedir('GET', '?busqueda=GOM');

    assert.equal(status, 200);
    assert.deepEqual(json.responsables.map((r) => r.nombre), ['Gomería Río Tercero', 'Taller Gómez']);
    assert.ok(!('nombreNormalizado' in json.responsables[0]));
  });

  test('nombre vacío, que no es texto o de más de 120 caracteres -> 400, sin crear nada', async () => {
    for (const nombre of ['   ', undefined, 42, 'a'.repeat(121)]) {
      const { status, json } = await pedir('POST', '', { body: { nombre } });
      assert.equal(status, 400);
      assert.ok(json.errores.nombre);
    }
    assert.equal(responsables.length, 0);
  });

  test('mismos perfiles que el módulo de mantenimiento: el CHOFER no puede', async () => {
    assert.equal((await pedir('GET', '', { perfil: 'CHOFER' })).status, 403);
    assert.equal((await pedir('POST', '', { perfil: 'CHOFER', body: { nombre: 'X' } })).status, 403);
    for (const perfil of ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER']) {
      assert.equal((await pedir('GET', '', { perfil })).status, 200);
    }
  });
});
