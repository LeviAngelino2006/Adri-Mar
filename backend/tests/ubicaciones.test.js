// Tests de /ubicaciones: POST por nombre (el nombre se guarda con formato de
// título y nunca se duplica, sin importar mayúsculas, acentos ni espacios), el
// buscador (solo FRECUENTES) y los endpoints de Google Maps: sugerencias,
// alta desde Google (upsert por placeId, PARTICULAR o FRECUENTE) y ubicar una
// existente.
//
// Usan la app real de Express con un JWT real, un doble de Prisma en memoria y
// un Google falso (fetch reemplazado): no tocan la base de datos, no leen el
// .env y NUNCA llaman a Google de verdad.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const CLAVE = 'clave-google-de-prueba-AIzaXYZ123';

// --- Doble de Prisma (tabla de ubicaciones en memoria) ---------------------

let filas = [];
let proximoId = 1;
let creaciones = [];
let actualizaciones = [];
// Simula la carrera entre dos requests: el primer findUnique no ve la fila
// que la otra request ya insertó, y el INSERT choca contra el índice único.
let ocultarEnLaPrimeraBusqueda = false;

const COLUMNAS = { latitud: null, longitud: null, placeId: null, direccion: null, georefId: null, esFrecuente: true };
const publico = (fila) => ({ id: fila.id, nombre: fila.nombre, creadoEn: fila.creadoEn });
// Como Prisma: solo los campos del select (sin select, los públicos).
const elegir = (fila, select) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k] ?? null])) : publico(fila));

// Índices únicos como en Postgres: nombreNormalizado y placeId, donde varios
// null NO chocan entre sí.
function chocaConIndice(data, excepto) {
  return filas.some(
    (f) =>
      f !== excepto &&
      ((data.nombreNormalizado != null && f.nombreNormalizado === data.nombreNormalizado) ||
        (data.placeId != null && f.placeId === data.placeId))
  );
}

function errorUnico() {
  const error = new Error('Unique constraint failed');
  error.code = 'P2002';
  return error;
}

const prismaFalso = {
  ubicacion: {
    findUnique: async ({ where, select }) => {
      if (ocultarEnLaPrimeraBusqueda) {
        ocultarEnLaPrimeraBusqueda = false;
        return null;
      }
      const [[campo, valor]] = Object.entries(where);
      const fila = filas.find((f) => f[campo] === valor);
      return fila ? elegir(fila, select) : null;
    },
    update: async ({ where: { id }, data, select }) => {
      const fila = filas.find((f) => f.id === id);
      if (!fila) {
        const error = new Error('Record to update not found');
        error.code = 'P2025';
        throw error;
      }
      if (chocaConIndice(data, fila)) throw errorUnico();
      actualizaciones.push({ id, data });
      Object.assign(fila, data);
      return elegir(fila, select);
    },
    create: async ({ data, select }) => {
      if (chocaConIndice(data)) throw errorUnico();
      creaciones.push(data);
      const fila = { id: proximoId++, creadoEn: new Date('2026-01-01T00:00:00Z'), ...COLUMNAS, ...data };
      filas.push(fila);
      return elegir(fila, select);
    },
    // Filtra por la columna nombreNormalizado (nunca por nombre), igual que la
    // consulta real: así un test no pasa por casualidad comparando con acentos.
    findMany: async ({ where, select, orderBy, take } = {}) => {
      assert.ok(!where || !('nombre' in where), 'la búsqueda debe filtrar por nombreNormalizado, no por nombre');
      const contiene = where?.nombreNormalizado?.contains;
      assert.ok(contiene === undefined || !where.nombreNormalizado.mode, 'no hace falta mode: insensitive');
      let resultado = filas.filter(
        (f) =>
          (where?.esFrecuente === undefined || f.esFrecuente === where.esFrecuente) &&
          (contiene === undefined || (f.nombreNormalizado ?? '').includes(contiene))
      );
      if (orderBy?.nombre === 'asc') {
        resultado = [...resultado].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
      }
      if (take !== undefined) resultado = resultado.slice(0, take);
      // Sin select devuelve la fila completa (con nombreNormalizado): si el
      // service no lo pide, el test de "no se expone" lo detecta.
      return resultado.map((f) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, f[k] ?? null])) : { ...f }));
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
const google = require(path.join(SRC, 'services', 'googleMapsService.js'));
const limiteDiario = require(path.join(SRC, 'utils', 'limiteDiarioGoogle.js'));

// --- Google falso ------------------------------------------------------------

// Lugares que "conoce" Google: placeId → formattedAddress.
const LUGARES = {
  ChIJ_casa_colon_1234: 'Av. Colón 1234, X5000 Córdoba',
  ChIJ_casa_otra: 'Obispo Trejo 350, X5000 Córdoba',
  ChIJ_monserrat: 'Obispo Trejo 294, X5000 Córdoba',
  ChIJ_aeropuerto: 'Av. La Voz del Interior 8500, X5008 Córdoba',
};

let llamadasGoogle = [];
// Permite que un test cambie la respuesta: (llamada) => Response | undefined.
let comportamiento = null;

const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function googleFalso(url, opciones) {
  const u = new URL(url);
  const llamada = {
    url: String(url),
    host: u.host,
    path: decodeURIComponent(u.pathname),
    params: Object.fromEntries(u.searchParams),
    method: opciones.method,
    headers: opciones.headers,
    body: opciones.body ? JSON.parse(opciones.body) : null,
  };
  llamadasGoogle.push(llamada);
  const especial = comportamiento?.(llamada);
  if (especial) return especial;

  if (llamada.path === '/v1/places:autocomplete') {
    return json(200, {
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ_casa_colon_1234',
            structuredFormat: { mainText: { text: 'Av. Colón 1234' }, secondaryText: { text: 'Córdoba, Argentina' } },
          },
        },
        {
          placePrediction: {
            placeId: 'ChIJ_monserrat',
            structuredFormat: { mainText: { text: 'Colegio Nacional de Monserrat' }, secondaryText: { text: 'Obispo Trejo, Córdoba' } },
          },
        },
        // Una sugerencia de consulta (sin placePrediction) se descarta.
        { queryPrediction: { text: { text: 'colón 1234 córdoba' } } },
      ],
    });
  }
  if (llamada.path.startsWith('/v1/places/')) {
    const id = llamada.path.slice('/v1/places/'.length);
    if (!LUGARES[id]) return json(404, { error: { code: 404, status: 'NOT_FOUND' } });
    return json(200, { id, formattedAddress: LUGARES[id] });
  }
  return json(404, { error: 'ruta desconocida en el Google falso' });
}

// --- Helpers ---------------------------------------------------------------

const fetchReal = globalThis.fetch;
let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  // Lo que va a la app usa el fetch real; todo lo demás es "Google".
  globalThis.fetch = (url, opciones = {}) =>
    String(url).startsWith(base) ? fetchReal(url, opciones) : Promise.resolve().then(() => googleFalso(url, opciones));
});

after(() => {
  globalThis.fetch = fetchReal;
  return new Promise((resolver) => servidor.close(resolver));
});

beforeEach(() => {
  filas = [];
  proximoId = 1;
  creaciones = [];
  actualizaciones = [];
  ocultarEnLaPrimeraBusqueda = false;
  llamadasGoogle = [];
  comportamiento = null;
  process.env.GOOGLE_MAPS_API_KEY = CLAVE;
  limiteDiario.reiniciar();
  for (const v of ['GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE', 'GOOGLE_LIMITE_DIARIO_DETALLES', 'GOOGLE_LIMITE_DIARIO_RUTAS']) delete process.env[v];
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

const auth = (perfil) => ({ Authorization: `Bearer ${generarToken({ id: 1, personaId: 1, nombreUsuario: 'test', perfil })}` });

async function pedir(metodo, ruta, { body, perfil = 'ENCARGADO' } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(perfil ? auth(perfil) : {}) };
  const respuesta = await fetchReal(`${base}${ruta}`, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: respuesta.status, json: await respuesta.json() };
}

const crear = (nombre, perfil = 'ADMINISTRADOR') => pedir('POST', '/ubicaciones', { body: { nombre }, perfil });

async function buscar(busqueda, perfil = 'ADMINISTRADOR') {
  const query = busqueda === undefined ? '' : `?busqueda=${encodeURIComponent(busqueda)}`;
  return pedir('GET', `/ubicaciones${query}`, { perfil });
}

// nombreNormalizado escrito a mano (no calculado con normalizarNombre) para que
// el test no dependa de la misma función que prueba.
function cargarFila(nombre, nombreNormalizado, extra = {}) {
  const fila = { id: proximoId++, nombre, nombreNormalizado, creadoEn: new Date('2026-01-01T00:00:00Z'), ...COLUMNAS, ...extra };
  filas.push(fila);
  return fila;
}

const CAMPOS_PUBLICOS = ['creadoEn', 'id', 'latitud', 'longitud', 'nombre', 'placeId'];
const TOKEN = '3f1c9a2e-7b4d-4c1e-9a8f-0d2b6e5c4a11';

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
    assert.deepEqual(Object.keys(json.ubicacion).sort(), CAMPOS_PUBLICOS);
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
        assert.deepEqual(Object.keys(ubicacion).sort(), CAMPOS_PUBLICOS);
      }
    }
  });

  test('CHOFER: 403', async () => {
    const { status } = await buscar('rio', 'CHOFER');
    assert.equal(status, 403);
  });
});


// --- Google: sugerencias -----------------------------------------------------

const autocompletes = () => llamadasGoogle.filter((l) => l.path === '/v1/places:autocomplete');
const detalles = () => llamadasGoogle.filter((l) => l.path.startsWith('/v1/places/'));

const sugerir = (texto, sessionToken = TOKEN, perfil) => {
  const params = new URLSearchParams();
  if (texto !== undefined) params.set('texto', texto);
  if (sessionToken != null) params.set('sessionToken', sessionToken);
  return pedir('GET', `/ubicaciones/sugerencias-google?${params}`, { perfil });
};

describe('GET /ubicaciones/sugerencias-google', () => {
  test('devuelve { placeId, textoPrincipal, textoSecundario } y descarta las sugerencias de consulta', async () => {
    const { status, json: r } = await sugerir('colon 1234');

    assert.equal(status, 200);
    assert.deepEqual(r.sugerencias, [
      { placeId: 'ChIJ_casa_colon_1234', textoPrincipal: 'Av. Colón 1234', textoSecundario: 'Córdoba, Argentina' },
      { placeId: 'ChIJ_monserrat', textoPrincipal: 'Colegio Nacional de Monserrat', textoSecundario: 'Obispo Trejo, Córdoba' },
    ]);
  });

  test('Autocomplete (New): POST, field mask, Argentina, sesgo a Córdoba, castellano y el sessionToken', async () => {
    await sugerir('  colon   1234 ');

    assert.equal(llamadasGoogle.length, 1);
    const [l] = llamadasGoogle;
    assert.equal(l.url, 'https://places.googleapis.com/v1/places:autocomplete');
    assert.equal(l.method, 'POST');
    assert.equal(l.headers['X-Goog-FieldMask'], 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat');
    assert.deepEqual(l.body, {
      input: 'colon 1234',
      sessionToken: TOKEN,
      includedRegionCodes: ['ar'],
      locationBias: { circle: { center: { latitude: -31.4135, longitude: -64.1811 }, radius: 50000 } },
      languageCode: 'es',
    });
  });

  test('la key va en el header X-Goog-Api-Key: nunca en la URL, el cuerpo ni la respuesta', async () => {
    const { json: r } = await sugerir('colon 1234');
    const [l] = llamadasGoogle;
    assert.equal(l.headers['X-Goog-Api-Key'], CLAVE);
    assert.ok(!l.url.includes(CLAVE));
    assert.ok(!JSON.stringify(l.body).includes(CLAVE));
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });

  test('sin sessionToken también funciona (sin sesión)', async () => {
    const { status } = await sugerir('colon 1234', null);
    assert.equal(status, 200);
    assert.ok(!('sessionToken' in llamadasGoogle[0].body));
  });

  for (const texto of [undefined, '', '  ', 'ab']) {
    test(`texto ${JSON.stringify(texto)}: 400 y no se llama a Google`, async () => {
      const { status, json: r } = await sugerir(texto);
      assert.equal(status, 400);
      assert.match(r.errores.texto, /al menos 3 letras/);
      assert.equal(llamadasGoogle.length, 0);
    });
  }

  test('sessionToken con un formato que Google no acepta: 400', async () => {
    const { status, json: r } = await sugerir('colon 1234', 'token con espacios');
    assert.equal(status, 400);
    assert.ok(r.errores.sessionToken);
    assert.equal(llamadasGoogle.length, 0);
  });

  test('sin GOOGLE_MAPS_API_KEY: 503 claro, sin llamar a Google; el buscador de frecuentes sigue andando', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    cargarFila('Río Tercero', 'rio tercero');

    const { status, json: r } = await sugerir('colon 1234');
    assert.equal(status, 503);
    assert.match(r.error, /falta configurar GOOGLE_MAPS_API_KEY/);
    assert.equal(llamadasGoogle.length, 0);

    const frecuentes = await buscar('rio');
    assert.equal(frecuentes.status, 200);
    assert.deepEqual(frecuentes.json.ubicaciones.map((u) => u.nombre), ['Río Tercero']);
  });

  test('cuota agotada (429 RESOURCE_EXHAUSTED): 429 con "intentá más tarde"', async () => {
    comportamiento = () => json(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    const { status, json: r } = await sugerir('colon 1234');
    assert.equal(status, 429);
    assert.match(r.error, /cuota de Google Maps/);
  });

  test('key rechazada o API no habilitada (403): 503 sin mostrar la key', async () => {
    comportamiento = () => json(403, { error: { status: 'PERMISSION_DENIED' } });
    const { status, json: r } = await sugerir('colon 1234');
    assert.equal(status, 503);
    assert.match(r.error, /no es válida/);
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });

  test('timeout: 503; red caída: 502; error interno: 502', async () => {
    comportamiento = () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    assert.equal((await sugerir('colon 1234')).status, 503);
    comportamiento = () => {
      throw new TypeError('fetch failed');
    };
    assert.equal((await sugerir('colon 1234')).status, 502);
    comportamiento = () => json(500, {});
    assert.equal((await sugerir('colon 1234')).status, 502);
  });

  test('el plazo por defecto es de 8 segundos', () => {
    assert.equal(google.TIMEOUT_MS, 8000);
  });
});

// --- Google: alta desde una sugerencia --------------------------------------

const desdeGoogle = (body, perfil) => pedir('POST', '/ubicaciones/desde-google', { body, perfil });

describe('POST /ubicaciones/desde-google: PARTICULAR (la casa de un pasajero)', () => {
  test('crea la particular: nombre = la dirección de Google, sin nombreNormalizado, fuera del buscador', async () => {
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', sessionToken: TOKEN, frecuente: false });

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(r.ubicacion).sort(), CAMPOS_PUBLICOS);
    assert.equal(r.ubicacion.nombre, 'Av. Colón 1234, X5000 Córdoba');
    assert.equal(r.ubicacion.placeId, 'ChIJ_casa_colon_1234');
    assert.deepEqual(creaciones, [
      { nombre: 'Av. Colón 1234, X5000 Córdoba', nombreNormalizado: null, esFrecuente: false, placeId: 'ChIJ_casa_colon_1234' },
    ]);

    const enBuscador = await buscar('colon');
    assert.deepEqual(enBuscador.json.ubicaciones, []);
    assert.deepEqual((await buscar(undefined)).json.ubicaciones, [], 'tampoco sin texto');
  });

  test('de Google solo se guarda el placeId: ni coordenadas ni dirección (términos de Google)', async () => {
    await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', sessionToken: TOKEN });
    const [fila] = filas;
    assert.equal(fila.latitud, null);
    assert.equal(fila.longitud, null);
    assert.equal(fila.direccion, null);
  });

  test('Place Details (New): field mask mínimo (Essentials, sin displayName), el mismo sessionToken, es-AR', async () => {
    await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', sessionToken: TOKEN });

    assert.equal(detalles().length, 1);
    const [l] = detalles();
    assert.equal(l.host, 'places.googleapis.com');
    assert.equal(l.path, '/v1/places/ChIJ_casa_colon_1234');
    assert.equal(l.method, 'GET');
    assert.equal(l.headers['X-Goog-FieldMask'], 'id,formattedAddress');
    assert.ok(!l.headers['X-Goog-FieldMask'].includes('displayName'), 'displayName dispara el SKU Pro');
    assert.deepEqual(l.params, { languageCode: 'es', regionCode: 'ar', sessionToken: TOKEN });
    assert.equal(l.headers['X-Goog-Api-Key'], CLAVE);
    assert.ok(!l.url.includes(CLAVE));
  });

  test('elegir dos veces la misma casa no duplica: misma fila y sin volver a llamar a Google', async () => {
    const primera = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', sessionToken: TOKEN });
    const segunda = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', sessionToken: 'otro-token-123' });

    assert.equal(segunda.status, 200);
    assert.equal(segunda.json.ubicacion.id, primera.json.ubicacion.id);
    assert.equal(filas.length, 1);
    assert.equal(detalles().length, 1);
  });

  test('dos casas distintas conviven aunque las dos tengan nombreNormalizado null', async () => {
    await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' });
    const { status } = await desdeGoogle({ placeId: 'ChIJ_casa_otra' });
    assert.equal(status, 200);
    assert.equal(filas.length, 2);
    assert.ok(filas.every((f) => f.nombreNormalizado === null && f.esFrecuente === false));
  });

  test('Google devuelve un id más nuevo para el mismo lugar: se guarda el nuevo', async () => {
    comportamiento = (l) => (l.path === '/v1/places/ChIJ_viejo' ? json(200, { id: 'ChIJ_casa_otra', formattedAddress: 'Obispo Trejo 350, X5000 Córdoba' }) : undefined);
    const { json: r } = await desdeGoogle({ placeId: 'ChIJ_viejo' });
    assert.equal(r.ubicacion.placeId, 'ChIJ_casa_otra');
  });

  test('placeId que Google no reconoce: 422 y no se crea nada', async () => {
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_no_existe' });
    assert.equal(status, 422);
    assert.match(r.error, /no reconoce ese lugar/);
    assert.equal(filas.length, 0);
  });

  for (const placeId of [undefined, '', 'con espacios', 42, 'a/../b']) {
    test(`placeId inválido (${JSON.stringify(placeId)}): 400 sin llamar a Google`, async () => {
      const { status, json: r } = await desdeGoogle({ placeId });
      assert.equal(status, 400);
      assert.ok(r.errores.placeId);
      assert.equal(llamadasGoogle.length, 0);
    });
  }

  test('sin GOOGLE_MAPS_API_KEY: 503 y no se crea nada', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { status } = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' });
    assert.equal(status, 503);
    assert.equal(filas.length, 0);
  });

  test('cuota agotada en Place Details: 429', async () => {
    comportamiento = () => json(429, {});
    assert.equal((await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' })).status, 429);
    assert.equal(filas.length, 0);
  });
});

describe('POST /ubicaciones/desde-google: FRECUENTE ("Guardar como frecuente")', () => {
  test('nombre = el texto principal de la sugerencia, con nombreNormalizado, y aparece en el buscador', async () => {
    const { status, json: r } = await desdeGoogle({
      placeId: 'ChIJ_aeropuerto', sessionToken: TOKEN, frecuente: true, nombre: '  Aeropuerto Internacional Ing. Ambrosio L.V. Taravella ',
    });

    assert.equal(status, 200);
    assert.equal(r.ubicacion.nombre, 'Aeropuerto Internacional Ing. Ambrosio L.V. Taravella', 'tal cual, sin formato de título');
    assert.deepEqual(creaciones, [
      {
        nombre: 'Aeropuerto Internacional Ing. Ambrosio L.V. Taravella',
        nombreNormalizado: 'aeropuerto internacional ing. ambrosio l.v. taravella',
        esFrecuente: true,
        placeId: 'ChIJ_aeropuerto',
      },
    ]);
    assert.deepEqual((await buscar('taravella')).json.ubicaciones.map((u) => u.id), [r.ubicacion.id]);
  });

  test('sin nombre: 400', async () => {
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_aeropuerto', frecuente: true });
    assert.equal(status, 400);
    assert.match(r.errores.nombre, /obligatorio/);
  });

  test('frecuente que no es booleano: 400', async () => {
    assert.equal((await desdeGoogle({ placeId: 'ChIJ_aeropuerto', frecuente: 'si' })).status, 400);
  });

  test('mismo nombre que una frecuente sin lugar de Google (la del Excel): se le completa el placeId, no se duplica', async () => {
    const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');

    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_monserrat', frecuente: true, nombre: 'Colegio Nacional de Monserrat' });

    assert.equal(status, 200);
    assert.equal(r.ubicacion.id, excel.id);
    assert.equal(excel.placeId, 'ChIJ_monserrat');
    assert.equal(filas.length, 1);
  });

  test('mismo nombre que una frecuente con OTRO placeId: 409 con la existente, sin llamar a Google ni tocar nada', async () => {
    const otra = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat', { placeId: 'ChIJ_otro_lado' });
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_monserrat', frecuente: true, nombre: 'colegio nacional  de MONSERRAT' });
    assert.equal(status, 409);
    assert.match(r.error, /Ya hay una ubicación frecuente llamada "Colegio Nacional de Monserrat"\. Usala o elegí otro nombre\./);
    assert.equal(r.frecuenteExistente.id, otra.id);
    assert.deepEqual(Object.keys(r.frecuenteExistente).sort(), CAMPOS_PUBLICOS);
    assert.equal(filas.length, 1);
    assert.equal(llamadasGoogle.length, 0, 'el conflicto se detecta antes de gastar un Place Details');
  });

  test('mismo nombre que una localidad de Georef (con coordenadas): 409 con la existente; no le pega el placeId', async () => {
    const cosquin = cargarFila('Cosquín', 'cosquin', { latitud: -31.24, longitud: -64.46 });
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234', frecuente: true, nombre: 'Cosquin' });
    assert.equal(status, 409);
    assert.equal(r.frecuenteExistente.id, cosquin.id);
    assert.equal(cosquin.placeId, null);
  });

  test('el nombre que confirma el usuario (editado) es el que se guarda', async () => {
    const { status, json: r } = await desdeGoogle({
      placeId: 'ChIJ_aeropuerto', frecuente: true, nombre: '  Aeropuerto de Córdoba (Taravella) ',
    });
    assert.equal(status, 200);
    assert.equal(r.ubicacion.nombre, 'Aeropuerto de Córdoba (Taravella)');
    assert.equal(creaciones[0].nombreNormalizado, 'aeropuerto de cordoba (taravella)');
  });

  test('promover una particular con un nombre que ya es otra frecuente: 409 con la existente', async () => {
    const otra = cargarFila('Hotel Sierras', 'hotel sierras', { placeId: 'ChIJ_hotel' });
    await desdeGoogle({ placeId: 'ChIJ_monserrat' });
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_monserrat', frecuente: true, nombre: 'Hotel Sierras' });
    assert.equal(status, 409);
    assert.equal(r.frecuenteExistente.id, otra.id);
  });

  test('una particular elegida de nuevo como frecuente pasa a frecuente (misma fila, con el nombre del lugar)', async () => {
    const casa = await desdeGoogle({ placeId: 'ChIJ_monserrat' });
    const { json: r } = await desdeGoogle({ placeId: 'ChIJ_monserrat', frecuente: true, nombre: 'Colegio Nacional de Monserrat' });

    assert.equal(r.ubicacion.id, casa.json.ubicacion.id);
    assert.equal(r.ubicacion.nombre, 'Colegio Nacional de Monserrat');
    assert.equal(filas[0].esFrecuente, true);
    assert.equal(filas[0].nombreNormalizado, 'colegio nacional de monserrat');
    assert.equal(detalles().length, 1, 'la segunda vez no llama a Google');
  });
});

// --- Google: ubicar una existente --------------------------------------------

const ubicar = (id, body, perfil) => pedir('PUT', `/ubicaciones/${id}/ubicar-desde-google`, { body, perfil });

describe('PUT /ubicaciones/:id/ubicar-desde-google', () => {
  test('a una frecuente sin ubicar (del Excel) le completa el placeId, con el sessionToken de la búsqueda', async () => {
    const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');

    const { status, json: r } = await ubicar(excel.id, { placeId: 'ChIJ_monserrat', sessionToken: TOKEN });

    assert.equal(status, 200);
    assert.equal(r.ubicacion.placeId, 'ChIJ_monserrat');
    assert.equal(r.ubicacion.nombre, 'Colegio Nacional de Monserrat', 'el nombre no cambia');
    assert.deepEqual(actualizaciones, [{ id: excel.id, data: { placeId: 'ChIJ_monserrat' } }]);
    assert.equal(detalles()[0].params.sessionToken, TOKEN);
  });

  test('ya ubicada (coordenadas de Georef): 409 y no se llama a Google', async () => {
    const cosquin = cargarFila('Cosquín', 'cosquin', { latitud: -31.24, longitud: -64.46 });
    const { status, json: r } = await ubicar(cosquin.id, { placeId: 'ChIJ_monserrat' });
    assert.equal(status, 409);
    assert.match(r.error, /ya está ubicada/);
    assert.equal(llamadasGoogle.length, 0);
  });

  test('ese lugar ya es otra ubicación: 409 que dice cuál', async () => {
    cargarFila('Monserrat', 'monserrat', { placeId: 'ChIJ_monserrat' });
    const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');
    const { status, json: r } = await ubicar(excel.id, { placeId: 'ChIJ_monserrat' });
    assert.equal(status, 409);
    assert.match(r.error, /ya está cargado como "Monserrat"/);
    assert.equal(excel.placeId, null);
  });

  test('ubicación inexistente o id inválido: 404', async () => {
    assert.equal((await ubicar(99, { placeId: 'ChIJ_monserrat' })).status, 404);
    assert.equal((await ubicar('abc', { placeId: 'ChIJ_monserrat' })).status, 404);
  });

  test('sin placeId: 400', async () => {
    const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');
    assert.equal((await ubicar(excel.id, {})).status, 400);
  });

  test('sin GOOGLE_MAPS_API_KEY: 503 y no se toca la fila', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');
    assert.equal((await ubicar(excel.id, { placeId: 'ChIJ_monserrat' })).status, 503);
    assert.equal(excel.placeId, null);
  });
});

describe('permisos de los endpoints de Google (los mismos que crear una ubicación)', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil}: puede`, async () => {
      assert.equal((await sugerir('colon 1234', TOKEN, perfil)).status, 200);
      assert.equal((await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' }, perfil)).status, 200);
    });
  }
  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 en los tres y no se llama a Google`, async () => {
      const excel = cargarFila('Colegio Nacional de Monserrat', 'colegio nacional de monserrat');
      assert.equal((await sugerir('colon 1234', TOKEN, perfil)).status, 403);
      assert.equal((await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' }, perfil)).status, 403);
      assert.equal((await ubicar(excel.id, { placeId: 'ChIJ_monserrat' }, perfil)).status, 403);
      assert.equal(llamadasGoogle.length, 0);
    });
  }
  test('sin token: 401', async () => {
    assert.equal((await sugerir('colon 1234', TOKEN, null)).status, 401);
  });
});

// --- Tope diario propio -----------------------------------------------------

const MENSAJE_TOPE = 'Se alcanzó el límite diario de consultas a Google Maps. Intentá mañana o cargá los km a mano.';

describe('tope diario de llamadas a Google', () => {
  test('autocomplete: pasado el límite, 429 con el mensaje y SIN llamar a Google', async () => {
    process.env.GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE = '2';
    assert.equal((await sugerir('colon 1234')).status, 200);
    assert.equal((await sugerir('colon 1235')).status, 200);

    const { status, json: r } = await sugerir('colon 1236');
    assert.equal(status, 429);
    assert.equal(r.error, MENSAJE_TOPE);
    assert.equal(autocompletes().length, 2);
  });

  test('place details tiene su propio tope: 429 y no se crea nada', async () => {
    process.env.GOOGLE_LIMITE_DIARIO_DETALLES = '0';
    const { status, json: r } = await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' });
    assert.equal(status, 429);
    assert.equal(r.error, MENSAJE_TOPE);
    assert.equal(filas.length, 0);
    assert.equal(llamadasGoogle.length, 0);
    assert.equal((await sugerir('colon 1234')).status, 200, 'el tope de detalles no frena las sugerencias');
  });

  test('una casa ya guardada se puede volver a elegir aunque se haya llegado al tope (no llama a Google)', async () => {
    await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' });
    process.env.GOOGLE_LIMITE_DIARIO_DETALLES = '0';
    assert.equal((await desdeGoogle({ placeId: 'ChIJ_casa_colon_1234' })).status, 200);
  });

  test('sin key no se cuenta nada (503 antes del tope)', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.equal((await sugerir('colon 1234')).status, 503);
    assert.equal(limiteDiario.usoDeHoy().autocomplete, 0);
  });
});

// --- Plan B: sin Google, crear por nombre -----------------------------------

describe('plan B sin Google: crear una frecuente por nombre', () => {
  test('POST /ubicaciones crea la frecuente sin placeId, sin key y sin llamar a Google', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { status, json: r } = await crear('Escuela Normal Alejandro Carbó');

    assert.equal(status, 200);
    assert.equal(r.ubicacion.placeId, null);
    assert.equal(r.ubicacion.latitud, null);
    assert.equal(filas[0].esFrecuente, true);
    assert.equal(llamadasGoogle.length, 0);
    assert.deepEqual((await buscar('carbo')).json.ubicaciones.map((u) => u.id), [r.ubicacion.id], 'aparece en Frecuentes');
  });

  test('después se completa con Google ("Ubicarla"): PUT ubicar-desde-google', async () => {
    const { json: creada } = await crear('Colegio Nacional de Monserrat');
    const { status, json: r } = await ubicar(creada.ubicacion.id, { placeId: 'ChIJ_monserrat', sessionToken: TOKEN });
    assert.equal(status, 200);
    assert.equal(r.ubicacion.placeId, 'ChIJ_monserrat');
  });
});
