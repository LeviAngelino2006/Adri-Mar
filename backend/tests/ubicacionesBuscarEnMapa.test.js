// Tests de GET /ubicaciones/buscar-en-mapa?texto= (candidatos de OpenRouteService
// para ubicar en el mapa una ubicación nueva).
//
// App real de Express con JWT real y fetch reemplazado: las llamadas a ORS
// NUNCA salen a internet (las responde un ORS falso con respuestas de Pelias
// reales recortadas); las del test a la app sí usan el fetch real. No toca la
// base: el endpoint no la usa.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const CLAVE = 'clave-ors-de-prueba-1234567890';

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {} };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

// Lo que devolvió ORS de verdad para "Colegio Nacional de Monserrat" (recortado
// a 6 resultados: el endpoint tiene que quedarse con 5). [lon, lat].
const FEATURES_MONSERRAT = [
  ['Colegio Nacional de Monserrat, Córdoba, Argentina', [-64.1871, -31.4187]],
  ['Colegio Nacional de Buenos Aires, Buenos Aires, CF, Argentina', [-58.3741, -34.611]],
  ['Colegio Nacional de Olavarría, BA, Argentina', [-60.3186, -36.8865]],
  ['Colegio Nacional de San Isidro, BA, Argentina', [-58.5104, -34.4709]],
  ['Colegio Nacional Aristóbulo del Valle, BA, Argentina', [-57.6728, -36.3186]],
  ['Colegio Nacional de Mar del Plata, BA, Argentina', [-57.55, -38.0]],
].map(([label, coordinates]) => ({ geometry: { coordinates }, properties: { label, layer: 'venue' } }));

let llamadasOrs = [];
let comportamiento = null;

const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function orsFalso(url, opciones) {
  const u = new URL(url);
  const llamada = { url: String(url), path: u.pathname, params: Object.fromEntries(u.searchParams), headers: opciones.headers };
  llamadasOrs.push(llamada);
  const especial = comportamiento?.(llamada);
  if (especial) return especial;
  return json(200, { features: FEATURES_MONSERRAT });
}

const fetchReal = globalThis.fetch;
let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  globalThis.fetch = (url, opciones = {}) =>
    String(url).startsWith(base) ? fetchReal(url, opciones) : Promise.resolve().then(() => orsFalso(url, opciones));
});

after(() => {
  globalThis.fetch = fetchReal;
  return new Promise((resolver) => servidor.close(resolver));
});

beforeEach(() => {
  llamadasOrs = [];
  comportamiento = null;
  process.env.ORS_API_KEY = CLAVE;
  delete process.env.ORS_BASE_URL;
});

afterEach(() => {
  delete process.env.ORS_API_KEY;
});

async function buscarEnMapa(texto, perfil = 'ENCARGADO') {
  const headers = {};
  if (perfil) headers.Authorization = `Bearer ${generarToken({ id: 1, nombreUsuario: 'test', perfil })}`;
  const query = texto === undefined ? '' : `?texto=${encodeURIComponent(texto)}`;
  const r = await fetchReal(`${base}/ubicaciones/buscar-en-mapa${query}`, { headers });
  return { status: r.status, json: await r.json() };
}

describe('candidatos', () => {
  test('hasta 5, como { etiqueta, latitud, longitud } (ORS manda [lon, lat])', async () => {
    const { status, json: r } = await buscarEnMapa('Colegio Nacional de Monserrat');

    assert.equal(status, 200);
    assert.equal(r.candidatos.length, 5);
    assert.deepEqual(r.candidatos[0], {
      etiqueta: 'Colegio Nacional de Monserrat, Córdoba, Argentina',
      latitud: -31.4187,
      longitud: -64.1871,
    });
  });

  test('una sola llamada a geocoding: texto tal cual, Argentina, foco en Córdoba, size=5', async () => {
    await buscarEnMapa('  Colegio   Nacional de Monserrat ');

    assert.equal(llamadasOrs.length, 1);
    const [llamada] = llamadasOrs;
    assert.equal(llamada.url.split('?')[0], 'https://api.heigit.org/pelias/v1/search');
    assert.equal(llamada.params.text, 'Colegio Nacional de Monserrat', 'sin contexto agregado, espacios colapsados');
    assert.equal(llamada.params['boundary.country'], 'AR');
    assert.equal(llamada.params.size, '5');
    assert.ok(Math.abs(Number(llamada.params['focus.point.lat']) + 31.41) < 0.1);
    assert.ok(Math.abs(Number(llamada.params['focus.point.lon']) + 64.18) < 0.1);
  });

  test('la key va en el header Authorization, nunca en la URL ni en la respuesta', async () => {
    const { json: r } = await buscarEnMapa('Monserrat');
    assert.equal(llamadasOrs[0].headers.Authorization, CLAVE);
    assert.ok(!llamadasOrs[0].url.includes(CLAVE));
    assert.ok(!JSON.stringify(r).includes(CLAVE));
  });

  test('sin resultados: lista vacía', async () => {
    comportamiento = () => json(200, { features: [] });
    const { status, json: r } = await buscarEnMapa('Xqzwvlk');
    assert.equal(status, 200);
    assert.deepEqual(r.candidatos, []);
  });

  test('un resultado sin coordenadas se descarta', async () => {
    comportamiento = () =>
      json(200, { features: [{ properties: { label: 'Roto' } }, FEATURES_MONSERRAT[0]] });
    const { json: r } = await buscarEnMapa('Monserrat');
    assert.deepEqual(r.candidatos.map((c) => c.etiqueta), ['Colegio Nacional de Monserrat, Córdoba, Argentina']);
  });
});

describe('validación y errores', () => {
  for (const texto of [undefined, '', '  ', 'ab']) {
    test(`texto ${JSON.stringify(texto)}: 400 y no se llama a ORS`, async () => {
      const { status, json: r } = await buscarEnMapa(texto);
      assert.equal(status, 400);
      assert.match(r.errores.texto, /al menos 3 letras/);
      assert.equal(llamadasOrs.length, 0);
    });
  }

  test('texto de más de 200 caracteres: 400', async () => {
    assert.equal((await buscarEnMapa('a'.repeat(201))).status, 400);
    assert.equal(llamadasOrs.length, 0);
  });

  test('sin ORS_API_KEY: 503 sin llamar a ORS', async () => {
    delete process.env.ORS_API_KEY;
    const { status, json: r } = await buscarEnMapa('Monserrat');
    assert.equal(status, 503);
    assert.match(r.error, /falta configurar OpenRouteService/);
    assert.equal(llamadasOrs.length, 0);
  });

  test('cuota agotada: 429', async () => {
    comportamiento = () => json(429, {});
    assert.equal((await buscarEnMapa('Monserrat')).status, 429);
  });

  test('timeout: 503', async () => {
    comportamiento = () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    const { status, json: r } = await buscarEnMapa('Monserrat');
    assert.equal(status, 503);
    assert.match(r.error, /no respondió a tiempo/);
  });

  test('ORS caído: 502', async () => {
    comportamiento = () => {
      throw new TypeError('fetch failed');
    };
    assert.equal((await buscarEnMapa('Monserrat')).status, 502);
  });
});

describe('permisos (los mismos que crear una ubicación)', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil}: 200`, async () => {
      assert.equal((await buscarEnMapa('Monserrat', perfil)).status, 200);
    });
  }
  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se llama a ORS`, async () => {
      assert.equal((await buscarEnMapa('Monserrat', perfil)).status, 403);
      assert.equal(llamadasOrs.length, 0);
    });
  }
  test('sin token: 401', async () => {
    assert.equal((await buscarEnMapa('Monserrat', null)).status, 401);
  });
});
