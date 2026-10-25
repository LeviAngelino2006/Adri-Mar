// Test de render de GrupoCasillas (tipos de trabajo de un arreglo). Se corre
// con `npm test` (node:test).
//
// El marcado se revisa con SSR; los clicks, montando con react-dom/client
// sobre un DOM de jsdom (como selectorBuscarOCrear.render.test.mjs).

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

// El DOM tiene que existir antes de cargar react-dom/client.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let GrupoCasillas;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  GrupoCasillas = (await vite.ssrLoadModule('/src/components/ui/GrupoCasillas.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

const OPCIONES = [
  { id: 1, etiqueta: 'Engrase', detalle: 'Rodamientos y articulaciones' },
  { id: 3, etiqueta: 'Cambio de cubiertas' },
  { id: 8, etiqueta: 'Otro', detalle: 'Cualquier otro trabajo' },
];

const props = (extra = {}) => ({ id: 'tipos', legend: 'Tipos de trabajo', opciones: OPCIONES, valor: [], onChange: () => {}, ...extra });

const casillas = () => [...contenedor.querySelectorAll('input[type="checkbox"]')];

describe('GrupoCasillas', () => {
  test('un fieldset con legend, una casilla por opción y el detalle debajo', () => {
    const html = renderToStaticMarkup(h(GrupoCasillas, props({ valor: [3] })));
    assert.match(html, /<fieldset[^>]*id="tipos"/);
    assert.match(html, /<legend[^>]*>Tipos de trabajo/);
    assert.equal(html.match(/type="checkbox"/g).length, 3);
    assert.equal(html.match(/checked=""/g).length, 1);
    assert.match(html, /id="tipos-3"[^>]*checked=""|checked=""[^>]*id="tipos-3"/);
    assert.match(html, /Rodamientos y articulaciones/);
  });

  test('con required pone el asterisco; con error, aria-invalid en la primera casilla y el mensaje con role="alert"', () => {
    const sinError = renderToStaticMarkup(h(GrupoCasillas, props({ required: true })));
    assert.match(sinError, /form-field-required/);
    assert.doesNotMatch(sinError, /aria-invalid/);

    const html = renderToStaticMarkup(h(GrupoCasillas, props({ required: true, error: 'Elegí al menos un tipo de trabajo' })));
    assert.equal(html.match(/aria-invalid="true"/g).length, 1);
    assert.match(html, /id="tipos-1"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="tipos-1"/);
    assert.match(html, /<fieldset[^>]*aria-describedby="tipos-error"/);
    assert.match(html, /id="tipos-error"[^>]*role="alert"[^>]*>Elegí al menos un tipo de trabajo/);
  });

  test('marcar y desmarcar llama a onChange en el orden de opciones', () => {
    const recibidos = [];
    act(() => raiz.render(h(GrupoCasillas, props({ valor: [8], onChange: (ids) => recibidos.push(ids) }))));
    act(() => casillas()[0].click());
    assert.deepEqual(recibidos.at(-1), [1, 8]);

    act(() => raiz.render(h(GrupoCasillas, props({ valor: [1, 8], onChange: (ids) => recibidos.push(ids) }))));
    act(() => casillas()[2].click());
    assert.deepEqual(recibidos.at(-1), [1]);
  });

  test('el lector de pantalla oye "obligatorio" y el error al enfocar la primera casilla', () => {
    const html = renderToStaticMarkup(h(GrupoCasillas, props({ required: true, error: 'Elegí al menos un tipo de trabajo' })));
    assert.match(html, /<legend[^>]*>Tipos de trabajo.*<span class="sr-only"> \(obligatorio\)<\/span>/);
    assert.match(html, /<input[^>]*id="tipos-1"[^>]*aria-describedby="tipos-error"|<input[^>]*aria-describedby="tipos-error"[^>]*id="tipos-1"/);
  });

  test('hint debajo del grupo (por ejemplo "Cargando…"), salvo que haya error', () => {
    const html = renderToStaticMarkup(h(GrupoCasillas, props({ opciones: [], hint: 'Cargando…' })));
    assert.match(html, /id="tipos-hint"[^>]*>Cargando…/);
    assert.match(html, /<fieldset[^>]*aria-describedby="tipos-hint"/);
    const conError = renderToStaticMarkup(h(GrupoCasillas, props({ hint: 'Cargando…', error: 'No se pudo cargar' })));
    assert.doesNotMatch(conError, /Cargando…/);
  });

  test('contenidoMarcada aparece solo debajo de las opciones marcadas, fuera del label', () => {
    const contenidoMarcada = (o) => (o.id === 8 ? h('input', { id: 'extra-8', type: 'text' }) : null);
    const marcada = renderToStaticMarkup(h(GrupoCasillas, props({ valor: [1, 8], contenidoMarcada })));
    assert.equal(marcada.match(/id="extra-8"/g).length, 1);
    assert.doesNotMatch(marcada, /<label[^>]*>(?:(?!<\/label>).)*id="extra-8"/);

    const sinMarcar = renderToStaticMarkup(h(GrupoCasillas, props({ valor: [1], contenidoMarcada })));
    assert.doesNotMatch(sinMarcar, /extra-8/);
  });

  test('un clic en el contenido no desmarca la casilla', () => {
    let llamadas = 0;
    const contenidoMarcada = (o) => (o.id === 8 ? h('input', { id: 'extra-8', type: 'text' }) : null);
    act(() => raiz.render(h(GrupoCasillas, props({ valor: [8], contenidoMarcada, onChange: () => llamadas++ }))));
    act(() => contenedor.querySelector('#extra-8').click());
    assert.equal(llamadas, 0);
  });

  test('disabled deshabilita todas las casillas', () => {
    act(() => raiz.render(h(GrupoCasillas, props({ disabled: true }))));
    assert.ok(casillas().every((c) => c.disabled));
  });
});
