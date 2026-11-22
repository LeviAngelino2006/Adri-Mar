// Tests de la pantalla "Mi perfil" (SCRUM-259, SCRUM-276, SCRUM-277):
// - Acceso directo desde el bloque del usuario al pie de la sidebar (.layout-user -> /mi-perfil).
// - Muestra los datos básicos propios desde GET /auth/perfil (nombre, usuario, perfil y último ingreso).
// - Manejo de error de carga con "Reintentar".
// - Cambio de contraseña propia pidiendo la actual (validaciones, 400, 429 y éxito).
//
// Se monta con react-dom/client sobre jsdom; la API real (con sus interceptores)
// responde desde un adapter de axios falso. Se corre con `npm test`.

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
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

const RAMIRO = {
  id: 11,
  personaId: 14,
  nombre: 'Ramiro',
  apellido: 'Acosta',
  nombreUsuario: 'racosta',
  perfil: 'CHOFER',
  habilitadoParaConducir: true,
  debeCambiarContrasena: false,
  ultimoIngreso: '2026-11-21T20:40:00.000Z',
  creadoEn: '2026-03-02T12:00:00.000Z',
};

let vite;
let api;
let rr;
let AuthProvider;
let ProtectedRoute;
let Layout;
let MiPerfil;
let contenedor;
let raiz;

let enBackend;
let falloPerfil;
let modoContrasena;
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

  if (metodo === 'GET' && config.url === '/auth/me') {
    const { ultimoIngreso: _ui, creadoEn: _ce, ...sesion } = enBackend.usuario;
    return responder(200, { usuario: sesion });
  }

  if (metodo === 'GET' && config.url === '/auth/perfil') {
    if (falloPerfil) {
      falloPerfil = false;
      return responder(500, { error: 'Error interno del servidor' });
    }
    return responder(200, { usuario: enBackend.usuario });
  }

  if (metodo === 'PUT' && config.url === '/auth/contrasena') {
    if (modoContrasena === '429') {
      return responder(429, { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    }
    const { contrasenaActual, contrasenaNueva } = JSON.parse(config.data);
    if (contrasenaActual !== enBackend.contrasena) {
      return responder(400, { errores: { contrasenaActual: 'La contraseña actual no es correcta' } });
    }
    enBackend.contrasena = contrasenaNueva;
    return responder(200, { usuario: { ...enBackend.usuario, debeCambiarContrasena: false } });
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
  Layout = (await vite.ssrLoadModule('/src/components/Layout.jsx')).default;
  MiPerfil = (await vite.ssrLoadModule('/src/pages/MiPerfil.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  pedidos.length = 0;
  falloPerfil = false;
  modoContrasena = 'ok';
  enBackend = { usuario: { ...RAMIRO }, contrasena: 'clave-actual-1' };
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(RAMIRO));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

async function montar(ruta = '/mi-perfil') {
  const { MemoryRouter, Routes, Route } = rr;
  const inicio = h(Layout, null, h('h1', null, 'Dashboard'));
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
            h(Route, { path: '/', element: h(ProtectedRoute, null, inicio) }),
            h(Route, { path: '/mi-perfil', element: h(ProtectedRoute, null, h(MiPerfil)) })
          )
        )
      )
    );
  });
}

const titulo = () => contenedor.querySelector('h1')?.textContent;
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const error = (id) => contenedor.querySelector(`#${id}-error`)?.textContent;
const datosFicha = () =>
  Object.fromEntries(
    [...contenedor.querySelectorAll('.detalle-grid .detalle-item')].map((item) => [
      item.querySelector('dt').textContent.trim(),
      item.querySelector('dd').textContent.trim(),
    ])
  );

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

describe('Mi perfil: acceso desde el pie de la sidebar (SCRUM-259)', () => {
  test('el bloque del usuario al pie de la sidebar navega directo a /mi-perfil', async () => {
    await montar('/');
    assert.equal(titulo(), 'Dashboard');
    assert.equal(contenedor.querySelector('#layout-menu-usuario'), null);

    const bloqueUsuario = contenedor.querySelector('a.layout-user');
    assert.ok(bloqueUsuario);
    assert.equal(bloqueUsuario.getAttribute('href'), '/mi-perfil');
    assert.match(bloqueUsuario.textContent, /Ramiro Acosta/);
    assert.match(bloqueUsuario.textContent, /Chofer/);

    await act(async () => {
      bloqueUsuario.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    assert.equal(titulo(), 'Mi perfil');
    assert.ok(contenedor.querySelector('a.layout-user').classList.contains('is-active'));
    assert.equal(contenedor.querySelector('.layout-topbar-seccion')?.textContent, 'Mi perfil');
  });
});

describe('Mi perfil: datos propios y estados de carga', () => {
  test('muestra nombre, usuario, perfil y último ingreso desde GET /auth/perfil', async () => {
    await montar('/mi-perfil');

    assert.ok(pedidos.some((p) => p.metodo === 'GET' && p.url === '/auth/perfil'));
    assert.equal(contenedor.querySelector('.mi-perfil-nombre')?.textContent.trim(), 'Ramiro Acosta');
    assert.equal(contenedor.querySelector('.mi-perfil-usuario')?.textContent.trim(), '@racosta');
    assert.deepEqual(datosFicha(), {
      'Nombre y apellido': 'Ramiro Acosta',
      'Nombre de usuario': '@racosta',
      Perfil: 'Chofer',
      'Último ingreso': '21 nov 2026 17:40',
    });
  });

  test('sin último ingreso registrado muestra "Sin registro" y traduce otros perfiles', async () => {
    enBackend.usuario = {
      ...RAMIRO,
      nombre: 'Adriana',
      apellido: 'Martínez',
      nombreUsuario: 'amartinez',
      perfil: 'ADMINISTRADOR',
      ultimoIngreso: null,
    };
    localStorage.setItem('adrimar_usuario', JSON.stringify(enBackend.usuario));

    await montar('/mi-perfil');
    assert.deepEqual(datosFicha(), {
      'Nombre y apellido': 'Adriana Martínez',
      'Nombre de usuario': '@amartinez',
      Perfil: 'Administrador',
      'Último ingreso': 'Sin registro',
    });
  });

  test('si falla la carga muestra "Reintentar" y al reintentar recupera los datos', async () => {
    falloPerfil = true;
    await montar('/mi-perfil');

    assert.match(contenedor.textContent, /No pudimos cargar tu perfil\. Intentá de nuevo en unos minutos\./);
    const reintentar = boton('Reintentar');
    assert.ok(reintentar);

    await act(async () => reintentar.click());
    assert.equal(datosFicha()['Nombre de usuario'], '@racosta');
  });
});

describe('Mi perfil: cambio de contraseña propia', () => {
  test('valida los 3 campos en cliente sin llamar al backend', async () => {
    await montar('/mi-perfil');
    await act(async () => boton('Cambiar contraseña').click());

    assert.equal(error('contrasenaActual'), 'Ingresá tu contraseña actual');
    assert.equal(error('contrasenaNueva'), 'La contraseña nueva es obligatoria');
    assert.equal(error('repetirContrasena'), 'Repetí la contraseña nueva');
    assert.equal(pedidos.filter((p) => p.url === '/auth/contrasena').length, 0);
  });

  test('valida longitud, solo espacios, distinta de actual y coincidencia', async () => {
    await montar('/mi-perfil');

    await completarYEnviar('clave-actual-1', '        ', 'otra');
    assert.equal(error('contrasenaNueva'), 'La contraseña no puede tener solo espacios');
    assert.equal(error('repetirContrasena'), 'Las contraseñas no coinciden');

    await completarYEnviar('clave-actual-1', 'clave-actual-1', 'clave-actual-1');
    assert.equal(error('contrasenaNueva'), 'Tiene que ser distinta de la actual');
    assert.equal(pedidos.filter((p) => p.url === '/auth/contrasena').length, 0);
  });

  test('muestra el error del backend si la contraseña actual es incorrecta o hay 429', async () => {
    await montar('/mi-perfil');

    await completarYEnviar('no-es-esta', 'nueva-clave-1');
    assert.equal(error('contrasenaActual'), 'La contraseña actual no es correcta');

    modoContrasena = '429';
    await completarYEnviar('clave-actual-1', 'nueva-clave-1');
    const alerta = contenedor.querySelector('.alert-error');
    assert.match(alerta?.textContent ?? '', /Demasiados intentos\. Probá de nuevo en unos minutos\./);
  });

  test('con la contraseña actual correcta guarda, limpia los campos y muestra Toast', async () => {
    await montar('/mi-perfil');
    await completarYEnviar('clave-actual-1', 'nueva-clave-1');

    const cambio = pedidos.find((p) => p.metodo === 'PUT' && p.url === '/auth/contrasena');
    assert.deepEqual(cambio?.datos, { contrasenaActual: 'clave-actual-1', contrasenaNueva: 'nueva-clave-1' });
    assert.equal(contenedor.querySelector('.toast')?.textContent, 'Contraseña cambiada correctamente.');
    assert.equal(contenedor.querySelector('#contrasenaActual').value, '');
    assert.equal(contenedor.querySelector('#contrasenaNueva').value, '');
    assert.equal(contenedor.querySelector('#repetirContrasena').value, '');
    assert.equal(titulo(), 'Mi perfil');
  });
});
