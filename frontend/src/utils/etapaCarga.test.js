// Tests de los tiempos del estado de carga. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisarCargaLenta,
  contarCargasLentas,
  etapaPorTiempo,
  UMBRAL_ESQUELETO_MS,
  UMBRAL_LENTO_MS,
} from './etapaCarga.js';

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

describe('contarCargasLentas', () => {
  test('suma y resta de a uno', () => {
    assert.equal(contarCargasLentas(0, 'sumar'), 1);
    assert.equal(contarCargasLentas(2, 'restar'), 1);
  });

  test('nunca queda en negativo', () => {
    assert.equal(contarCargasLentas(0, 'restar'), 0);
  });
});

// Simula el contador del Layout y el ciclo del efecto de cada Cargando:
// React llama al efecto al entrar a 'lento' y a su limpieza al salir de esa
// etapa o al desmontar.
function contadorDePrueba() {
  let cantidad = 0;
  return {
    sumar: () => (cantidad = contarCargasLentas(cantidad, 'sumar')),
    restar: () => (cantidad = contarCargasLentas(cantidad, 'restar')),
    get cantidad() {
      return cantidad;
    },
  };
}

describe('avisarCargaLenta', () => {
  test('fuera de la etapa lenta no suma ni devuelve limpieza', () => {
    const contador = contadorDePrueba();
    assert.equal(avisarCargaLenta(false, contador.sumar, contador.restar), undefined);
    assert.equal(contador.cantidad, 0);
  });

  test('sin contexto (fuera de Layout o aislado) no hace nada', () => {
    assert.equal(avisarCargaLenta(true, null, null), undefined);
  });

  test('un panel que se desmonta en la etapa lenta resta: el contador no queda pegado', () => {
    const contador = contadorDePrueba();
    const limpiezas = [1, 2, 3, 4].map(() => avisarCargaLenta(true, contador.sumar, contador.restar));
    assert.equal(contador.cantidad, 4);
    limpiezas[1](); // llegan los datos de un panel: se desmonta
    assert.equal(contador.cantidad, 3);
    limpiezas[0]();
    limpiezas[2]();
    limpiezas[3]();
    assert.equal(contador.cantidad, 0);
  });

  test('una limpieza de más no lo deja en negativo', () => {
    const contador = contadorDePrueba();
    const limpiar = avisarCargaLenta(true, contador.sumar, contador.restar);
    limpiar();
    limpiar();
    assert.equal(contador.cantidad, 0);
  });
});
