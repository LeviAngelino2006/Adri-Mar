// Tests de POST /viajes/estimar-km (km estimados con la Routes API de Google a
// partir del placeId o de las coordenadas guardadas de cada ubicación).
//
// App real de Express con JWT real, Prisma reemplazado por un doble en memoria
// y fetch reemplazado: las llamadas a Google NUNCA salen a internet (las
// responde un Google falso); las del test a la app sí usan el fetch real.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const CLAVE = 'clave-google-de-prueba-AIzaXYZ123';

// --- Ubicaciones en la base (doble de Prisma) -------------------------------

// Localidades de Georef (coordenadas), lugares elegidos en Google (placeId) y
// dos frecuentes que todavía no están en el mapa.
const UBICACIONES = [
  { id: 1, nombre: 'Córdoba', latitud: -31.4168, longitud: -64.1836 },
  { id: 2, nombre: 'Villa Carlos Paz', latitud: -31.4179, longitud: -64.494 },
  { id: 3, nombre: 'Alta Gracia', latitud: -31.6498, longitud: -64.4299 },
  { id: 4, nombre: 'Río Cuarto', latitud: -33.1238, longitud: -64.349 },
  { id: 9, nombre: 'Cosquín', latitud: -31.2437, longitud: -64.4653 },
  { id: 10, nombre: 'Av. Colón 1234, X5000 Córdoba', placeId: 'ChIJ_casa_colon_1234' },
  { id: 11, nombre: 'Aeropuerto Internacional Ing. Ambrosio L.V. Taravella', placeId: 'ChIJ_aeropuerto' },
  { id: 20, nombre: 'Colegio Nacional de Monserrat' },
  { id: 21, nombre: 'Hotel Sierras' },
];

const llamadasPrisma = [];
const prismaFalso = {
  ubicacion: {
    findMany: async (args) => {
      llamadasPrisma.push(args);
      return UBICACIONES.filter((u) => args.where.id.in.includes(u.id)).map((u) =>
        Object.fromEntries(Object.keys(args.select).map((k) => [k, u[k] ?? null]))
      );
    },
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const servicio = require(path.join(SRC, 'services', 'estimacionRecorridoService.js'));
const google = require(path.join(SRC, 'services', 'googleMapsService.js'));
const limiteDiario = require(path.join(SRC, 'utils', 'limiteDiarioGoogle.js'));

// --- Google falso -------------------------------------------------------------

let llamadasGoogle = [];
// Permite que un test cambie la respuesta: (llamada) => Response | undefined.
let comportamiento = null;
const RUTA_FELIZ = { distanceMeters: 123457, duration: '5430s' }; // 123 km, 91 min

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function googleFalso(url, opciones) {
  const llamada = {
    url: String(url),
    method: opciones.method,
    headers: opciones.headers,
    body: opciones.body ? JSON.parse(opciones.body) : null,
    signal: opciones.signal,
  };
  llamadasGoogle.push(llamada);

  const especial = comportamiento?.(llamada);
  if (especial) return especial;

  if (llamada.url === 'https://routes.googleapis.com/directions/v2:computeRoutes') {
    return json(200, { routes: [RUTA_FELIZ] });
  }
  return json(404, { error: 'ruta desconocida en el Google falso' });
}

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
  llamadasGoogle = [];
  llamadasPrisma.length = 0;
  comportamiento = null;
  process.env.GOOGLE_MAPS_API_KEY = CLAVE;
  limiteDiario.reiniciar();
  for (const v of ['GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE', 'GOOGLE_LIMITE_DIARIO_DETALLES', 'GOOGLE_LIMITE_DIARIO_RUTAS']) delete process.env[v];
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

async function estimar(body, perfil = 'ENCARGADO') {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) headers.Authorization = `Bearer ${generarToken({ id: 1, personaId: 1, nombreUsuario: 'test', perfil })}`;
  const r = await fetchReal(`${base}/viajes/estimar-km`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

const latLng = (latitude, longitude) => ({ location: { latLng: { latitude, longitude } } });

// --- Camino feliz ----------------------------------------------------------

describe('camino feliz', () => {
  test('con 2 paradas: km redondeados, duración en minutos y UNA sola llamada a computeRoutes', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    assert.equal(status, 200);
    assert.deepEqual(r, { kilometros: 123, duracionMinutos: 91 });
    assert.equal(llamadasGoogle.length, 1);
    assert.equal(llamadasPrisma.length, 1, 'los puntos salen de un solo findMany');
    assert.deepEqual(llamadasPrisma[0].select, { id: true, nombre: true, placeId: true, latitud: true, longitud: true });
  });

  test('computeRoutes: POST, DRIVE, TRAFFIC_UNAWARE (SKU Essentials), métrico y en castellano', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });

    const [l] = llamadasGoogle;
    assert.equal(l.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal(l.method, 'POST');
    assert.equal(l.headers['X-Goog-FieldMask'], 'routes.distanceMeters,routes.duration');
    assert.equal(l.body.travelMode, 'DRIVE');
    assert.equal(l.body.routingPreference, 'TRAFFIC_UNAWARE');
    assert.equal(l.body.languageCode, 'es');
    assert.equal(l.body.units, 'METRIC');
    assert.ok(!('intermediates' in l.body), 'sin paradas no se manda intermediates');
  });

  test('sin placeId cada punto va por latLng, en orden', async () => {
    await estimar({ origenId: 1, paradaIds: [3], destinoId: 4 });

    const { body } = llamadasGoogle[0];
    assert.deepEqual(body.origin, latLng(-31.4168, -64.1836));
    assert.deepEqual(body.intermediates, [latLng(-31.6498, -64.4299)]);
    assert.deepEqual(body.destination, latLng(-33.1238, -64.349));
  });

  test('con placeId va por placeId (la dirección exacta elegida en Google): casa del pasajero → aeropuerto', async () => {
    const { status } = await estimar({ origenId: 10, paradaIds: [], destinoId: 11 });

    assert.equal(status, 200);
    assert.deepEqual(llamadasGoogle[0].body.origin, { placeId: 'ChIJ_casa_colon_1234' });
    assert.deepEqual(llamadasGoogle[0].body.destination, { placeId: 'ChIJ_aeropuerto' });
  });

  test('mezcla de placeId y latLng en el mismo recorrido', async () => {
    await estimar({ origenId: 10, paradaIds: [9], destinoId: 11 });
    assert.deepEqual(llamadasGoogle[0].body.intermediates, [latLng(-31.2437, -64.4653)]);
  });

  test('la key va en el header X-Goog-Api-Key y en ninguna URL, cuerpo ni respuesta', async () => {
    const { json: r } = await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    const [l] = llamadasGoogle;
    assert.equal(l.headers['X-Goog-Api-Key'], CLAVE);
    assert.ok(!l.url.includes(CLAVE));
    assert.ok(!JSON.stringify(l.body).includes(CLAVE));
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });

  test('ida y vuelta: la ruta pasa por los 4 puntos aunque Córdoba se repita', async () => {
    const { status } = await estimar({ origenId: 1, paradaIds: [2, 3], destinoId: 1 });

    assert.equal(status, 200);
    const { body } = llamadasGoogle[0];
    assert.equal(body.intermediates.length, 2);
    assert.deepEqual(body.origin, body.destination);
  });

  test('paradaIds ausente equivale a sin paradas', async () => {
    const { status } = await estimar({ origenId: 1, destinoId: 2 });
    assert.equal(status, 200);
    assert.ok(!('intermediates' in llamadasGoogle[0].body));
  });

  test('un recorrido de distancia 0 viene sin distanceMeters: 0 km', async () => {
    comportamiento = () => json(200, { routes: [{ duration: '0s' }] });
    const { json: r } = await estimar({ origenId: 1, destinoId: 2 });
    assert.deepEqual(r, { kilometros: 0, duracionMinutos: 0 });
  });
});

// --- Ubicaciones sin ubicar ---------------------------------------------------

describe('ubicación sin placeId ni coordenadas', () => {
  test('422 que dice cuál, con su id, y no se llama a Google', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 20 });

    assert.equal(status, 422);
    assert.equal(r.error, 'Falta ubicar "Colegio Nacional de Monserrat" en el mapa.');
    assert.deepEqual(r.ubicacionesSinCoordenadas, [{ ubicacionId: 20, nombre: 'Colegio Nacional de Monserrat' }]);
    assert.equal(llamadasGoogle.length, 0);
  });

  test('varias: todas, en el orden del recorrido y sin repetir', async () => {
    const { status, json: r } = await estimar({ origenId: 21, paradaIds: [1, 20, 2], destinoId: 21 });

    assert.equal(status, 422);
    assert.equal(r.error, 'Faltan ubicar en el mapa: "Hotel Sierras", "Colegio Nacional de Monserrat".');
    assert.deepEqual(r.ubicacionesSinCoordenadas.map((u) => u.ubicacionId), [21, 20]);
    assert.equal(llamadasGoogle.length, 0);
  });

  test('una que tiene placeId pero no coordenadas NO falta (las de Google no guardan coordenadas)', async () => {
    assert.equal((await estimar({ origenId: 10, destinoId: 11 })).status, 200);
  });
});

// --- Errores de Google --------------------------------------------------------

describe('errores de Google', () => {
  test('cuota agotada (429): 429 con "intentá más tarde"', async () => {
    comportamiento = () => json(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 429);
    assert.match(r.error, /cuota/);
    assert.match(r.error, /Intentá más tarde/);
  });

  test('sin ruta posible (200 con objeto vacío): 422', async () => {
    comportamiento = () => json(200, {});
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 422);
    assert.match(r.error, /No hay una ruta/);
  });

  test('sin ruta posible (200 con routes vacío): 422', async () => {
    comportamiento = () => json(200, { routes: [] });
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 422);
    assert.match(r.error, /No hay una ruta/);
  });

  test('un placeId que Google ya no reconoce (400/404): 422', async () => {
    comportamiento = () => json(400, { error: { status: 'INVALID_ARGUMENT' } });
    assert.equal((await estimar({ origenId: 10, destinoId: 11 })).status, 422);
    comportamiento = () => json(404, { error: { status: 'NOT_FOUND' } });
    assert.equal((await estimar({ origenId: 10, destinoId: 11 })).status, 422);
  });

  test('timeout (AbortError): 503 con mensaje de "no respondió a tiempo"', async () => {
    comportamiento = () => {
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    };
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 503);
    assert.match(r.error, /no respondió a tiempo/);
  });

  test('timeout real: el AbortController corta la llamada al vencer el plazo', async () => {
    let abortadas = 0;
    // Google que nunca contesta: solo termina cuando se aborta la señal.
    comportamiento = (l) =>
      new Promise((_, rechazar) => {
        l.signal.addEventListener('abort', () => {
          abortadas += 1;
          rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    const inicio = Date.now();
    await assert.rejects(
      servicio.estimarKm({ origenId: 1, paradaIds: [], destinoId: 2 }, { timeoutMs: 50 }),
      (err) => err instanceof servicio.ErrorMapa && err.status === 503
    );
    assert.ok(Date.now() - inicio < 2000, 'tiene que cortar por el plazo, no quedarse esperando');
    assert.ok(abortadas >= 1);
  });

  test('el plazo por defecto es de 8 segundos', () => {
    assert.equal(google.TIMEOUT_MS, 8000);
  });

  test('Google caído (error de red): 502', async () => {
    comportamiento = () => {
      throw new TypeError('fetch failed');
    };
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 502);
    assert.match(r.error, /No se pudo conectar/);
  });

  test('Google con error interno (500): 502', async () => {
    comportamiento = () => json(500, {});
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 })).status, 502);
  });

  test('key rechazada o Routes API no habilitada (403): 503 sin mostrar la key', async () => {
    comportamiento = () => json(403, { error: { status: 'PERMISSION_DENIED' } });
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 503);
    assert.match(r.error, /no es válida/);
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });
});

// --- Sin ruta: qué tramo falla -----------------------------------------------

describe('sin ruta: qué tramo falla', () => {
  // Córdoba → Alta Gracia → Villa Carlos Paz → Río Cuarto: 3 tramos.
  const RECORRIDO = { origenId: 1, paradaIds: [3, 2], destinoId: 4 };
  const PUNTOS = {
    1: latLng(-31.4168, -64.1836),
    3: latLng(-31.6498, -64.4299),
    2: latLng(-31.4179, -64.494),
    4: latLng(-33.1238, -64.349),
  };
  const GENERICO = 'No hay una ruta en auto que una todos los puntos del recorrido. Revisá las ubicaciones.';

  const esTramo = (body, desde, hasta) =>
    !body.intermediates &&
    JSON.stringify(body.origin) === JSON.stringify(PUNTOS[desde]) &&
    JSON.stringify(body.destination) === JSON.stringify(PUNTOS[hasta]);

  // Google falso: el recorrido completo no tiene ruta (200 con {}) y el tramo
  // desde → hasta tampoco; los demás tramos sí.
  const sinRutaEntre = (desde, hasta) => (l) => {
    if (l.body.intermediates || esTramo(l.body, desde, hasta)) return json(200, {});
    return undefined;
  };

  test('camino feliz: una sola llamada, con el recorrido completo, y una sola del tope', async () => {
    const { status } = await estimar(RECORRIDO);
    assert.equal(status, 200);
    assert.equal(llamadasGoogle.length, 1);
    assert.equal(llamadasGoogle[0].body.intermediates.length, 2);
    assert.equal(limiteDiario.usoDeHoy().rutas, 1);
  });

  test('falla el primer tramo: 422 con «Córdoba» y «Alta Gracia», 2 llamadas', async () => {
    comportamiento = sinRutaEntre(1, 3);
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, 'No hay una ruta en auto entre «Córdoba» y «Alta Gracia». Revisá esas ubicaciones.');
    assert.equal(llamadasGoogle.length, 2);
    assert.equal(limiteDiario.usoDeHoy().rutas, 2);
  });

  test('falla un tramo del medio: 422 con «Alta Gracia» y «Villa Carlos Paz», 3 llamadas en orden', async () => {
    comportamiento = sinRutaEntre(3, 2);
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, 'No hay una ruta en auto entre «Alta Gracia» y «Villa Carlos Paz». Revisá esas ubicaciones.');
    assert.equal(llamadasGoogle.length, 3);
    assert.ok(esTramo(llamadasGoogle[1].body, 1, 3));
    assert.ok(esTramo(llamadasGoogle[2].body, 3, 2));
  });

  test('falla el último tramo: 422 con «Villa Carlos Paz» y «Río Cuarto», 4 llamadas', async () => {
    comportamiento = sinRutaEntre(2, 4);
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, 'No hay una ruta en auto entre «Villa Carlos Paz» y «Río Cuarto». Revisá esas ubicaciones.');
    assert.equal(llamadasGoogle.length, 4);
    assert.ok(esTramo(llamadasGoogle[3].body, 2, 4));
  });

  test('cada tramo es un computeRoutes igual al completo (field mask, DRIVE, TRAFFIC_UNAWARE), sin intermedios', async () => {
    comportamiento = sinRutaEntre(2, 4);
    await estimar(RECORRIDO);
    for (const l of llamadasGoogle) {
      assert.equal(l.url, google.URL_RUTAS);
      assert.equal(l.method, 'POST');
      assert.equal(l.headers['X-Goog-FieldMask'], 'routes.distanceMeters,routes.duration');
      assert.equal(l.body.travelMode, 'DRIVE');
      assert.equal(l.body.routingPreference, 'TRAFFIC_UNAWARE');
    }
    assert.ok(esTramo(llamadasGoogle[1].body, 1, 3));
    assert.ok(esTramo(llamadasGoogle[2].body, 3, 2));
    assert.ok(esTramo(llamadasGoogle[3].body, 2, 4));
  });

  test('tope alcanzado a mitad del diagnóstico: 422 con el mensaje genérico, no 429', async () => {
    process.env.GOOGLE_LIMITE_DIARIO_RUTAS = '2';
    comportamiento = sinRutaEntre(2, 4);
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, GENERICO);
    // Completo + primer tramo; el segundo ya no sale (el tope lo corta).
    assert.equal(llamadasGoogle.length, 2);
    assert.equal(limiteDiario.usoDeHoy().rutas, 2);
  });

  test('Google con error durante el diagnóstico: 422 con el mensaje genérico', async () => {
    comportamiento = (l) => (l.body.intermediates ? json(200, {}) : json(500, {}));
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, GENERICO);
    assert.equal(llamadasGoogle.length, 2);
  });

  test('todos los tramos tienen ruta: 422 con el mensaje genérico, 4 llamadas', async () => {
    comportamiento = (l) => (l.body.intermediates ? json(200, {}) : undefined);
    const { status, json: r } = await estimar(RECORRIDO);
    assert.equal(status, 422);
    assert.equal(r.error, GENERICO);
    assert.equal(llamadasGoogle.length, 4);
  });

  test('sin paradas el único tramo es el recorrido: mensaje con los dos puntos y UNA sola llamada', async () => {
    comportamiento = () => json(200, {});
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 4 });
    assert.equal(status, 422);
    assert.equal(r.error, 'No hay una ruta en auto entre «Córdoba» y «Río Cuarto». Revisá esas ubicaciones.');
    assert.equal(llamadasGoogle.length, 1);
  });

  test('un placeId que Google ya no reconoce (400) también se diagnostica por tramo', async () => {
    // Casa del pasajero → Córdoba → aeropuerto, con el placeId del aeropuerto vencido.
    comportamiento = (l) => (JSON.stringify(l.body).includes('ChIJ_aeropuerto') ? json(400, { error: { status: 'INVALID_ARGUMENT' } }) : undefined);
    const { status, json: r } = await estimar({ origenId: 10, paradaIds: [1], destinoId: 11 });
    assert.equal(status, 422);
    assert.equal(
      r.error,
      'No hay una ruta en auto entre «Córdoba» y «Aeropuerto Internacional Ing. Ambrosio L.V. Taravella». Revisá esas ubicaciones.'
    );
    assert.equal(llamadasGoogle.length, 3);
  });
});

// --- Configuración, permisos y validación ----------------------------------

describe('tope diario de rutas', () => {
  test('pasado GOOGLE_LIMITE_DIARIO_RUTAS: 429 "cargá los km a mano" sin llamar a Google', async () => {
    process.env.GOOGLE_LIMITE_DIARIO_RUTAS = '1';
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 })).status, 200);

    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 9 });
    assert.equal(status, 429);
    assert.equal(r.error, 'Se alcanzó el límite diario de consultas a Google Maps. Intentá mañana o cargá los km a mano.');
    assert.equal(llamadasGoogle.length, 1);
  });

  test('un 422 por ubicación sin ubicar no gasta del tope', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 20 });
    assert.equal(limiteDiario.usoDeHoy().rutas, 0);
  });
});

describe('falta GOOGLE_MAPS_API_KEY', () => {
  test('503 con mensaje claro y sin llamar a Google ni a la base', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 503);
    assert.match(r.error, /falta configurar GOOGLE_MAPS_API_KEY/);
    assert.equal(llamadasGoogle.length, 0);
    assert.equal(llamadasPrisma.length, 0);
  });

  test('el resto de la app sigue funcionando', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const r = await fetchReal(`${base}/health`);
    assert.equal(r.status, 200);
  });
});

describe('permisos', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil}: 200`, async () => {
      assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 }, perfil)).status, 200);
    });
  }
  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se llama a Google`, async () => {
      assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 }, perfil)).status, 403);
      assert.equal(llamadasGoogle.length, 0);
    });
  }
  test('sin token: 401', async () => {
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 }, null)).status, 401);
    assert.equal(llamadasGoogle.length, 0);
  });
});

describe('validación (mismas reglas que el recorrido de un viaje)', () => {
  const CASOS = [
    ['origen inexistente', { origenId: 99, paradaIds: [], destinoId: 2 }, 'origenId', /no existe/],
    ['destino inexistente', { origenId: 1, paradaIds: [], destinoId: 98 }, 'destinoId', /no existe/],
    ['parada inexistente', { origenId: 1, paradaIds: [97], destinoId: 2 }, 'paradas', /no existe/],
    ['sin origen', { paradaIds: [], destinoId: 2 }, 'origenId', /obligatorio/],
    ['texto libre en vez de id', { origenId: 'Córdoba', paradaIds: [], destinoId: 2 }, 'origenId', /no es válido/],
    ['paradas con texto libre', { origenId: 1, paradaIds: ['Alta Gracia'], destinoId: 2 }, 'paradas', /no son válidas/],
    ['más de 9 paradas', { origenId: 1, paradaIds: [2, 3, 2, 3, 2, 3, 2, 3, 2, 3], destinoId: 4 }, 'paradas', /Máximo 9/],
    ['paradas consecutivas iguales', { origenId: 1, paradaIds: [2, 2], destinoId: 4 }, 'paradas', /igual al punto anterior/],
    ['origen igual a destino sin paradas', { origenId: 1, paradaIds: [], destinoId: 1 }, 'destinoId', /mismo que el origen/],
  ];
  for (const [nombre, body, campo, mensaje] of CASOS) {
    test(`${nombre}: 400 en "${campo}" y no se llama a Google`, async () => {
      const { status, json: r } = await estimar(body);
      assert.equal(status, 400);
      assert.match(r.errores[campo], mensaje);
      assert.equal(llamadasGoogle.length, 0);
    });
  }

  test('9 paradas (el máximo) sí se aceptan y siguen en el SKU Essentials (≤ 10 intermedios)', async () => {
    const { status } = await estimar({ origenId: 1, paradaIds: [2, 3, 2, 3, 2, 3, 2, 3, 2], destinoId: 4 });
    assert.equal(status, 200);
    assert.equal(llamadasGoogle[0].body.intermediates.length, 9);
  });
});
