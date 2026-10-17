// Tests de utils/coordenadas (validación de las coordenadas de una ubicación).
// La réplica del front (frontend/src/utils/coordenadas.js) tiene los mismos
// casos en coordenadas.test.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { leerCoordenadas, errorDePunto } = require(path.join(__dirname, '..', 'src', 'utils', 'coordenadas.js'));

describe('errorDePunto', () => {
  for (const [lugar, lat, lon] of [
    ['Córdoba capital', -31.4201, -64.1888],
    ['Ushuaia', -54.8019, -68.303],
    ['La Quiaca', -22.1056, -65.5969],
    ['Iguazú', -25.5972, -54.5786],
    ['Malvinas', -51.6977, -57.8517],
  ]) {
    test(`${lugar}: válida`, () => assert.equal(errorDePunto(lat, lon), null));
  }

  test('latitud y longitud invertidas: lo dice', () => {
    assert.match(errorDePunto(-64.1888, -31.4201), /invertidas/);
  });

  test('sin signos menos: lo dice (también invertidas y sin signo)', () => {
    assert.match(errorDePunto(31.4201, 64.1888), /signos menos/);
    assert.match(errorDePunto(64.1888, 31.4201), /signos menos/);
  });

  test('fuera de Argentina', () => {
    assert.match(errorDePunto(40.4168, -3.7038), /fuera de Argentina/); // Madrid
    assert.match(errorDePunto(-23.5505, -46.6333), /fuera de Argentina/); // San Pablo
    assert.match(errorDePunto(-12.0464, -77.0428), /fuera de Argentina/); // Lima
    assert.match(errorDePunto(0, 0), /fuera de Argentina/);
  });

  test('limitación conocida: el rectángulo es aproximado y deja pasar ciudades limítrofes', () => {
    // Lo que se quiere atajar es un error al pegar (invertidas, sin signo, otro
    // lugar del mundo), no la frontera exacta.
    assert.equal(errorDePunto(-33.4489, -70.6693), null); // Santiago de Chile
    assert.equal(errorDePunto(-34.9011, -56.1645), null); // Montevideo
  });

  test('no numéricas', () => {
    assert.match(errorDePunto(Number.NaN, -64), /números/);
    assert.match(errorDePunto(-31, Infinity), /números/);
  });
});

describe('leerCoordenadas (body de la API)', () => {
  test('sin ninguna: sin coordenadas, sin error', () => {
    assert.deepEqual(leerCoordenadas({}), { coordenadas: null });
    assert.deepEqual(leerCoordenadas({ latitud: null, longitud: '' }), { coordenadas: null });
    assert.deepEqual(leerCoordenadas(undefined), { coordenadas: null });
  });

  test('números o strings numéricos', () => {
    assert.deepEqual(leerCoordenadas({ latitud: -31.42, longitud: -64.19 }), { coordenadas: { latitud: -31.42, longitud: -64.19 } });
    assert.deepEqual(leerCoordenadas({ latitud: '-31.42', longitud: ' -64.19 ' }), { coordenadas: { latitud: -31.42, longitud: -64.19 } });
  });

  test('una sola: error', () => {
    assert.match(leerCoordenadas({ latitud: -31.42 }).error, /Faltan/);
    assert.match(leerCoordenadas({ longitud: -64.19 }).error, /Faltan/);
  });

  test('tipos raros no pasan como números', () => {
    assert.match(leerCoordenadas({ latitud: true, longitud: -64 }).error, /números/);
    assert.match(leerCoordenadas({ latitud: [-31], longitud: -64 }).error, /números/);
    assert.match(leerCoordenadas({ latitud: '-31,42', longitud: '-64,19' }).error, /números/);
  });

  test('invertidas o fuera de Argentina: error', () => {
    assert.match(leerCoordenadas({ latitud: -64.19, longitud: -31.42 }).error, /invertidas/);
    assert.match(leerCoordenadas({ latitud: 40.41, longitud: -3.7 }).error, /fuera de Argentina/);
  });
});
