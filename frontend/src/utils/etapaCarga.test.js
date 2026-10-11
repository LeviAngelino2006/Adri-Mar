// Tests de los tiempos del estado de carga. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { etapaPorTiempo, UMBRAL_ESQUELETO_MS, UMBRAL_LENTO_MS } from './etapaCarga.js';

describe('etapaPorTiempo', () => {
  test('antes de 300ms no se ve nada', () => {
    assert.equal(etapaPorTiempo(0), 'oculto');
    assert.equal(etapaPorTiempo(299), 'oculto');
  });

  test('de 300ms a 3s, el esqueleto', () => {
    assert.equal(etapaPorTiempo(300), 'esqueleto');
    assert.equal(etapaPorTiempo(2999), 'esqueleto');
  });

  test('desde 3s, el colectivo', () => {
    assert.equal(etapaPorTiempo(3000), 'lento');
    assert.equal(etapaPorTiempo(60000), 'lento');
  });

  test('los umbrales son los de los timers del hook', () => {
    assert.equal(UMBRAL_ESQUELETO_MS, 300);
    assert.equal(UMBRAL_LENTO_MS, 3000);
  });
});
