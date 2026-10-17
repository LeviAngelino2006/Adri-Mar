// Tests de utils/coordenadas (coordenadas pegadas desde Google Maps). Los casos
// de errorDePunto son los mismos que backend/tests/coordenadas.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { errorDePunto, parsearCoordenadas, urlPuntoGoogleMaps } from './coordenadas.js';

describe('parsearCoordenadas', () => {
  test('lo que copia Google Maps (latitud primero)', () => {
    assert.deepEqual(parsearCoordenadas('-31.4201, -64.1888'), { latitud: -31.4201, longitud: -64.1888 });
  });

  test('con muchos decimales, sin espacio, con punto y coma, solo espacios o entre paréntesis', () => {
    const esperado = { latitud: -31.42013456, longitud: -64.18881234 };
    for (const texto of [
      '-31.42013456, -64.18881234',
      '-31.42013456,-64.18881234',
      '-31.42013456; -64.18881234',
      '-31.42013456 -64.18881234',
      '(-31.42013456, -64.18881234)',
      '  -31.42013456 ,  -64.18881234  ',
      '−31.42013456, −64.18881234',
    ]) {
      assert.deepEqual(parsearCoordenadas(texto), esperado, texto);
    }
  });

  test('vacío: sin error (todavía no pegó nada)', () => {
    assert.deepEqual(parsearCoordenadas(''), { vacio: true });
    assert.deepEqual(parsearCoordenadas('   '), { vacio: true });
    assert.deepEqual(parsearCoordenadas(undefined), { vacio: true });
  });

  test('formato que no es un par de números: dice cómo pegarlas', () => {
    for (const texto of ['Córdoba', '-31.4201', '-31,4201 -64,1888', '-31.4201, -64.1888, 10', '31°25\'12"S 64°11\'20"W', 'https://maps.app.goo.gl/xyz']) {
      assert.match(parsearCoordenadas(texto).error, /como las copia Google Maps/, texto);
    }
  });

  test('latitud y longitud invertidas', () => {
    assert.match(parsearCoordenadas('-64.1888, -31.4201').error, /invertidas/);
  });

  test('sin signos menos', () => {
    assert.match(parsearCoordenadas('31.4201, 64.1888').error, /signos menos/);
  });

  test('fuera de Argentina', () => {
    assert.match(parsearCoordenadas('40.4168, -3.7038').error, /fuera de Argentina/); // Madrid
    assert.match(parsearCoordenadas('-23.5505, -46.6333').error, /fuera de Argentina/); // San Pablo
  });
});

describe('errorDePunto (mismos casos que el backend)', () => {
  for (const [lugar, lat, lon] of [
    ['Córdoba capital', -31.4201, -64.1888],
    ['Ushuaia', -54.8019, -68.303],
    ['La Quiaca', -22.1056, -65.5969],
    ['Iguazú', -25.5972, -54.5786],
    ['Malvinas', -51.6977, -57.8517],
  ]) {
    test(`${lugar}: válida`, () => assert.equal(errorDePunto(lat, lon), null));
  }

  test('invertidas, sin signo, fuera, no numéricas', () => {
    assert.match(errorDePunto(-64.1888, -31.4201), /invertidas/);
    assert.match(errorDePunto(31.4201, 64.1888), /signos menos/);
    assert.match(errorDePunto(64.1888, 31.4201), /signos menos/);
    assert.match(errorDePunto(40.4168, -3.7038), /fuera de Argentina/);
    assert.match(errorDePunto(-12.0464, -77.0428), /fuera de Argentina/);
    assert.match(errorDePunto(0, 0), /fuera de Argentina/);
    assert.match(errorDePunto(Number.NaN, -64), /números/);
  });

  test('limitación conocida: el rectángulo deja pasar ciudades limítrofes', () => {
    assert.equal(errorDePunto(-33.4489, -70.6693), null); // Santiago de Chile
    assert.equal(errorDePunto(-34.9011, -56.1645), null); // Montevideo
  });
});

test('urlPuntoGoogleMaps', () => {
  assert.equal(
    urlPuntoGoogleMaps({ latitud: -31.4201, longitud: -64.1888 }),
    'https://www.google.com/maps/search/?api=1&query=-31.4201,-64.1888'
  );
});
