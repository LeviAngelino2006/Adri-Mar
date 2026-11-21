// Test de PanelLateral montado (react-dom/client sobre jsdom, como
// selectorBuscarOCrear.render.test.mjs): cierre con Escape, con la ✕ y tocando
// el fondo; bloqueo del scroll de la página; foco al título y devolución del
// foco al cerrar; "← Volver". Se corre con `npm test` (node:test).

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let PanelLateral;
let contenedor;
let raiz;
let cierres;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  PanelLateral = (await vite.ssrLoadModule('/src/components/ui/PanelLateral.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  cierres = 0;
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

function montar(props = {}) {
  act(() =>
    raiz.render(
      h(PanelLateral, { titulo: '12 - AB123CD', subtitulo: 'Mercedes-Benz O500', onClose: () => (cierres += 1), ...props }, h('p', null, 'Contenido'))
    )
  );
}

const panel = () => contenedor.querySelector('.panel-lateral');

describe('PanelLateral', () => {
  test('es un diálogo modal nombrado por su título, con el foco en el título', () => {
    montar();
    assert.equal(panel().getAttribute('role'), 'dialog');
    assert.equal(panel().getAttribute('aria-modal'), 'true');
    const titulo = document.getElementById(panel().getAttribute('aria-labelledby'));
    assert.equal(titulo.textContent, '12 - AB123CD');
    assert.equal(document.activeElement, titulo);
  });

  test('se cierra con Escape, con la ✕ y tocando el fondo, pero no tocando adentro', () => {
    montar();
    act(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(cierres, 1);
    act(() => contenedor.querySelector('.panel-lateral-cerrar').click());
    assert.equal(cierres, 2);
    act(() => contenedor.querySelector('.panel-lateral-overlay').click());
    assert.equal(cierres, 3);
    act(() => contenedor.querySelector('.panel-lateral-cuerpo p').click());
    assert.equal(cierres, 3);
  });

  test('bloquea el scroll de la página mientras está abierto y devuelve el foco al cerrar', () => {
    const boton = document.createElement('button');
    document.body.appendChild(boton);
    boton.focus();
    montar();
    assert.equal(document.body.style.overflow, 'hidden');
    act(() => raiz.render(null));
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement, boton);
    boton.remove();
  });

  test('"← Volver" solo con onVolver', () => {
    montar();
    assert.equal(contenedor.querySelector('.panel-lateral-volver'), null);
    let volvio = false;
    montar({ onVolver: () => (volvio = true) });
    act(() => contenedor.querySelector('.panel-lateral-volver').click());
    assert.equal(volvio, true);
  });
});
