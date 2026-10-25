// Tests de /marcas y /marcas/:marcaId/modelos (lo que usan los dos
// SelectorBuscarOCrear del formulario de vehículo): buscar o crear con
// deduplicación por nombre normalizado, y modelos únicos POR MARCA.
//
// Usan la app real de Express con un JWT real y un doble de Prisma en memoria
// (mismo enfoque que clientes.test.js): no tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma (marcas y modelos en memoria) -------------------------

let marcas = [];
let modelos = [];
let proximoId = 1;

function proyectar(fila, select) {
  return select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : { ...fila };
}

function errorUnico() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function filtrar(filas, where = {}) {
  const contiene = where.nombreNormalizado?.contains;
  return filas.filter(
    (f) =>
      (where.marcaId === undefined || f.marcaId === where.marcaId) &&
      (contiene === undefined || f.nombreNormalizado.includes(contiene))
  );
}

function ordenarYCortar(filas, { orderBy, take }) {
  let resultado = filas;
  if (orderBy?.nombre === 'asc') resultado = [...resultado].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return take === undefined ? resultado : resultado.slice(0, take);
}

const prismaFalso = {
  marca: {
    findMany: async ({ where, select, orderBy, take } = {}) =>
      ordenarYCortar(filtrar(marcas, where), { orderBy, take }).map((f) => proyectar(f, select)),
    findUnique: async ({ where, select }) => {
      const fila = marcas.find((m) =>
        where.id !== undefined ? m.id === where.id : m.nombreNormalizado === where.nombreNormalizado
      );
      return fila ? proyectar(fila, select) : null;
    },
    create: async ({ data, select }) => {
      if (marcas.some((m) => m.nombreNormalizado === data.nombreNormalizado)) throw errorUnico();
      const fila = { id: proximoId++, creadoEn: new Date(), ...data };
      marcas.push(fila);
      return proyectar(fila, select);
    },
  },
  modelo: {
    findMany: async ({ where, select, orderBy, take } = {}) =>
      ordenarYCortar(filtrar(modelos, where), { orderBy, take }).map((f) => proyectar(f, select)),
    findUnique: async ({ where, select }) => {
      const { marcaId, nombreNormalizado } = where.marcaId_nombreNormalizado;
      const fila = modelos.find((m) => m.marcaId === marcaId && m.nombreNormalizado === nombreNormalizado);
      return fila ? proyectar(fila, select) : null;
    },
    // Respeta el único compuesto (marcaId, nombreNormalizado), como la base.
    create: async ({ data, select }) => {
      if (modelos.some((m) => m.marcaId === data.marcaId && m.nombreNormalizado === data.nombreNormalizado)) {
        throw errorUnico();
      }
      const fila = { id: proximoId++, creadoEn: new Date(), ...data };
      modelos.push(fila);
      return proyectar(fila, select);
    },
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

// La sesión sale del token (ver helpers/sesionDelToken.js).
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
instalarSesionDelToken(SRC);

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
  marcas = [];
  modelos = [];
  proximoId = 1;
});

async function pedir(metodo, ruta, { body, perfil = 'ENCARGADO' } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
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

describe('marcas: buscar o crear', () => {
  test('crear dos veces la misma marca con otra escritura devuelve la misma fila', async () => {
    const primera = await pedir('POST', '/marcas', { body: { nombre: '  Citroën ' } });
    const segunda = await pedir('POST', '/marcas', { body: { nombre: 'CITROEN' } });

    assert.equal(primera.status, 200);
    assert.deepEqual(Object.keys(primera.json.marca).sort(), ['creadoEn', 'id', 'nombre']);
    assert.equal(primera.json.marca.nombre, 'Citroën', 'se guarda lo tipeado, solo con trim');
    assert.equal(segunda.json.marca.id, primera.json.marca.id);
    assert.equal(marcas.length, 1);
  });

  test('la búsqueda ignora mayúsculas y acentos y no expone nombreNormalizado', async () => {
    await pedir('POST', '/marcas', { body: { nombre: 'Citroën' } });
    await pedir('POST', '/marcas', { body: { nombre: 'Ford' } });

    const { status, json } = await pedir('GET', '/marcas?busqueda=citro');

    assert.equal(status, 200);
    assert.deepEqual(json.marcas.map((m) => m.nombre), ['Citroën']);
    assert.ok(!('nombreNormalizado' in json.marcas[0]));
  });

  test('nombre vacío o solo espacios -> 400', async () => {
    const { status, json } = await pedir('POST', '/marcas', { body: { nombre: '   ' } });
    assert.equal(status, 400);
    assert.ok(json.errores.nombre);
  });

  test('mismos perfiles que /clientes: CHOFER y PERSONAL_TALLER no pueden', async () => {
    for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
      assert.equal((await pedir('GET', '/marcas', { perfil })).status, 403);
      assert.equal((await pedir('POST', '/marcas', { perfil, body: { nombre: 'Ford' } })).status, 403);
    }
    assert.equal((await pedir('GET', '/marcas', { perfil: 'ADMINISTRADOR' })).status, 200);
  });
});

describe('modelos: buscar o crear dentro de una marca', () => {
  async function crearMarca(nombre) {
    return (await pedir('POST', '/marcas', { body: { nombre } })).json.marca;
  }

  test('el mismo nombre de modelo en dos marcas distintas son dos filas', async () => {
    const iveco = await crearMarca('Iveco');
    const fiat = await crearMarca('Fiat');

    const daily1 = await pedir('POST', `/marcas/${iveco.id}/modelos`, { body: { nombre: 'Daily' } });
    const daily2 = await pedir('POST', `/marcas/${fiat.id}/modelos`, { body: { nombre: 'DAILY' } });

    assert.equal(daily1.status, 200);
    assert.equal(daily2.status, 200);
    assert.notEqual(daily1.json.modelo.id, daily2.json.modelo.id);
    assert.equal(daily1.json.modelo.marcaId, iveco.id);
    assert.equal(daily2.json.modelo.marcaId, fiat.id);
  });

  test('dentro de la misma marca deduplica por nombre normalizado', async () => {
    const mb = await crearMarca('Mercedes-Benz');
    const a = await pedir('POST', `/marcas/${mb.id}/modelos`, { body: { nombre: 'OF 1418' } });
    const b = await pedir('POST', `/marcas/${mb.id}/modelos`, { body: { nombre: 'of   1418' } });
    assert.equal(a.json.modelo.id, b.json.modelo.id);
    assert.equal(modelos.length, 1);
  });

  test('la búsqueda solo trae modelos de la marca pedida', async () => {
    const iveco = await crearMarca('Iveco');
    const fiat = await crearMarca('Fiat');
    await pedir('POST', `/marcas/${iveco.id}/modelos`, { body: { nombre: 'Daily' } });
    await pedir('POST', `/marcas/${fiat.id}/modelos`, { body: { nombre: 'Ducato' } });

    const { status, json } = await pedir('GET', `/marcas/${fiat.id}/modelos?busqueda=d`);

    assert.equal(status, 200);
    assert.deepEqual(json.modelos.map((m) => m.nombre), ['Ducato']);
    assert.ok(!('nombreNormalizado' in json.modelos[0]));
  });

  test('marca inexistente o id inválido -> 404, sin crear nada', async () => {
    for (const marcaId of ['999', 'abc', '-1']) {
      assert.equal((await pedir('GET', `/marcas/${marcaId}/modelos`)).status, 404);
      assert.equal((await pedir('POST', `/marcas/${marcaId}/modelos`, { body: { nombre: 'X' } })).status, 404);
    }
    assert.equal(modelos.length, 0);
  });

  test('nombre vacío -> 400', async () => {
    const ford = await crearMarca('Ford');
    const { status, json } = await pedir('POST', `/marcas/${ford.id}/modelos`, { body: { nombre: '' } });
    assert.equal(status, 400);
    assert.ok(json.errores.nombre);
  });

  test('CHOFER no puede listar ni crear modelos', async () => {
    const ford = await crearMarca('Ford');
    assert.equal((await pedir('GET', `/marcas/${ford.id}/modelos`, { perfil: 'CHOFER' })).status, 403);
    assert.equal(
      (await pedir('POST', `/marcas/${ford.id}/modelos`, { perfil: 'CHOFER', body: { nombre: 'Transit' } })).status,
      403
    );
  });
});
