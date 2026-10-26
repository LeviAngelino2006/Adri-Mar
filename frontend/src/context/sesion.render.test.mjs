// Tests de la sesión en el front (H1 de docs/auditoria-ux/personal-usuarios.md):
// el usuario guardado se refresca desde /auth/me al cargar la app y cuando el
// token renovado trae otro perfil o habilitación; ante un 401 se vuelve al login
// con "Tu sesión venció. Iniciá sesión de nuevo.". Se corren con `npm test`.
//
// Se monta AuthProvider con react-dom/client sobre jsdom; la API se reemplaza
// por un doble.

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
// api.js avisa con window.dispatchEvent(new Event(...)): tiene que ser el Event de jsdom.
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let api;
let MemoryRouter;
let AuthProvider;
let useAuth;
let Login;
let contenedor;
let raiz;

// Lo que responde /auth/me en cada test.
let usuarioDelBackend;
let pedidosMe;

const DIEGO_ENCARGADO = { id: 4, personaId: 4, nombre: 'Diego', apellido: 'Sosa', nombreUsuario: 'dsosa', perfil: 'ENCARGADO', habilitadoParaConducir: false };

function tokenCon(payload) {
  const parte = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
  return `${parte({ alg: 'HS256' })}.${parte(payload)}.firma`;
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/auth/me') {
      pedidosMe += 1;
      return { data: { usuario: usuarioDelBackend } };
    }
    return { data: {} };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider, useAuth } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  Login = (await vite.ssrLoadModule('/src/pages/Login.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  pedidosMe = 0;
  usuarioDelBackend = DIEGO_ENCARGADO;
  localStorage.setItem('adrimar_token', tokenCon({ id: 4, perfil: 'ENCARGADO', habilitadoParaConducir: false }));
  localStorage.setItem('adrimar_usuario', JSON.stringify(DIEGO_ENCARGADO));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

// Muestra el perfil del usuario de la sesión, o el login si no hay sesión.
function Pantalla() {
  const { usuario } = useAuth();
  return usuario ? h('p', { id: 'perfil' }, usuario.perfil) : h(Login);
}

async function montar() {
  await act(async () => {
    raiz.render(h(MemoryRouter, null, h(AuthProvider, null, h(Pantalla))));
  });
}

const perfilEnPantalla = () => contenedor.querySelector('#perfil')?.textContent;

// El interceptor de respuesta de axios, como lo ejecuta axios con cada respuesta.
const interceptorOk = () => api.interceptors.response.handlers[0].fulfilled;
const interceptorError = () => api.interceptors.response.handlers[0].rejected;

describe('el usuario guardado se refresca desde el backend', () => {
  test('al cargar la app se pide /auth/me y se usa lo que dice la base', async () => {
    usuarioDelBackend = { ...DIEGO_ENCARGADO, perfil: 'PERSONAL_TALLER' };
    await montar();
    assert.equal(pedidosMe, 1);
    assert.equal(perfilEnPantalla(), 'PERSONAL_TALLER');
    assert.equal(JSON.parse(localStorage.getItem('adrimar_usuario')).perfil, 'PERSONAL_TALLER');
  });

  test('con un backend anterior (/auth/me sin nombre ni apellido) se conservan los guardados', async () => {
    usuarioDelBackend = { id: 4, personaId: 4, nombreUsuario: 'dsosa', perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false, iat: 1, exp: 2 };
    await montar();
    const guardado = JSON.parse(localStorage.getItem('adrimar_usuario'));
    assert.equal(guardado.perfil, 'PERSONAL_TALLER');
    assert.equal(guardado.nombre, 'Diego');
    assert.equal(guardado.apellido, 'Sosa');
    assert.equal(guardado.iat, undefined);
  });

  test('un token renovado con otro perfil vuelve a pedir el usuario', async () => {
    await montar();
    assert.equal(perfilEnPantalla(), 'ENCARGADO');

    usuarioDelBackend = { ...DIEGO_ENCARGADO, perfil: 'CHOFER', habilitadoParaConducir: true };
    await act(async () => {
      interceptorOk()({ headers: { 'x-renewed-token': tokenCon({ id: 4, perfil: 'CHOFER', habilitadoParaConducir: true }) } });
    });
    assert.equal(pedidosMe, 2);
    assert.equal(perfilEnPantalla(), 'CHOFER');
  });

  test('también si el pedido dio error: un 403 en la pantalla que ya no le corresponde trae el perfil nuevo', async () => {
    await montar();
    usuarioDelBackend = { ...DIEGO_ENCARGADO, perfil: 'CHOFER', habilitadoParaConducir: true };
    await act(async () => {
      const error = { response: { status: 403, headers: { 'x-renewed-token': tokenCon({ id: 4, perfil: 'CHOFER', habilitadoParaConducir: true }) } } };
      await interceptorError()(error).catch(() => {});
    });
    assert.equal(pedidosMe, 2);
    assert.equal(perfilEnPantalla(), 'CHOFER');
  });

  test('un token renovado con el mismo perfil no pide nada', async () => {
    await montar();
    await act(async () => {
      interceptorOk()({ headers: { 'x-renewed-token': tokenCon({ id: 4, perfil: 'ENCARGADO', habilitadoParaConducir: false }) } });
    });
    assert.equal(pedidosMe, 1);
  });
});

describe('401: vuelve al login con el motivo', () => {
  test('el login muestra "Tu sesión venció. Iniciá sesión de nuevo."', async () => {
    await montar();
    await act(async () => {
      await interceptorError()({ response: { status: 401 } }).catch(() => {});
    });
    assert.equal(perfilEnPantalla(), undefined);
    assert.equal(contenedor.querySelector('.alert-warning')?.textContent, 'Tu sesión venció. Iniciá sesión de nuevo.');
    assert.equal(localStorage.getItem('adrimar_token'), null);
  });
});
