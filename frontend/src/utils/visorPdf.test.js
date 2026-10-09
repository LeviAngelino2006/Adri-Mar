import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_AJUSTADO,
  ZOOM_MAX,
  ZOOM_MIN,
  cambiarZoom,
  limitarPagina,
  paginaMasVisible,
  paginaPorTecla,
  textoPagina,
} from './visorPdf.js';

describe('cambiarZoom', () => {
  test('sube y baja de a 25 puntos', () => {
    assert.equal(cambiarZoom(ZOOM_AJUSTADO, 1), 125);
    assert.equal(cambiarZoom(ZOOM_AJUSTADO, -1), 75);
  });

  test('no pasa de 50% ni de 200%', () => {
    assert.equal(cambiarZoom(ZOOM_MIN, -1), ZOOM_MIN);
    assert.equal(cambiarZoom(ZOOM_MAX, 1), ZOOM_MAX);
  });

  test('de 50% a 200% hay seis pasos', () => {
    let zoom = ZOOM_MIN;
    let pasos = 0;
    while (zoom < ZOOM_MAX) {
      zoom = cambiarZoom(zoom, 1);
      pasos += 1;
    }
    assert.equal(pasos, 6);
  });
});

describe('limitarPagina', () => {
  test('queda dentro de 1..total', () => {
    assert.equal(limitarPagina(0, 3), 1);
    assert.equal(limitarPagina(2, 3), 2);
    assert.equal(limitarPagina(9, 3), 3);
  });

  test('con total 0 devuelve 1', () => {
    assert.equal(limitarPagina(5, 0), 1);
  });
});

describe('paginaPorTecla', () => {
  const sinModificadores = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  test('flecha derecha avanza y flecha izquierda retrocede', () => {
    assert.equal(paginaPorTecla({ key: 'ArrowRight', ...sinModificadores }, 1, 3), 2);
    assert.equal(paginaPorTecla({ key: 'ArrowLeft', ...sinModificadores }, 3, 3), 2);
  });

  test('en los extremos se queda en la página', () => {
    assert.equal(paginaPorTecla({ key: 'ArrowLeft', ...sinModificadores }, 1, 3), 1);
    assert.equal(paginaPorTecla({ key: 'ArrowRight', ...sinModificadores }, 3, 3), 3);
  });

  test('otras teclas, o con modificadores, no cambian de página', () => {
    assert.equal(paginaPorTecla({ key: 'ArrowDown', ...sinModificadores }, 1, 3), null);
    assert.equal(paginaPorTecla({ key: 'ArrowRight', ...sinModificadores, altKey: true }, 1, 3), null);
    assert.equal(paginaPorTecla({ key: 'ArrowRight', ...sinModificadores, shiftKey: true }, 1, 3), null);
  });

  test('sin páginas cargadas no hace nada', () => {
    assert.equal(paginaPorTecla({ key: 'ArrowRight', ...sinModificadores }, 1, 0), null);
  });
});

describe('paginaMasVisible', () => {
  test('elige la que muestra más píxeles', () => {
    assert.equal(
      paginaMasVisible(
        new Map([
          [1, 120],
          [2, 380],
          [3, 0],
        ])
      ),
      2
    );
  });

  test('con empate gana la primera', () => {
    assert.equal(
      paginaMasVisible(
        new Map([
          [3, 200],
          [2, 200],
        ])
      ),
      2
    );
  });

  test('si no se ve ninguna, null', () => {
    assert.equal(paginaMasVisible(new Map([[1, 0]])), null);
    assert.equal(paginaMasVisible(new Map()), null);
  });
});

describe('textoPagina', () => {
  test('"1 de 3" o un guion mientras carga', () => {
    assert.equal(textoPagina(1, 3), '1 de 3');
    assert.equal(textoPagina(1, 0), '–');
  });
});
