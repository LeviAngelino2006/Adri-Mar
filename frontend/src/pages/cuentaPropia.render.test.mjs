// Tests de la ficha propia en Personal y Usuarios (H3 de
// docs/auditoria-ux/personal-usuarios.md): nadie se da de baja, se bloquea la
// cuenta ni se cambia el perfil a sí mismo. En la ficha propia no aparecen "Dar
// de baja" ni "Desactivar acceso", y al editarse a sí mismo el perfil queda de
// solo lectura con el motivo. Y un Encargado no ve "Modificar credenciales" en la
// cuenta de un Encargado (H4). Al editar una cuenta, una contraseña de solo
// espacios se manda y el error del backend sale en el campo (H12). Y al guardar
// una persona, un 409 muestra el motivo que da el backend (H7, tanda 2). Se
// corren con `npm test`.
//
// Se montan Personal y Usuarios con react-dom/client sobre jsdom; la API se
// reemplaza por un doble.

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let MemoryRouter;
let AuthProvider;
let Personal;
let Usuarios;
let contenedor;
let raiz;

// Diego (Encargado) está logueado; Lucía es otra Encargada.
const DIEGO = { id: 4, personaId: 4, nombre: 'Diego', apellido: 'Sosa', nombreUsuario: 'dsosa', perfil: 'ENCARGADO', habilitadoParaConducir: false };
const persona = (id, nombre, apellido, nombreUsuario) => ({
  id,
  nombre,
  apellido,
  dni: String(30000000 + id),
  email: null,
  telefono: null,
  perfil: 'ENCARGADO',
  habilitadoParaConducir: false,
  activo: true,
  fechaBaja: null,
  creadoEn: '2026-03-02T12:00:00.000Z',
  usuario: { id, nombreUsuario, activo: true },
});
const ADRIANA = { id: 1, personaId: 1, nombre: 'Adriana', apellido: 'Martínez', nombreUsuario: 'amartinez', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false };
const PERSONAS = [
  persona(3, 'Lucía', 'Romero', 'lromero'),
  persona(4, 'Diego', 'Sosa', 'dsosa'),
  { ...persona(14, 'Ramiro', 'Acosta', 'racosta'), perfil: 'CHOFER', habilitadoParaConducir: true },
];
const enviados = [];
// Quién está logueado en cada test (Diego salvo que el test diga otra cosa).
let logueado = DIEGO;
const USUARIOS = PERSONAS.map((p) => ({
  id: p.id,
  nombreUsuario: p.usuario.nombreUsuario,
  personaId: p.id,
  nombre: p.nombre,
  apellido: p.apellido,
  dni: p.dni,
  perfil: p.perfil,
  habilitadoParaConducir: p.habilitadoParaConducir,
  activo: true,
  creadoEn: p.creadoEn,
}));

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/auth/me') return { data: { usuario: logueado } };
    if (endpoint === '/personas') return { data: { personas: PERSONAS } };
    if (endpoint === '/usuarios') return { data: { usuarios: USUARIOS } };
    return { data: {} };
  };
  // Como el backend: una contraseña de solo espacios da 400 en el campo.
  api.put = async (endpoint, datos) => {
    enviados.push({ endpoint, datos });
    if (datos.contrasena !== undefined && datos.contrasena.trim() === '') {
      const err = new Error('400');
      err.response = { status: 400, data: { errores: { contrasena: 'La contraseña no puede tener solo espacios' } } };
      throw err;
    }
    // Como el backend: Ramiro tiene un viaje Programado y no se lo deshabilita.
    if (endpoint === '/personas/14' && datos.habilitadoParaConducir === false) {
      const err = new Error('409');
      err.response = {
        status: 409,
        data: {
          error: 'Tiene 1 viaje programado. Reasignalo antes de deshabilitarla.',
          viajes: [{ id: 6, fecha: '2026-10-30T09:30:00.000Z', origen: 'Río Tercero', destino: 'Rosario' }],
        },
      };
      throw err;
    }
    return { data: {} };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  Personal = (await vite.ssrLoadModule('/src/pages/Personal.jsx')).default;
  Usuarios = (await vite.ssrLoadModule('/src/pages/Usuarios.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  logueado = DIEGO;
  enviados.length = 0;
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(DIEGO));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

async function montar(Pagina, ruta) {
  await act(async () => {
    raiz.render(h(MemoryRouter, { initialEntries: [ruta] }, h(AuthProvider, null, h(Pagina))));
  });
}

const botones = () => [...contenedor.querySelectorAll('button')].map((b) => b.textContent.trim());
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

describe('Personal: la ficha propia', () => {
  test('no ofrece "Dar de baja"', async () => {
    await montar(Personal, '/personal?id=4');
    assert.ok(botones().includes('Editar datos'));
    assert.ok(!botones().includes('Dar de baja'));
  });

  test('la ficha de otra persona sí lo ofrece', async () => {
    await montar(Personal, '/personal?id=3');
    assert.ok(botones().includes('Dar de baja'));
  });

  test('al editarse a sí mismo, el perfil y la habilitación quedan de solo lectura, con el motivo', async () => {
    await montar(Personal, '/personal?id=4');
    await act(async () => boton('Editar datos').click());
    assert.equal(contenedor.querySelector('select[name="perfil"]').disabled, true);
    assert.equal(contenedor.querySelector('#perfil-hint')?.textContent, 'Tu perfil lo cambia un Administrador.');
    assert.equal(contenedor.querySelector('input[name="habilitadoParaConducir"]').disabled, true);
    // El resto del formulario sigue editable.
    assert.equal(contenedor.querySelector('input[name="telefono"]').disabled, false);
  });

  test('al editar a otra persona, el perfil se puede cambiar', async () => {
    await montar(Personal, '/personal?id=3');
    await act(async () => boton('Editar datos').click());
    assert.equal(contenedor.querySelector('select[name="perfil"]').disabled, false);
    assert.equal(contenedor.querySelector('#perfil-hint'), null);
  });
});

describe('Personal: el motivo de un 409 al guardar (H7)', () => {
  test('deshabilitar a quien tiene viajes Programados muestra el mensaje del backend', async () => {
    await montar(Personal, '/personal?id=14');
    await act(async () => boton('Editar datos').click());
    await act(async () => contenedor.querySelector('input[name="habilitadoParaConducir"]').click());
    await act(async () => boton('Guardar cambios').click());

    assert.equal(enviados.at(-1).endpoint, '/personas/14');
    const alerta = [...contenedor.querySelectorAll('[role="alert"]')].map((a) => a.textContent).join(' ');
    assert.ok(alerta.includes('Tiene 1 viaje programado. Reasignalo antes de deshabilitarla.'), alerta);
  });
});

describe('Usuarios: la cuenta propia', () => {
  test('no ofrece "Desactivar acceso"', async () => {
    await montar(Usuarios, '/usuarios?id=4');
    assert.ok(contenedor.querySelector('h1')?.textContent.includes('dsosa'), 'está en la ficha de su cuenta');
    assert.ok(!botones().includes('Desactivar acceso'));
  });

  test('la cuenta de otra persona sí lo ofrece', async () => {
    await montar(Usuarios, '/usuarios?id=3');
    assert.ok(botones().includes('Desactivar acceso'));
  });
});

describe('Usuarios: las credenciales de un Encargado (H4)', () => {
  test('Diego (Encargado) no ve "Modificar credenciales" en la cuenta de Lucía (Encargada)', async () => {
    await montar(Usuarios, '/usuarios?id=3');
    assert.ok(!botones().includes('Modificar credenciales'));
  });

  test('ni en la suya', async () => {
    await montar(Usuarios, '/usuarios?id=4');
    assert.ok(!botones().includes('Modificar credenciales'));
  });

  test('sí en la cuenta de un Chofer', async () => {
    await montar(Usuarios, '/usuarios?id=14');
    assert.ok(botones().includes('Modificar credenciales'));
  });

  test('una Administradora sí la ve en la cuenta de un Encargado', async () => {
    logueado = ADRIANA;
    localStorage.setItem('adrimar_usuario', JSON.stringify(ADRIANA));
    await montar(Usuarios, '/usuarios?id=3');
    assert.ok(botones().includes('Modificar credenciales'));
  });
});

describe('Usuarios: la contraseña al editar (H12)', () => {
  function escribir(input, texto) {
    const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      asignarValue.call(input, texto);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }

  async function editarCuentaDeRamiro(contrasena) {
    logueado = ADRIANA;
    localStorage.setItem('adrimar_usuario', JSON.stringify(ADRIANA));
    await montar(Usuarios, '/usuarios?id=14');
    await act(async () => boton('Modificar credenciales').click());
    if (contrasena !== undefined) escribir(contenedor.querySelector('input[name="contrasena"]'), contrasena);
    await act(async () => boton('Guardar cambios').click());
  }

  test('solo espacios se manda y el error del backend sale en el campo', async () => {
    await editarCuentaDeRamiro('     ');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].datos.contrasena, '     ');
    assert.equal(contenedor.querySelector('#contrasena-error')?.textContent, 'La contraseña no puede tener solo espacios');
  });

  test('vacía no se manda: es no cambiarla', async () => {
    await editarCuentaDeRamiro();
    assert.equal(enviados.length, 1);
    assert.equal('contrasena' in enviados[0].datos, false);
  });
});
