// Smoke test de render del estado de carga (Cargando): el marcado de cada
// etapa y de cada forma. Se corre con `npm test` (node:test).
//
// Mismo método que viajes.render.test.mjs: Vite en modo SSR carga los .jsx y se
// renderiza a HTML con react-dom/server. Los timers no corren en SSR, así que
// Cargando sale en 'oculto'; las etapas se prueban con ContenidoCarga.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let Cargando;
let ContenidoCarga;
let CargaColectivo;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ default: Cargando, ContenidoCarga, CargaColectivo } = await vite.ssrLoadModule('/src/components/ui/Cargando.jsx'));
});

after(() => vite.close());

const contar = (html, texto) => html.split(texto).length - 1;

describe('Cargando', () => {
  test('al montarse no muestra nada: el contenedor va vacío', () => {
    assert.equal(
      renderToStaticMarkup(h(Cargando, { forma: 'tarjetas' })),
      '<div class="carga" role="status" aria-live="polite"></div>'
    );
  });

  test('esqueleto de tarjetas: 3 por defecto, con marca y tres líneas', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'tarjetas' }));
    assert.match(html, /<span class="sr-only">Cargando…<\/span>/);
    assert.match(html, /<div class="esqueleto-tarjetas" aria-hidden="true">/);
    assert.equal(contar(html, 'class="esqueleto-tarjeta"'), 3);
    assert.equal(contar(html, 'esqueleto-marca'), 3);
    assert.equal(contar(html, 'esqueleto-linea-pie'), 3);
    assert.ok(!html.includes('carga-colectivo'));
  });

  test('esqueleto de filas: hora y dos líneas, con la cantidad pedida', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'filas', cantidad: 2 }));
    assert.match(html, /<div aria-hidden="true"><div class="esqueleto-fila">/);
    assert.equal(contar(html, 'class="esqueleto-fila"'), 2);
    assert.equal(contar(html, 'esqueleto-hora'), 2);
    assert.equal(contar(html, 'esqueleto-linea-sub'), 2);
    assert.ok(!html.includes('esqueleto-linea-pie'));
  });

  test('lento: el colectivo reemplaza al esqueleto', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'lento', forma: 'tarjetas' }));
    assert.match(html, /<span class="sr-only">Cargando…<\/span>/);
    assert.ok(!html.includes('esqueleto'));
    assert.match(html, /<div class="carga-colectivo"><div class="carga-colectivo-ruta"><span class="carga-colectivo-bus"><svg width="56" height="56"/);
    assert.match(html, /<span class="carga-colectivo-texto">Conectando con el servidor…<\/span>/);
    assert.match(html, /<span class="carga-colectivo-hint">Puede tardar unos segundos más\.<\/span>/);
  });

  test('variante chica del login: clase propia e ícono de 40px', () => {
    const html = renderToStaticMarkup(h(CargaColectivo, { chica: true }));
    assert.match(html, /^<div class="carga-colectivo carga-colectivo-chica">/);
    assert.match(html, /<svg width="40" height="40" aria-hidden="true"/);
  });

  test('CargaColectivo suma las clases que recibe (el colectivo único del Layout)', () => {
    const html = renderToStaticMarkup(h(CargaColectivo, { className: 'carga-colectivo-pagina' }));
    assert.match(html, /^<div class="carga-colectivo carga-colectivo-pagina">/);
    assert.match(html, /<svg width="56" height="56"/);
  });

  test('fuera de Layout y con aislado también arranca vacío', () => {
    assert.equal(
      renderToStaticMarkup(h(Cargando, { forma: 'filas', cantidad: 2, aislado: true })),
      '<div class="carga" role="status" aria-live="polite"></div>'
    );
  });
});
