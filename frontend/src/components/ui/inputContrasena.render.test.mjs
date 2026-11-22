// Tests de InputContrasena: botón para mostrar/ocultar la contraseña en todos
// los formularios con contraseña (Login, Mi perfil, Cambiar contraseña y Usuarios),
// preservando las props accesibles que inyecta FormField. Se corre con `npm test`.

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let FormField;
let InputContrasena;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  FormField = (await vite.ssrLoadModule('/src/components/ui/FormField.jsx')).default;
  InputContrasena = (await vite.ssrLoadModule('/src/components/ui/InputContrasena.jsx')).default;
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

function listarArchivosJsx(dir) {
  const archivos = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivos.push(...listarArchivosJsx(ruta));
    else if (entrada.name.endsWith('.jsx')) archivos.push(ruta);
  }
  return archivos;
}

describe('InputContrasena', () => {
  test('arranca oculta y alterna entre password y text con el botón', async () => {
    let envios = 0;
    await act(async () => {
      raiz.render(
        h(
          'form',
          {
            onSubmit: (e) => {
              e.preventDefault();
              envios += 1;
            },
          },
          h(
            FormField,
            { id: 'clave', label: 'Contraseña', required: true, error: 'Error de prueba' },
            h(InputContrasena, { name: 'clave', defaultValue: 'secreta123', autoComplete: 'current-password' })
          )
        )
      );
    });

    const input = contenedor.querySelector('#clave');
    const toggle = contenedor.querySelector('.input-contrasena-toggle');
    assert.ok(input);
    assert.ok(toggle);
    assert.equal(input.getAttribute('type'), 'password');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(input.getAttribute('aria-required'), 'true');
    assert.equal(input.getAttribute('aria-describedby'), 'clave-error');
    assert.equal(toggle.getAttribute('type'), 'button');
    assert.equal(toggle.getAttribute('aria-label'), 'Mostrar contraseña');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');

    await act(async () => toggle.click());
    assert.equal(input.getAttribute('type'), 'text');
    assert.equal(toggle.getAttribute('aria-label'), 'Ocultar contraseña');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(envios, 0);

    await act(async () => toggle.click());
    assert.equal(input.getAttribute('type'), 'password');
    assert.equal(toggle.getAttribute('aria-label'), 'Mostrar contraseña');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  });

  test('ninguna pantalla ni modal deja un input type="password" crudo sin InputContrasena', () => {
    const srcDir = path.join(RAIZ, 'src');
    const propios = listarArchivosJsx(srcDir).filter((ruta) => path.basename(ruta) !== 'InputContrasena.jsx');
    for (const ruta of propios) {
      const contenido = fs.readFileSync(ruta, 'utf8');
      assert.doesNotMatch(contenido, /type\s*=\s*["']password["']/, `${path.relative(srcDir, ruta)} usa type="password" directo`);
    }
  });
});
