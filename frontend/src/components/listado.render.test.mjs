// Smoke test de render de la barra de los listados (ListadoToolbar): el orden de
// sus piezas es el mismo en todas las pantallas. Se corre con `npm test`
// (node:test).
//
// Mismo método que confirmarViaje.render.test.mjs: Vite en modo SSR carga los
// .jsx y se renderiza a HTML con react-dom/server. Verifica la estructura, NO los
// clicks ni los estilos (la posición a la derecha la da Listado.css).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let ListadoToolbar;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ ListadoToolbar } = await vite.ssrLoadModule('/src/components/Listado.jsx'));
});

after(() => vite.close());

const BUSQUEDA = { valor: '', onChange() {}, placeholder: 'Buscar por cliente o lugar' };
const FILTROS = { abierto: false, onToggle() {}, activos: 0 };
const VISTAS = {
  opciones: [
    { valor: 'proximos', etiqueta: 'Próximos' },
    { valor: 'anteriores', etiqueta: 'Anteriores' },
  ],
  valor: 'proximos',
  onChange() {},
  ariaLabel: 'Vista de viajes',
};
const ACCION = { etiqueta: 'Crear viaje', onClick() {} };

// Las piezas de la barra, en el orden del DOM.
function piezas(html) {
  const nombres = {
    'listado-buscar': 'buscar',
    'filtros-toggle-btn': 'filtros',
    'control-segmentado': 'vistas',
    'listado-accion': 'accion',
  };
  return [...html.matchAll(/class="([^"]*)"/g)]
    .map(([, clases]) => clases.split(' ').map((c) => nombres[c]).find(Boolean))
    .filter(Boolean);
}

describe('ListadoToolbar', () => {
  test('buscador y Filtros primero; las vistas y la acción, al final (a la derecha)', () => {
    const html = renderToStaticMarkup(h(ListadoToolbar, { busqueda: BUSQUEDA, filtros: FILTROS, vistas: VISTAS, accion: ACCION }));
    assert.match(html, /^<div class="listado-toolbar">/);
    assert.deepEqual(piezas(html), ['buscar', 'filtros', 'vistas', 'accion']);
  });

  test('sin buscador ni Filtros (Arreglos), el control de vistas va solo, con la misma clase de barra', () => {
    const html = renderToStaticMarkup(h(ListadoToolbar, { vistas: VISTAS }));
    assert.match(html, /^<div class="listado-toolbar">/);
    assert.deepEqual(piezas(html), ['vistas']);
  });

  test('ya no hay variante con las vistas al inicio', () => {
    const html = renderToStaticMarkup(h(ListadoToolbar, { busqueda: BUSQUEDA, filtros: FILTROS, vistas: VISTAS, vistasAlInicio: true }));
    assert.deepEqual(piezas(html), ['buscar', 'filtros', 'vistas']);
    assert.doesNotMatch(html, /vistas-inicio/);
  });
});
