// Tests de POST /viajes/estimar-km (km estimados con OpenRouteService a partir
// de las coordenadas guardadas de cada ubicación).
//
// App real de Express con JWT real, Prisma reemplazado por un doble en memoria
// y fetch reemplazado: las llamadas a ORS NUNCA salen a internet (las responde
// un ORS falso); las del test a la app sí usan el fetch real.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const CLAVE = 'clave-ors-de-prueba-1234567890';

// --- Ubicaciones en la base (doble de Prisma) -------------------------------

// Coordenadas de Georef (centroides). Las dos últimas todavía no se ubicaron en
// el mapa.
const UBICACIONES = [
  { id: 1, nombre: 'Córdoba', latitud: -31.4168, longitud: -64.1836 },
  { id: 2, nombre: 'Villa Carlos Paz', latitud: -31.4179, longitud: -64.494 },
  { id: 3, nombre: 'Alta Gracia', latitud: -31.6498, longitud: -64.4299 },
  { id: 4, nombre: 'Río Cuarto', latitud: -33.1238, longitud: -64.349 },
  { id: 9, nombre: 'Cosquín', latitud: -31.2437, longitud: -64.4653 },
  { id: 20, nombre: 'Colegio Nacional de Monserrat', latitud: null, longitud: null },
  { id: 21, nombre: 'Hotel Sierras', latitud: null, longitud: null },
];

const llamadasPrisma = [];
const prismaFalso = {
  ubicacion: {
    findMany: async (args) => {
      llamadasPrisma.push(args);
      return UBICACIONES.filter((u) => args.where.id.in.includes(u.id)).map((u) =>
        Object.fromEntries(Object.keys(args.select).map((k) => [k, u[k]]))
      );
    },
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const servicio = require(path.join(SRC, 'services', 'estimacionRecorridoService.js'));
const ors = require(path.join(SRC, 'services', 'openRouteService.js'));

// --- ORS falso -------------------------------------------------------------

let llamadasOrs = [];
// Permite que un test cambie la respuesta de ORS: (llamada) => Response | undefined.
let comportamiento = null;
const RUTA_FELIZ = { distance: 123456.7, duration: 5430 }; // 123 km, 91 min

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function orsFalso(url, opciones) {
  const u = new URL(url);
  const llamada = {
    url: String(url),
    origen: u.origin,
    path: u.pathname,
    method: opciones.method,
    headers: opciones.headers,
    body: opciones.body ? JSON.parse(opciones.body) : null,
    signal: opciones.signal,
  };
  llamadasOrs.push(llamada);

  const especial = comportamiento?.(llamada);
  if (especial) return especial;

  if (llamada.path === '/openrouteservice/v2/directions/driving-car') {
    return json(200, { routes: [{ summary: RUTA_FELIZ }] });
  }
  return json(404, { error: 'ruta desconocida en el ORS falso' });
}

const fetchReal = globalThis.fetch;
let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  // Lo que va a la app usa el fetch real; todo lo demás es "ORS".
  globalThis.fetch = (url, opciones = {}) =>
    String(url).startsWith(base) ? fetchReal(url, opciones) : Promise.resolve().then(() => orsFalso(url, opciones));
});

after(() => {
  globalThis.fetch = fetchReal;
  return new Promise((resolver) => servidor.close(resolver));
});

beforeEach(() => {
  llamadasOrs = [];
  llamadasPrisma.length = 0;
  comportamiento = null;
  process.env.ORS_API_KEY = CLAVE;
  delete process.env.ORS_BASE_URL;
});

afterEach(() => {
  delete process.env.ORS_API_KEY;
});

async function estimar(body, perfil = 'ENCARGADO') {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) headers.Authorization = `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}`;
  const r = await fetchReal(`${base}/viajes/estimar-km`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

const directions = () => llamadasOrs.filter((l) => l.path === '/openrouteservice/v2/directions/driving-car');

// --- Camino feliz ----------------------------------------------------------

describe('camino feliz', () => {
  test('con 2 paradas: km redondeados, duración en minutos y UNA sola llamada a ORS', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    assert.equal(status, 200);
    assert.deepEqual(r, { kilometros: 123, duracionMinutos: 91 });
    assert.equal(llamadasOrs.length, 1, 'nada de geocoding: solo directions');
    assert.equal(directions().length, 1);
    assert.equal(llamadasPrisma.length, 1, 'las coordenadas salen de un solo findMany');
    assert.deepEqual(llamadasPrisma[0].select, { id: true, nombre: true, latitud: true, longitud: true });
  });

  test('directions recibe las coordenadas guardadas, en orden y como [longitud, latitud]', async () => {
    await estimar({ origenId: 1, paradaIds: [3], destinoId: 4 });

    const [ruta] = directions();
    assert.equal(ruta.method, 'POST');
    assert.deepEqual(ruta.body.coordinates, [
      [-64.1836, -31.4168], // Córdoba: [lon, lat]
      [-64.4299, -31.6498], // Alta Gracia
      [-64.349, -33.1238], // Río Cuarto
    ]);
  });

  test('cada punto se engancha a la calle más cercana hasta 5 km (no los 350 m por defecto de ORS)', async () => {
    await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });
    assert.equal(ors.RADIO_ENGANCHE_M, 5000);
    assert.deepEqual(directions()[0].body.radiuses, [5000, 5000, 5000, 5000]);
  });

  test('Córdoba → Cosquín usa el punto guardado de Cosquín (no se interpreta el nombre)', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 9 });
    assert.deepEqual(directions()[0].body.coordinates[1], [-64.4653, -31.2437]);
  });

  test('URL del dominio nuevo (api.heigit.org), sin barra final antes de la ruta', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(directions()[0].origen, 'https://api.heigit.org');
    assert.equal(directions()[0].url, 'https://api.heigit.org/openrouteservice/v2/directions/driving-car');
  });

  test('ORS_BASE_URL con barra final: se le saca la barra', async () => {
    process.env.ORS_BASE_URL = 'https://ors.ejemplo.test/';
    await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(directions()[0].url, 'https://ors.ejemplo.test/openrouteservice/v2/directions/driving-car');
  });

  test('la key va en el header Authorization y en ninguna URL ni cuerpo', async () => {
    await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    const [llamada] = llamadasOrs;
    assert.equal(llamada.headers.Authorization, CLAVE);
    assert.ok(!llamada.url.includes(CLAVE));
    assert.ok(!JSON.stringify(llamada.body).includes(CLAVE));
  });

  test('ida y vuelta: la ruta pasa por los 4 puntos aunque Córdoba se repita', async () => {
    const { status } = await estimar({ origenId: 1, paradaIds: [2, 3], destinoId: 1 });

    assert.equal(status, 200);
    const { coordinates } = directions()[0].body;
    assert.equal(coordinates.length, 4);
    assert.deepEqual(coordinates[0], coordinates[3]);
  });

  test('paradaIds ausente equivale a sin paradas', async () => {
    const { status } = await estimar({ origenId: 1, destinoId: 2 });
    assert.equal(status, 200);
    assert.equal(directions()[0].body.coordinates.length, 2);
  });
});

// --- Ubicaciones sin coordenadas -------------------------------------------

describe('ubicación sin coordenadas', () => {
  test('422 que dice cuál, con su id, y no se llama a ORS', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 20 });

    assert.equal(status, 422);
    assert.equal(r.error, 'Falta ubicar "Colegio Nacional de Monserrat" en el mapa.');
    assert.deepEqual(r.ubicacionesSinCoordenadas, [{ ubicacionId: 20, nombre: 'Colegio Nacional de Monserrat' }]);
    assert.equal(llamadasOrs.length, 0);
  });

  test('varias: todas, en el orden del recorrido y sin repetir', async () => {
    const { status, json: r } = await estimar({ origenId: 21, paradaIds: [1, 20, 2], destinoId: 21 });

    assert.equal(status, 422);
    assert.equal(r.error, 'Faltan ubicar en el mapa: "Hotel Sierras", "Colegio Nacional de Monserrat".');
    assert.deepEqual(
      r.ubicacionesSinCoordenadas.map((u) => u.ubicacionId),
      [21, 20]
    );
    assert.equal(llamadasOrs.length, 0);
  });
});

// --- Errores de ORS ---------------------------------------------------------

describe('errores de ORS', () => {
  test('cuota agotada (429): 429 con "intentá más tarde"', async () => {
    comportamiento = (l) => (l.path.includes('directions') ? json(429, {}) : undefined);
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 429);
    assert.match(r.error, /cuota/);
    assert.match(r.error, /Intentá más tarde/);
  });

  test('ruta imposible (404 de directions, código 2010): 422', async () => {
    comportamiento = (l) =>
      l.path.includes('directions') ? json(404, { error: { code: 2010, message: 'Could not find routable point' } }) : undefined;
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 422);
    assert.match(r.error, /No hay una ruta/);
  });

  test('ruta imposible (400 de directions, código 2004): 422', async () => {
    comportamiento = (l) => (l.path.includes('directions') ? json(400, { error: { code: 2004 } }) : undefined);
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 })).status, 422);
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
    // ORS que nunca contesta: solo termina cuando se aborta la señal.
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
    assert.equal(ors.TIMEOUT_MS, 8000);
  });

  test('ORS caído (error de red): 502', async () => {
    comportamiento = () => {
      throw new TypeError('fetch failed');
    };
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 502);
    assert.match(r.error, /No se pudo conectar/);
  });

  test('ORS con error interno (500): 502', async () => {
    comportamiento = (l) => (l.path.includes('directions') ? json(500, {}) : undefined);
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 })).status, 502);
  });

  test('key rechazada por ORS (401/403): 503 sin mostrar la key', async () => {
    comportamiento = () => json(403, { error: 'Access to this API has been disallowed' });
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 503);
    assert.match(r.error, /clave de OpenRouteService no es válida/);
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });
});

// --- Configuración, permisos y validación ----------------------------------

describe('falta ORS_API_KEY', () => {
  test('503 con mensaje claro y sin llamar a ORS ni a la base', async () => {
    delete process.env.ORS_API_KEY;
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 503);
    assert.match(r.error, /falta configurar OpenRouteService/);
    assert.equal(llamadasOrs.length, 0);
    assert.equal(llamadasPrisma.length, 0);
  });

  test('el resto de la app sigue funcionando', async () => {
    delete process.env.ORS_API_KEY;
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
    test(`${perfil}: 403 y no se llama a ORS`, async () => {
      assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 }, perfil)).status, 403);
      assert.equal(llamadasOrs.length, 0);
    });
  }
  test('sin token: 401', async () => {
    assert.equal((await estimar({ origenId: 1, paradaIds: [], destinoId: 2 }, null)).status, 401);
    assert.equal(llamadasOrs.length, 0);
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
    test(`${nombre}: 400 en "${campo}" y no se llama a ORS`, async () => {
      const { status, json: r } = await estimar(body);
      assert.equal(status, 400);
      assert.match(r.errores[campo], mensaje);
      assert.equal(llamadasOrs.length, 0);
    });
  }

  test('9 paradas (el máximo) sí se aceptan', async () => {
    const { status } = await estimar({ origenId: 1, paradaIds: [2, 3, 2, 3, 2, 3, 2, 3, 2], destinoId: 4 });
    assert.equal(status, 200);
    assert.equal(directions()[0].body.coordinates.length, 11);
  });
});
