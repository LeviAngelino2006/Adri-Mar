// Test de AyudaTooltip y de la prop `ayuda` de FormField. Se corre con
// `npm test` (node:test).
//
// La parte de accesibilidad se verifica sobre el marcado (SSR); la de
// interacción (hover, teclado, toque, Escape, tocar afuera, bordes de la
// pantalla) monta el componente con react-dom/client sobre jsdom.

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
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let AyudaTooltip;
let FormField;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  AyudaTooltip = (await vite.ssrLoadModule('/src/components/ui/AyudaTooltip.jsx')).default;
  FormField = (await vite.ssrLoadModule('/src/components/ui/FormField.jsx')).default;
});

after(() => vite.close());

// Por defecto, un dispositivo táctil (sin hover).
function simularHover(hay) {
  window.matchMedia = (consulta) => ({ matches: consulta === '(hover: hover)' ? hay : false });
}

beforeEach(() => {
  simularHover(false);
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

const montar = (elemento) => act(() => raiz.render(elemento));
const boton = () => contenedor.querySelector('button.ayuda-tooltip-boton');
const popover = () => contenedor.querySelector('.ayuda-tooltip-popover');

function disparar(objetivo, tipo, opciones = {}) {
  act(() => {
    objetivo.dispatchEvent(new window.PointerEvent(tipo, { bubbles: true, ...opciones }));
  });
}

function tocar(el) {
  disparar(el, 'pointerdown', { pointerType: 'touch' });
  act(() => el.focus());
  act(() => el.click());
}

describe('AyudaTooltip: accesibilidad', () => {
  test('un botón con "?" y aria-label, que describe con el texto en un span visually-hidden', () => {
    const html = renderToStaticMarkup(h(AyudaTooltip, { id: 'dni-ayuda', texto: '7 u 8 dígitos, sin puntos' }));
    assert.match(
      html,
      /<button type="button" class="ayuda-tooltip-boton" aria-label="Más información" aria-describedby="dni-ayuda" aria-expanded="false">/
    );
    assert.match(html, /<svg width="16" height="16"[^>]*aria-hidden="true"/);
    assert.match(html, /<span id="dni-ayuda" class="sr-only">7 u 8 dígitos, sin puntos<\/span>/);
    // Cerrado no hay popover: el texto se lee igual por el span oculto.
    assert.doesNotMatch(html, /ayuda-tooltip-popover/);
  });

  test('sin id propio genera uno y lo usa en aria-describedby', () => {
    const html = renderToStaticMarkup(h(AyudaTooltip, { texto: 'Algo' }));
    const id = html.match(/<span id="([^"]+)" class="sr-only">Algo<\/span>/)?.[1];
    assert.ok(id);
    assert.match(html, new RegExp(`aria-describedby="${id}"`));
  });
});

describe('FormField con `ayuda`', () => {
  const campo = (props) =>
    renderToStaticMarkup(h(FormField, { id: 'dni', label: 'DNI', required: true, ...props }, h('input', { name: 'dni' })));

  test('el input queda descripto por la ayuda; el ícono va fuera del label', () => {
    const html = campo({ ayuda: '7 u 8 dígitos, sin puntos' });
    assert.match(html, /<input id="dni" aria-describedby="dni-ayuda" aria-required="true" name="dni"\/>/);
    assert.match(html, /<span id="dni-ayuda" class="sr-only">7 u 8 dígitos, sin puntos<\/span>/);
    // El label no contiene el botón: el nombre del campo sigue siendo "DNI".
    const label = html.match(/<label for="dni">.*?<\/label>/)[0];
    assert.doesNotMatch(label, /button|Más información/);
    assert.match(html, /<div class="form-field-label-fila"><label for="dni">/);
    assert.doesNotMatch(html, /form-field-hint/);
  });

  test('ayuda + hint visible: los dos en aria-describedby y el hint sigue debajo', () => {
    const html = campo({ ayuda: 'Si no lo sabés, dejá el odómetro actual.', hint: 'Odómetro actual: 1.000 km' });
    assert.match(html, /aria-describedby="dni-ayuda dni-hint"/);
    assert.match(html, /<p id="dni-hint" class="form-field-hint">Odómetro actual: 1\.000 km<\/p>/);
  });

  test('con error: el error sigue debajo del campo y la ayuda se mantiene', () => {
    const html = campo({ ayuda: '7 u 8 dígitos, sin puntos', error: 'El DNI no es válido' });
    assert.match(html, /aria-describedby="dni-ayuda dni-error"/);
    assert.match(html, /<p id="dni-error" class="form-field-error" role="alert">El DNI no es válido<\/p>/);
    assert.match(html, /class="sr-only">7 u 8 dígitos, sin puntos</);
  });

  test('sin ayuda el marcado no cambia (sin fila ni botón)', () => {
    const html = campo({ hint: 'Cargando…' });
    assert.doesNotMatch(html, /form-field-label-fila|ayuda-tooltip/);
    assert.match(html, /<label for="dni">DNI/);
  });
});

describe('AyudaTooltip: interacción', () => {
  test('al tocar se abre y al volver a tocar se cierra (toggle)', () => {
    montar(h(AyudaTooltip, { id: 'a', texto: 'Formato AB123CD o ABC123' }));
    assert.equal(popover(), null);
    tocar(boton());
    assert.equal(popover()?.textContent, 'Formato AB123CD o ABC123');
    assert.equal(popover().getAttribute('aria-hidden'), 'true');
    assert.equal(boton().getAttribute('aria-expanded'), 'true');
    assert.equal(boton().getAttribute('aria-controls'), popover().id);
    tocar(boton());
    assert.equal(popover(), null);
    assert.equal(boton().getAttribute('aria-expanded'), 'false');
  });

  test('Escape lo cierra', () => {
    montar(h(AyudaTooltip, { id: 'a', texto: 'Texto' }));
    tocar(boton());
    assert.ok(popover());
    act(() => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(popover(), null);
  });

  test('tocar afuera lo cierra; tocar el popover no', () => {
    montar(h('div', null, h(AyudaTooltip, { id: 'a', texto: 'Texto' }), h('p', { id: 'afuera' }, 'otro')));
    tocar(boton());
    disparar(popover(), 'pointerdown', { pointerType: 'touch' });
    assert.ok(popover());
    disparar(contenedor.querySelector('#afuera'), 'pointerdown', { pointerType: 'touch' });
    assert.equal(popover(), null);
  });

  test('al llegar con el teclado se abre; al salir del botón se cierra', () => {
    montar(h('div', null, h(AyudaTooltip, { id: 'a', texto: 'Texto' }), h('input', { id: 'siguiente' })));
    act(() => boton().focus());
    assert.ok(popover());
    act(() => contenedor.querySelector('#siguiente').focus());
    assert.equal(popover(), null);
  });

  test('hover con mouse lo abre solo si el dispositivo tiene hover', () => {
    montar(h(AyudaTooltip, { id: 'a', texto: 'Texto' }));
    disparar(boton(), 'pointerover', { pointerType: 'mouse' });
    assert.equal(popover(), null, 'sin (hover: hover) no se abre por hover');

    simularHover(true);
    disparar(boton(), 'pointerover', { pointerType: 'mouse' });
    assert.ok(popover());
  });

  test('no se sale de los bordes de la pantalla', () => {
    const anchoPopover = 200;
    const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => anchoPopover });
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
      montar(h(AyudaTooltip, { id: 'a', texto: 'Un texto de ayuda largo' }));
      // Ícono pegado al borde derecho.
      boton().getBoundingClientRect = () => ({ left: 300, right: 316, top: 100, bottom: 116, width: 16, height: 16 });
      tocar(boton());
      assert.equal(popover().style.left, `${320 - anchoPopover - 8}px`);
      assert.equal(popover().style.top, `${116 + 6}px`);
      tocar(boton());

      // Ícono pegado al borde izquierdo.
      boton().getBoundingClientRect = () => ({ left: 0, right: 16, top: 100, bottom: 116, width: 16, height: 16 });
      tocar(boton());
      assert.equal(popover().style.left, '8px');
    } finally {
      if (original) Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', original);
    }
  });
});
