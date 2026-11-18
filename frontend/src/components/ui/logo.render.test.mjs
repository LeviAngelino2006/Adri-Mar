// Tests de Logo, el logo del sistema (ícono del odómetro + nombre). Se corren
// con `npm test` (node:test). Mismo método que cargando.render.test.mjs: Vite
// en modo SSR carga los .jsx y se renderiza a HTML con react-dom/server.

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
let Logo;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  Logo = (await vite.ssrLoadModule('/src/components/ui/Logo.jsx')).default;
});

after(async () => {
  await vite?.close();
});

describe('Logo', () => {
  test('el contenedor se anuncia con el nombre y el ícono queda oculto', () => {
    const html = renderToStaticMarkup(h(Logo, { tamano: 36 }));
    assert.match(html, /role="img"/);
    assert.match(html, /aria-label="Adri-Mar Gestión Online"/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /<svg[^>]*width="36"[^>]*height="36"/);
    assert.match(html, /--logo-tamano:36px/);
  });

  test('por defecto muestra el nombre con la variante "claro"', () => {
    const html = renderToStaticMarkup(h(Logo, {}));
    assert.match(html, /class="logo logo-claro"/);
    assert.match(html, />Adri-Mar</);
    assert.match(html, />Gestión Online</);
  });

  test('"sobreMarca" cambia solo el fondo del cuadrado; el odómetro es el mismo', () => {
    const claro = renderToStaticMarkup(h(Logo, {}));
    const sobreMarca = renderToStaticMarkup(h(Logo, { variante: 'sobreMarca' }));
    assert.match(sobreMarca, /class="logo logo-sobreMarca"/);
    const fondo = (html) => html.match(/<rect[^>]*fill="([^"]+)"/)[1];
    assert.equal(fondo(claro), '#0535a6');
    assert.equal(fondo(sobreMarca), 'rgba(255, 255, 255, 0.12)');
    // Sin el <rect>, el resto del ícono (el odómetro) es idéntico.
    const odometro = (html) => html.match(/<svg[\s\S]*<\/svg>/)[0].replace(/<rect[^>]*>(<\/rect>)?/, '');
    assert.equal(odometro(sobreMarca), odometro(claro));
  });

  test('soloIcono no muestra el nombre', () => {
    const html = renderToStaticMarkup(h(Logo, { soloIcono: true }));
    assert.doesNotMatch(html, /logo-texto/);
    assert.match(html, /aria-label="Adri-Mar Gestión Online"/);
  });
});
