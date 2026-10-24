// Tests de OpcionVacia, la primera opción de los select: en los obligatorios es
// un placeholder que no se puede elegir y en los opcionales permite volver a
// "sin valor". Se corren con `npm test` (node:test).
//
// Mismo método que cargando.render.test.mjs: Vite en modo SSR carga los .jsx y
// se renderiza a HTML con react-dom/server. Además, una guarda sobre el código:
// ningún select arma su opción vacía a mano.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
let OpcionVacia;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  OpcionVacia = (await vite.ssrLoadModule('/src/components/ui/OpcionVacia.jsx')).default;
});

after(() => vite.close());

const select = (...opciones) => renderToStaticMarkup(h('select', { value: '', onChange() {} }, ...opciones));

describe('OpcionVacia', () => {
  test('obligatorio: placeholder deshabilitado y oculto de la lista, pero visible mientras no hay valor', () => {
    const html = select(h(OpcionVacia, { obligatorio: true }, 'Elegí el tipo de trabajo'), h('option', { value: '3' }, 'Frenos'));
    assert.match(html, /<option value="" disabled="" hidden="" selected="">Elegí el tipo de trabajo<\/option>/);
  });

  test('opcional: una opción más, que se puede elegir para volver a "sin valor"', () => {
    const html = select(h(OpcionVacia, null, 'Sin definir'));
    assert.match(html, /<option value="" selected="">Sin definir<\/option>/);
    assert.doesNotMatch(html, /disabled|hidden/);
  });
});

// Todos los .jsx de src, menos los tests.
function archivosJsx(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return archivosJsx(ruta);
    return entrada.name.endsWith('.jsx') ? [ruta] : [];
  });
}

describe('selects de la app', () => {
  test('ninguno arma su opción vacía a mano: usan OpcionVacia (salvo el "Todos" de los filtros)', () => {
    const aMano = archivosJsx(path.join(RAIZ, 'src'))
      .filter((archivo) => !archivo.endsWith('OpcionVacia.jsx'))
      .flatMap((archivo) =>
        fs
          .readFileSync(archivo, 'utf8')
          .split(/\r?\n/)
          .map((linea, indice) => ({ archivo: path.relative(RAIZ, archivo), linea: indice + 1, texto: linea.trim() }))
          .filter(({ texto }) => /<option value=""/.test(texto) && !/>Todos<\/option>/.test(texto))
      );
    assert.deepEqual(aMano, []);
  });
});
