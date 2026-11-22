// Tests de "Cambiar contraseña" (H11 de docs/auditoria-ux/personal-usuarios.md,
// tanda 2): con una contraseña provisoria la app lleva a esa pantalla y no deja
// ir a otro lado, también cuando un gestor la define con la sesión abierta (el
// próximo pedido responde 403 con el código). Después del cambio se usa la app
// normal. Y "Cambiar mi contraseña" en el menú del usuario de la sidebar. Se
// corren con `npm test`.
//
// Se monta con react-dom/client sobre jsdom, con ProtectedRoute y la pantalla
// reales. La API real (con sus interceptores) responde desde un adapter de
// axios falso: así el 403 con el código pasa por el interceptor de verdad.

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
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

const RAMIRO = { id: 11, personaId: 14, nombre: 'Ramiro', apellido: 'Acosta', nombreUsuario: 'racosta', perfil: 'CHOFER', habilitadoParaConducir: true };
const BLOQUEADA = { error: 'Tenés que cambiar tu contraseña antes de seguir.', codigo: 'DEBE_CAMBIAR_CONTRASENA' };

let vite;
let api;
let rr;
let AuthProvider;
let ProtectedRoute;
let CambiarContrasena;
let MiPerfil;
let contenedor;
let raiz;

// Lo que responde el backend falso, y lo que se le pidió.
let enBackend;
const pedidos = [];

function adaptador(config) {
  const metodo = config.method.toUpperCase();
  pedidos.push({ metodo, url: config.url, datos: config.data ? JSON.parse(config.data) : undefined });
  const responder = (status, data) => {
    const respuesta = { data, status, statusText: String(status), headers: {}, config };
    if (status < 400) return Promise.resolve(respuesta);
    const err = new Error(String(status));
    err.isAxiosError = true;
    err.config = config;
    err.response = respuesta;
    return Promise.reject(err);
  };
  if (metodo === 'GET' && config.url === '/auth/me') return responder(200, { usuario: enBackend.usuario });
  if (metodo === 'PUT' && config.url === '/auth/contrasena') {
    const { contrasenaActual, contrasenaNueva } = JSON.parse(config.data);
    if (contrasenaActual !== enBackend.contrasena) {
      return responder(400, { errores: { contrasenaActual: 'La contraseña actual no es correcta' } });
    }
    enBackend.contrasena = contrasenaNueva;
    enBackend.usuario = { ...enBackend.usuario, debeCambiarContrasena: false };
    return responder(200, { usuario: enBackend.usuario });
  }
  // Cualquier otro pedido: bloqueado mientras la contraseña sea provisoria.
  if (enBackend.usuario.debeCambiarContrasena) return responder(403, BLOQUEADA);
  if (metodo === 'GET' && config.url === '/auth/perfil') {
    return responder(200, { usuario: { ...enBackend.usuario, ultimoIngreso: null, creadoEn: '2026-03-02T12:00:00.000Z' } });
  }
  return responder(200, {});
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.defaults.adapter = adaptador;
  rr = await import('react-router-dom');
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  ProtectedRoute = (await vite.ssrLoadModule('/src/components/ProtectedRoute.jsx')).default;
  CambiarContrasena = (await vite.ssrLoadModule('/src/pages/CambiarContrasena.jsx')).default;
  MiPerfil = (await vite.ssrLoadModule('/src/pages/MiPerfil.jsx')).default;
});

after(() => vite.close());

function sesion(usuario) {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(usuario));
}

beforeEach(() => {
  pedidos.length = 0;
  enBackend = { usuario: { ...RAMIRO, debeCambiarContrasena: false }, contrasena: 'provisoria-1' };
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

// Las rutas de App.jsx que importan acá: el inicio y Mis viajes (con una página
// de mentira cada una), el login y la de cambiar la contraseña, real.
async function montar(ruta) {
  const { MemoryRouter, Routes, Route } = rr;
  const pagina = (texto) => h('main', null, h('h1', null, texto));
  await act(async () => {
    raiz.render(
      h(
        MemoryRouter,
        { initialEntries: [ruta] },
        h(
          AuthProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/login', element: pagina('Iniciar sesión') }),
            h(Route, { path: '/', element: h(ProtectedRoute, null, pagina('Inicio')) }),
            h(Route, { path: '/mis-viajes', element: h(ProtectedRoute, null, pagina('Mis viajes')) }),
            h(Route, {
              path: '/cambiar-contrasena',
              element: h(ProtectedRoute, { permiteContrasenaProvisoria: true }, h(CambiarContrasena)),
            }),
            h(Route, {
              path: '/mi-perfil',
              element: h(ProtectedRoute, null, h(MiPerfil)),
            })
          )
        )
      )
    );
  });
}

const titulo = () => contenedor.querySelector('h1')?.textContent;
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const error = (id) => contenedor.querySelector(`#${id}-error`)?.textContent;
const guardado = () => JSON.parse(localStorage.getItem('adrimar_usuario'));

function escribir(id, texto) {
  const input = contenedor.querySelector(`#${id}`);
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    asignarValue.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function completarYEnviar(actual, nueva, repetir = nueva) {
  escribir('contrasenaActual', actual);
  escribir('contrasenaNueva', nueva);
  escribir('repetirContrasena', repetir);
  await act(async () => boton('Cambiar contraseña').click());
}

describe('Con la contraseña provisoria, la app lleva a cambiarla', () => {
  beforeEach(() => {
    enBackend.usuario.debeCambiarContrasena = true;
    sesion({ ...RAMIRO, debeCambiarContrasena: true });
  });

  test('después del login, "/" lleva a "Cambiar contraseña", sin la navegación', async () => {
    await montar('/');
    assert.equal(titulo(), 'Cambiar contraseña');
    assert.equal(contenedor.querySelector('nav'), null, 'no hay menú para ir a otro lado');
    assert.ok(boton('Cerrar sesión'));
  });

  test('cualquier otra ruta también (incluida /mi-perfil)', async () => {
    await montar('/mis-viajes');
    assert.equal(titulo(), 'Cambiar contraseña');
    await montar('/mi-perfil');
    assert.equal(titulo(), 'Cambiar contraseña');
  });

  test('con la actual incorrecta, el error del backend sale en el campo y no se sale de ahí', async () => {
    await montar('/');
    await completarYEnviar('no-es-esta', 'clave-nueva-1');
    assert.equal(error('contrasenaActual'), 'La contraseña actual no es correcta');
    assert.equal(titulo(), 'Cambiar contraseña');
    assert.equal(guardado().debeCambiarContrasena, true);
  });

  test('con la correcta, entra a la app y ya puede ir a otro lado', async () => {
    await montar('/mis-viajes');
    await completarYEnviar('provisoria-1', 'clave-nueva-1');

    assert.equal(titulo(), 'Inicio');
    assert.equal(guardado().debeCambiarContrasena, false);
    const cambio = pedidos.find((p) => p.url === '/auth/contrasena');
    assert.deepEqual(cambio.datos, { contrasenaActual: 'provisoria-1', contrasenaNueva: 'clave-nueva-1' });
  });

  test('"Cerrar sesión" vuelve al login', async () => {
    await montar('/');
    await act(async () => boton('Cerrar sesión').click());
    assert.equal(titulo(), 'Iniciar sesión');
    assert.equal(localStorage.getItem('adrimar_token'), null);
  });
});

describe('Un gestor la define con la sesión abierta', () => {
  test('el próximo pedido (403 con el código) lleva a "Cambiar contraseña"', async () => {
    sesion({ ...RAMIRO, debeCambiarContrasena: false });
    await montar('/mis-viajes');
    assert.equal(titulo(), 'Mis viajes');

    // En otra ventana, el gestor le cambia la contraseña.
    enBackend.usuario.debeCambiarContrasena = true;
    await act(async () => {
      await api.get('/viajes/mis-viajes').catch(() => {});
    });

    assert.equal(titulo(), 'Cambiar contraseña');
    assert.equal(guardado().debeCambiarContrasena, true);
  });

  test('un 403 de permisos, sin el código, no', async () => {
    sesion({ ...RAMIRO, debeCambiarContrasena: false });
    await montar('/mis-viajes');
    const antes = api.defaults.adapter;
    api.defaults.adapter = (config) => {
      const err = new Error('403');
      err.config = config;
      err.response = { status: 403, data: { error: 'No tiene permisos para esta acción' }, headers: {}, config };
      return Promise.reject(err);
    };
    try {
      await act(async () => {
        await api.get('/personas').catch(() => {});
      });
    } finally {
      api.defaults.adapter = antes;
    }
    assert.equal(titulo(), 'Mis viajes');
  });
});

describe('Cambiar mi contraseña, por elección (SCRUM-259)', () => {
  beforeEach(() => sesion({ ...RAMIRO, debeCambiarContrasena: false }));

  test('sin contraseña provisoria, /cambiar-contrasena redirige a /mi-perfil', async () => {
    await montar('/cambiar-contrasena');
    assert.equal(titulo(), 'Mi perfil');
    assert.ok(contenedor.querySelector('nav[aria-label="Principal"]'));
  });
});
