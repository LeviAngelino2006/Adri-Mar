// Medidas del cuadradito de SelectorMultiple (forma "cuadro", SCRUM-251). jsdom
// no calcula layout, así que se fijan las reglas de CSS que las garantizan: dos
// líneas legibles (14 y 13px, interlineado normal) con tope de 44px, y la X con
// un área táctil de 32 × 32px. Se corre con `npm test`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./SelectorMultiple.css', import.meta.url)), 'utf8');

// Las declaraciones de todas las reglas que incluyen ese selector exacto (solo o
// en una lista "a, b"), juntas: { propiedad: valor }.
function regla(selector) {
  const declaraciones = {};
  for (const [, selectores, cuerpo] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const lista = selectores
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((s) => s.trim());
    if (!lista.includes(selector)) continue;
    for (const d of cuerpo.split(';').map((x) => x.trim()).filter(Boolean)) {
      const [propiedad, ...valor] = d.split(':');
      declaraciones[propiedad.trim()] = valor.join(':').trim();
    }
  }
  assert.ok(Object.keys(declaraciones).length > 0, `no está la regla ${selector}`);
  return declaraciones;
}

describe('SelectorMultiple: medidas del cuadradito', () => {
  test('sin el alto fijo de la píldora: mínimo 32px y tope de 44px', () => {
    const cuadro = regla('.selector-multiple-cuadro');
    assert.equal(cuadro['min-height'], '32px');
    assert.equal(cuadro['max-height'], '44px');
    assert.equal(cuadro['border-radius'], 'var(--radius-md)');
  });

  test('texto legible: título de 14px, subtítulo de 13px, interlineado normal', () => {
    assert.equal(regla('.selector-multiple-cuadro-texto')['line-height'], 'normal');
    assert.equal(regla('.selector-multiple-cuadro-titulo')['font-size'], '0.875rem');
    assert.equal(regla('.selector-multiple-cuadro-subtitulo')['font-size'], '0.8125rem');
  });

  test('la X del cuadradito tiene un área táctil de 32 × 32px', () => {
    const quitar = regla('.selector-multiple-cuadro .selector-multiple-quitar');
    assert.equal(quitar.width, '32px');
    assert.equal(quitar.height, '32px');
  });

  test('la píldora (Presupuestos) no cambia: su X sigue de 28px', () => {
    const quitar = regla('.selector-multiple-quitar');
    assert.equal(quitar.width, '28px');
    assert.equal(regla('.selector-multiple-chip')['border-radius'], 'var(--radius-full)');
  });
});
