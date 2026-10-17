// Tests de POST /viajes/estimar-km (km estimados con OpenRouteService).
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

const UBICACIONES = [
  { id: 1, nombre: 'Córdoba' },
  { id: 2, nombre: 'Villa Carlos Paz' },
  { id: 3, nombre: 'Alta Gracia' },
  { id: 4, nombre: 'Río Cuarto' },
  { id: 5, nombre: 'Xqzwvlk' },
  { id: 6, nombre: 'Lugar Sin Resultados' },
  { id: 7, nombre: 'Museo del Kempes' },
  { id: 8, nombre: 'Rosario, Santa Fe' },
  { id: 9, nombre: 'Cosquin' },
  { id: 10, nombre: 'Villa Gral Belgrano' },
];

const llamadasPrisma = [];
const prismaFalso = {
  ubicacion: {
    findMany: async (args) => {
      llamadasPrisma.push(args);
      return UBICACIONES.filter((u) => args.where.id.in.includes(u.id)).map(({ id, nombre }) => ({ id, nombre }));
    },
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const servicio = require(path.join(SRC, 'services', 'estimacionRecorridoService.js'));

// --- ORS falso -------------------------------------------------------------

// Lo que ORS geocoding devuelve para cada texto (ya con conContexto aplicado).
// [lon, lat] como en GeoJSON.
const GEOCODING = {
  'Córdoba, Córdoba, Argentina': { label: 'Córdoba, Argentina', name: 'Córdoba', region_a: 'CD', layer: 'locality', match_type: 'exact', coords: [-64.1811, -31.4135] },
  'Villa Carlos Paz, Córdoba, Argentina': { label: 'Villa Carlos Paz, CD, Argentina', name: 'Villa Carlos Paz', region_a: 'CD', layer: 'locality', match_type: 'exact', coords: [-64.4978, -31.4241] },
  'Alta Gracia, Córdoba, Argentina': { label: 'Alta Gracia, CD, Argentina', name: 'Alta Gracia', region_a: 'CD', layer: 'locality', match_type: 'exact', coords: [-64.4283, -31.6593] },
  'Río Cuarto, Córdoba, Argentina': { label: 'Río Cuarto, CD, Argentina', name: 'Río Cuarto', region_a: 'CD', layer: 'locality', match_type: 'exact', coords: [-64.3499, -33.1232] },
  // Casos reales que ORS interpreta mal sin avisar: una calle de Córdoba capital
  // y una localidad de Santa Fe.
  'Cosquin, Córdoba, Argentina': { label: 'Cosquín, Córdoba, Argentina', name: 'Cosquín', region_a: 'CD', layer: 'street', match_type: 'exact', coords: [-64.19, -31.40] },
  'Villa Gral Belgrano, Córdoba, Argentina': { label: 'Vila, SF, Argentina', name: 'Vila', region_a: 'SF', layer: 'locality', match_type: 'exact', coords: [-61.83, -31.19] },
  // Lo que hace Pelias de verdad con un nombre que no conoce: se queda con el
  // contexto ("Córdoba") como fallback a la localidad.
  'Xqzwvlk, Córdoba, Argentina': { label: 'Córdoba, Argentina', layer: 'locality', match_type: 'fallback', coords: [-64.1811, -31.4135] },
  'Lugar Sin Resultados, Córdoba, Argentina': null,
  // Fallback a un lugar concreto (venue): se acepta.
  'Museo del Kempes, Córdoba, Argentina': { label: 'Parque del Kempes, Córdoba, Argentina', name: 'Parque del Kempes', region_a: 'CD', layer: 'venue', match_type: 'fallback', coords: [-64.2468, -31.3687] },
  'Rosario, Santa Fe': { label: 'Rosario, SF, Argentina', name: 'Rosario', region_a: 'SF', layer: 'locality', match_type: 'exact', coords: [-60.6393, -32.9468] },
};

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
    params: Object.fromEntries(u.searchParams),
    method: opciones.method,
    headers: opciones.headers,
    body: opciones.body ? JSON.parse(opciones.body) : null,
    signal: opciones.signal,
  };
  llamadasOrs.push(llamada);

  const especial = comportamiento?.(llamada);
  if (especial) return especial;

  if (llamada.path === '/pelias/v1/search') {
    const r = GEOCODING[llamada.params.text];
    if (!r) return json(200, { features: [] });
    return json(200, {
      features: [
        {
          geometry: { coordinates: r.coords },
          properties: { label: r.label, name: r.name, region_a: r.region_a, layer: r.layer, match_type: r.match_type },
        },
      ],
    });
  }
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

const geocodings = () => llamadasOrs.filter((l) => l.path === '/pelias/v1/search');
const directions = () => llamadasOrs.filter((l) => l.path === '/openrouteservice/v2/directions/driving-car');

// --- Camino feliz ----------------------------------------------------------

describe('camino feliz', () => {
  test('con 2 paradas: km redondeados, duración en minutos y cada punto interpretado, en orden', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    assert.equal(status, 200);
    assert.equal(r.kilometros, 123);
    assert.equal(r.duracionMinutos, 91);
    assert.deepEqual(r.puntos, [
      { ubicacionId: 1, nombre: 'Córdoba', interpretadoComo: 'Córdoba, Argentina', motivosRevision: [] },
      { ubicacionId: 3, nombre: 'Alta Gracia', interpretadoComo: 'Alta Gracia, CD, Argentina', motivosRevision: [] },
      { ubicacionId: 2, nombre: 'Villa Carlos Paz', interpretadoComo: 'Villa Carlos Paz, CD, Argentina', motivosRevision: [] },
      { ubicacionId: 4, nombre: 'Río Cuarto', interpretadoComo: 'Río Cuarto, CD, Argentina', motivosRevision: [] },
    ]);
    assert.equal(geocodings().length, 4);
    assert.equal(directions().length, 1);
    assert.equal(llamadasPrisma.length, 1, 'los nombres salen de un solo findMany');
  });

  test('directions recibe las coordenadas en orden y como [longitud, latitud]', async () => {
    await estimar({ origenId: 1, paradaIds: [3], destinoId: 4 });

    const [ruta] = directions();
    assert.equal(ruta.method, 'POST');
    assert.deepEqual(ruta.body, {
      coordinates: [
        [-64.1811, -31.4135], // Córdoba: [lon, lat]
        [-64.4283, -31.6593], // Alta Gracia
        [-64.3499, -33.1232], // Río Cuarto
      ],
    });
  });

  test('geocoding: misma regla conContexto que Google Maps, país AR, foco en Córdoba y size=1', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 8 });

    const textos = geocodings().map((l) => l.params.text).sort();
    assert.deepEqual(textos, ['Córdoba, Córdoba, Argentina', 'Rosario, Santa Fe']);
    for (const llamada of geocodings()) {
      assert.equal(llamada.params['boundary.country'], 'AR');
      assert.equal(llamada.params.size, '1');
      assert.ok(Math.abs(Number(llamada.params['focus.point.lat']) + 31.41) < 0.1, 'foco: latitud de Córdoba capital');
      assert.ok(Math.abs(Number(llamada.params['focus.point.lon']) + 64.18) < 0.1, 'foco: longitud de Córdoba capital');
    }
  });

  test('URLs del dominio nuevo (api.heigit.org), sin barra final antes de la ruta', async () => {
    await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    for (const llamada of llamadasOrs) {
      assert.equal(llamada.origen, 'https://api.heigit.org');
      assert.ok(!llamada.url.includes('heigit.org//'));
    }
    assert.ok(geocodings().every((l) => l.url.startsWith('https://api.heigit.org/pelias/v1/search?')));
    assert.equal(directions()[0].url, 'https://api.heigit.org/openrouteservice/v2/directions/driving-car');
  });

  test('ORS_BASE_URL con barra final: se le saca la barra', async () => {
    process.env.ORS_BASE_URL = 'https://ors.ejemplo.test/';
    await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(directions()[0].url, 'https://ors.ejemplo.test/openrouteservice/v2/directions/driving-car');
  });

  test('la key va en el header Authorization y en ninguna URL ni cuerpo', async () => {
    await estimar({ origenId: 1, paradaIds: [3, 2], destinoId: 4 });

    assert.ok(llamadasOrs.length > 0);
    for (const llamada of llamadasOrs) {
      assert.equal(llamada.headers.Authorization, CLAVE);
      assert.ok(!llamada.url.includes(CLAVE), `la key no debe ir en la URL: ${llamada.url}`);
      assert.ok(!('api_key' in llamada.params));
      assert.ok(!JSON.stringify(llamada.body ?? {}).includes(CLAVE));
    }
  });

  test('una ubicación repetida (ida y vuelta) se geocodifica una sola vez', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [2, 3], destinoId: 1 });

    assert.equal(status, 200);
    assert.equal(geocodings().length, 3, 'Córdoba aparece dos veces pero se pide una');
    assert.equal(directions()[0].body.coordinates.length, 4, 'la ruta igual pasa por los 4 puntos');
    assert.deepEqual(directions()[0].body.coordinates[0], directions()[0].body.coordinates[3]);
    assert.deepEqual(r.puntos.map((p) => p.ubicacionId), [1, 2, 3, 1]);
  });

  test('paradaIds ausente equivale a sin paradas', async () => {
    const { status } = await estimar({ origenId: 1, destinoId: 2 });
    assert.equal(status, 200);
    assert.equal(directions()[0].body.coordinates.length, 2);
  });

  test('un fallback a un lugar concreto (venue) se acepta y se informa cómo se interpretó', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 7 });
    assert.equal(status, 200);
    assert.equal(r.puntos[1].interpretadoComo, 'Parque del Kempes, Córdoba, Argentina');
  });
});

describe('puntos para revisar (motivosRevision)', () => {
  test('los casos reales llegan marcados y el limpio no; igual se calcula la ruta', async () => {
    const { status, json: r } = await estimar({ origenId: 2, paradaIds: [9, 7], destinoId: 10 });

    assert.equal(status, 200);
    assert.equal(directions().length, 1, 'marcar un punto no frena el cálculo');
    assert.deepEqual(
      r.puntos.map((p) => [p.nombre, p.motivosRevision]),
      [
        ['Villa Carlos Paz', []],
        ['Cosquin', ['CALLE']],
        ['Museo del Kempes', ['NOMBRE_DISTINTO']],
        ['Villa Gral Belgrano', ['NOMBRE_DISTINTO', 'OTRA_PROVINCIA']],
      ]
    );
  });

  test('una ubicación que ya trae provincia no se marca por estar en otra', async () => {
    const { json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 8 });
    assert.deepEqual(r.puntos[1].motivosRevision, []);
  });
});

// --- Ubicaciones que ORS no encuentra --------------------------------------

describe('ubicación no encontrada', () => {
  test('fallback a un área administrativa (solo reconoció "Córdoba"): 422 que dice cuál, sin pedir la ruta', async () => {
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [5], destinoId: 2 });

    assert.equal(status, 422);
    assert.match(r.error, /No se encontró "Xqzwvlk"/);
    assert.deepEqual(r.ubicacionesNoEncontradas, [{ ubicacionId: 5, nombre: 'Xqzwvlk' }]);
    assert.equal(directions().length, 0);
  });

  test('sin resultados: 422', async () => {
    const { status, json: r } = await estimar({ origenId: 6, paradaIds: [], destinoId: 2 });
    assert.equal(status, 422);
    assert.match(r.error, /Lugar Sin Resultados/);
  });

  test('dos no encontradas: el mensaje nombra las dos', async () => {
    const { status, json: r } = await estimar({ origenId: 5, paradaIds: [1], destinoId: 6 });
    assert.equal(status, 422);
    assert.match(r.error, /"Xqzwvlk".*"Lugar Sin Resultados"/);
    assert.equal(r.ubicacionesNoEncontradas.length, 2);
  });
});

// --- Errores de ORS ---------------------------------------------------------

describe('errores de ORS', () => {
  test('cuota agotada (429) en geocoding: 429 con "intentá más tarde"', async () => {
    comportamiento = (l) => (l.path === '/pelias/v1/search' ? json(429, { error: 'Rate limit exceeded' }) : undefined);
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 429);
    assert.match(r.error, /Intentá más tarde/);
    assert.equal(directions().length, 0);
  });

  test('cuota agotada (429) en directions: 429', async () => {
    comportamiento = (l) => (l.path.includes('directions') ? json(429, {}) : undefined);
    const { status, json: r } = await estimar({ origenId: 1, paradaIds: [], destinoId: 2 });
    assert.equal(status, 429);
    assert.match(r.error, /cuota/);
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
      (err) => err instanceof servicio.EstimacionError && err.status === 503
    );
    assert.ok(Date.now() - inicio < 2000, 'tiene que cortar por el plazo, no quedarse esperando');
    assert.ok(abortadas >= 1);
  });

  test('el plazo por defecto es de 8 segundos', () => {
    assert.equal(servicio.TIMEOUT_MS, 8000);
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
    assert.equal(geocodings().length, 4, '11 puntos, 4 ubicaciones distintas');
  });
});
