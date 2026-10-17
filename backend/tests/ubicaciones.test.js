// Tests de POST /ubicaciones (también lo que usa SelectorBuscarOCrear): el
// nombre se guarda con formato de título y nunca se crea una ubicación
// duplicada, sin importar mayúsculas, acentos ni espacios. También las
// coordenadas: al crear (opcionales) y PUT /ubicaciones/:id/coordenadas.
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
let actualizaciones = [];
// Simula la carrera entre dos requests: el primer findUnique no ve la fila
// que la otra request ya insertó, y el INSERT choca contra el índice único.
let ocultarEnLaPrimeraBusqueda = false;

const publico = (fila) => ({ id: fila.id, nombre: fila.nombre, creadoEn: fila.creadoEn });
// Como Prisma: solo los campos del select (sin select, los públicos).
const elegir = (fila, select) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k] ?? null])) : publico(fila));

const prismaFalso = {
  ubicacion: {
    findUnique: async ({ where: { nombreNormalizado }, select }) => {
      if (ocultarEnLaPrimeraBusqueda) {
        ocultarEnLaPrimeraBusqueda = false;
        return null;
      }
      const fila = filas.find((f) => f.nombreNormalizado === nombreNormalizado);
      return fila ? elegir(fila, select) : null;
    },
    update: async ({ where: { id }, data, select }) => {
      const fila = filas.find((f) => f.id === id);
      if (!fila) {
        const error = new Error('Record to update not found');
        error.code = 'P2025';
        throw error;
      }
      actualizaciones.push({ id, data });
      Object.assign(fila, data);
      return elegir(fila, select);
    },
    create: async ({ data, select }) => {
      if (filas.some((f) => f.nombreNormalizado === data.nombreNormalizado)) {
        const error = new Error('Unique constraint failed');
        error.code = 'P2002';
        throw error;
      }
      creaciones.push(data);
      const fila = { id: proximoId++, creadoEn: new Date('2026-01-01T00:00:00Z'), latitud: null, longitud: null, ...data };
      filas.push(fila);
      return elegir(fila, select);
    },
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
  creaciones = [];
  actualizaciones = [];
  ocultarEnLaPrimeraBusqueda = false;
});

async function crear(nombre, perfil = 'ADMINISTRADOR', coordenadas = {}) {
  const respuesta = await fetch(`${base}/ubicaciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}` },
    body: JSON.stringify({ nombre, ...coordenadas }),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

async function ubicar(id, coordenadas, perfil = 'ENCARGADO') {
  const respuesta = await fetch(`${base}/ubicaciones/${id}/coordenadas`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}` },
    body: JSON.stringify(coordenadas),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

async function buscar(busqueda, perfil = 'ADMINISTRADOR') {
  const query = busqueda === undefined ? '' : `?busqueda=${encodeURIComponent(busqueda)}`;
  const respuesta = await fetch(`${base}/ubicaciones${query}`, {
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

describe('GET /ubicaciones?busqueda=', () => {
  beforeEach(() => {
    // Cargadas desordenadas a propósito, para comprobar el orden por nombre.
    cargarFila('Villa María', 'villa maria');
    cargarFila('Río Tercero', 'rio tercero');
  });

  const nombres = (json) => json.ubicaciones.map((u) => u.nombre);

  for (const [descripcion, texto, esperado] of [
    ['"rio" (sin acento) encuentra "Río Tercero"', 'rio', ['Río Tercero']],
    ['"RÍO" (mayúsculas y acento) encuentra "Río Tercero"', 'RÍO', ['Río Tercero']],
    ['"maria" (sin acento) encuentra "Villa María"', 'maria', ['Villa María']],
    ['"María" (con acento) encuentra "Villa María"', 'María', ['Villa María']],
    ['"  rio   tercero " (espacios de más) encuentra "Río Tercero"', '  rio   tercero ', ['Río Tercero']],
    ['un texto que no está no devuelve nada', 'cordoba', []],
  ]) {
    test(descripcion, async () => {
      const { status, json } = await buscar(texto);
      assert.equal(status, 200);
      assert.deepEqual(nombres(json), esperado);
    });
  }

  test('sin texto devuelve todas, ordenadas por nombre', async () => {
    const { status, json } = await buscar(undefined);
    assert.equal(status, 200);
    assert.deepEqual(nombres(json), ['Río Tercero', 'Villa María']);
  });

  test('un texto de solo espacios se comporta como sin texto', async () => {
    const { json } = await buscar('   ');
    assert.deepEqual(nombres(json), ['Río Tercero', 'Villa María']);
  });

  test('la respuesta nunca incluye nombreNormalizado', async () => {
    for (const texto of [undefined, 'rio']) {
      const { json } = await buscar(texto);
      assert.ok(json.ubicaciones.length > 0);
      for (const ubicacion of json.ubicaciones) {
        assert.deepEqual(Object.keys(ubicacion).sort(), ['creadoEn', 'id', 'nombre']);
      }
    }
  });

  test('CHOFER: 403', async () => {
    const { status } = await buscar('rio', 'CHOFER');
    assert.equal(status, 403);
  });
});

// Punto de Google Maps (click derecho → copiar coordenadas) del Colegio Monserrat.
const MONSERRAT = { latitud: -31.4201, longitud: -64.1888 };

describe('POST /ubicaciones con coordenadas', () => {
  test('crea la ubicación con su punto y no expone las coordenadas', async () => {
    const { status, json } = await crear('Colegio Nacional de Monserrat', 'ENCARGADO', MONSERRAT);

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.ubicacion).sort(), ['creadoEn', 'id', 'nombre']);
    assert.equal(creaciones[0].latitud, -31.4201);
    assert.equal(creaciones[0].longitud, -64.1888);
  });

  test('acepta strings numéricos (lo que manda un input)', async () => {
    await crear('Monserrat', 'ENCARGADO', { latitud: '-31.4201', longitud: '-64.1888' });
    assert.equal(creaciones[0].latitud, -31.4201);
  });

  test('sin coordenadas se sigue pudiendo crear (queda sin ubicar)', async () => {
    const { status } = await crear('Hotel Sierras');
    assert.equal(status, 200);
    assert.equal(creaciones[0].latitud, undefined);
  });

  for (const [caso, coordenadas, mensaje] of [
    ['latitud y longitud invertidas', { latitud: -64.1888, longitud: -31.4201 }, /invertidas/],
    ['fuera de Argentina (Madrid)', { latitud: 40.4168, longitud: -3.7038 }, /fuera de Argentina/],
    ['sin los signos menos', { latitud: 31.4201, longitud: 64.1888 }, /signos menos/],
    ['solo la latitud', { latitud: -31.4201 }, /Faltan/],
    ['texto que no es número', { latitud: 'abc', longitud: '-64.1' }, /números/],
  ]) {
    test(`${caso}: 400 en "coordenadas" y no se crea nada`, async () => {
      const { status, json } = await crear('Colegio Nacional de Monserrat', 'ENCARGADO', coordenadas);
      assert.equal(status, 400);
      assert.match(json.errores.coordenadas, mensaje);
      assert.equal(creaciones.length, 0);
    });
  }

  test('si ya existía SIN coordenadas, se le completan y no se crea otra', async () => {
    cargarFila('Cosquín', 'cosquin');

    const { status, json } = await crear('cosquin', 'ENCARGADO', { latitud: -31.2437, longitud: -64.4653 });

    assert.equal(status, 200);
    assert.equal(json.ubicacion.id, 1);
    assert.equal(json.ubicacion.nombre, 'Cosquín');
    assert.equal(creaciones.length, 0);
    assert.deepEqual(actualizaciones, [{ id: 1, data: { latitud: -31.2437, longitud: -64.4653 } }]);
  });

  test('si ya existía CON coordenadas, no se tocan', async () => {
    filas.push({ id: 5, nombre: 'Cosquín', nombreNormalizado: 'cosquin', latitud: -31.24, longitud: -64.46, creadoEn: new Date() });

    const { status, json } = await crear('Cosquín', 'ENCARGADO', { latitud: -31.3, longitud: -64.3 });

    assert.equal(status, 200);
    assert.equal(json.ubicacion.id, 5);
    assert.equal(actualizaciones.length, 0);
    assert.equal(filas[0].latitud, -31.24);
  });
});

describe('PUT /ubicaciones/:id/coordenadas', () => {
  beforeEach(() => cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat'));

  test('ubica una existente y devuelve los datos públicos', async () => {
    const { status, json } = await ubicar(1, MONSERRAT);

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.ubicacion).sort(), ['creadoEn', 'id', 'nombre']);
    assert.deepEqual(actualizaciones, [{ id: 1, data: MONSERRAT }]);
  });

  test('invertidas: 400 y no se guarda', async () => {
    const { status, json } = await ubicar(1, { latitud: -64.1888, longitud: -31.4201 });
    assert.equal(status, 400);
    assert.match(json.errores.coordenadas, /invertidas/);
    assert.equal(actualizaciones.length, 0);
  });

  test('sin coordenadas: 400 (acá son obligatorias)', async () => {
    const { status, json } = await ubicar(1, {});
    assert.equal(status, 400);
    assert.ok(json.errores.coordenadas);
  });

  test('ubicación inexistente o id inválido: 404', async () => {
    assert.equal((await ubicar(99, MONSERRAT)).status, 404);
    assert.equal((await ubicar('abc', MONSERRAT)).status, 404);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se guarda`, async () => {
      assert.equal((await ubicar(1, MONSERRAT, perfil)).status, 403);
      assert.equal(actualizaciones.length, 0);
    });
  }
});
