// Tests de "Comenzar viaje" con y sin otro viaje en curso, en el Dashboard del
// chofer, la ficha de Mis viajes y la ficha de Viajes. Se corren con `npm test`
// (node:test).
//
// El bug: con un viaje En viaje, el chofer veía "Comenzar viaje" habilitado en
// sus otros viajes y recién se enteraba de que no podía después de cargar el
// odómetro (409 del backend). Se montan las pantallas reales con react-dom/client
// sobre jsdom y la API se reemplaza por un doble (sin red).

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
let api;
let MemoryRouter;
let AuthProvider;
const paginas = {};
let contenedor;
let raiz;

const VEHICULO_12 = { id: 4, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500' };
const VEHICULO_2 = { id: 1, numeroInterno: '2', dominio: 'AB123CD', marca: 'Mercedes-Benz', modelo: 'O500' };
const MARTIN = { id: 5, nombre: 'Martín', apellido: 'Gómez' };

const EN_CURSO = {
  id: 20, estado: 'EN_VIAJE', fechaInicio: '2026-10-19T17:00:00.000Z', fechaFin: '2026-10-20T04:00:00.000Z',
  origen: { id: 1, nombre: 'Río Tercero' }, destino: { id: 3, nombre: 'Villa General Belgrano' }, paradas: [],
  chofer: MARTIN, choferId: 5, vehiculo: VEHICULO_12, vehiculoId: 4, horaInicioReal: '2026-10-19T17:05:00.000Z',
};
const PROGRAMADO = {
  id: 21, estado: 'PROGRAMADO', fechaInicio: '2026-10-21T01:00:00.000Z', fechaFin: '2026-10-21T11:00:00.000Z',
  origen: { id: 1, nombre: 'Río Tercero' }, destino: { id: 4, nombre: 'Mendoza' }, paradas: [],
  chofer: MARTIN, choferId: 5, vehiculo: VEHICULO_2, vehiculoId: 1, kilometrosEstimados: 720,
};

// Con `hayEnCurso` el chofer tiene EN_CURSO; sin, solo PROGRAMADO.
let hayEnCurso;
function viajesSegun(params = {}) {
  const todos = hayEnCurso ? [PROGRAMADO, EN_CURSO] : [PROGRAMADO];
  return params.estado ? todos.filter((v) => v.estado === params.estado) : todos;
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint, config = {}) => {
    if (endpoint === '/viajes' || endpoint === '/viajes/mis-viajes') {
      return { data: { viajes: viajesSegun(config.params) } };
    }
    throw new Error(`endpoint no previsto en el test: ${endpoint}`);
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['Viajes', 'MisViajes', 'Dashboard']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
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
  localStorage.clear();
});

const USUARIOS = {
  CHOFER: { id: 5, nombre: 'Martín', apellido: 'Gómez', perfil: 'CHOFER', habilitadoParaConducir: true },
  ADMINISTRADOR: { id: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false },
};

async function montar(nombre, perfil, ruta) {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(USUARIOS[perfil]));
  await act(async () => {
    raiz.render(h(MemoryRouter, { initialEntries: [ruta] }, h(AuthProvider, null, h(paginas[nombre]))));
  });
}

const botones = (texto) => [...contenedor.querySelectorAll('button')].filter((b) => b.textContent === texto);
const MOTIVO = 'Terminá el viaje en curso antes de comenzar otro.';

// Abre la ficha del viaje a Mendoza desde el listado.
async function abrirFichaMendoza() {
  const tarjeta = [...contenedor.querySelectorAll('button.listado-card')].find((b) => b.textContent.includes('Mendoza'));
  await act(async () => tarjeta.click());
}

function assertBloqueado() {
  const [comenzar] = botones('Comenzar viaje');
  assert.ok(comenzar, 'falta "Comenzar viaje"');
  assert.equal(comenzar.disabled, true);
  const motivo = document.getElementById(comenzar.getAttribute('aria-describedby'));
  assert.equal(motivo?.textContent, MOTIVO);
  const ir = contenedor.querySelector('.comenzar-viaje-ir');
  assert.ok(ir.textContent.includes('Villa General Belgrano'), 'el acceso no dice cuál es el viaje en curso');
  return ir;
}

function assertHabilitado() {
  const [comenzar] = botones('Comenzar viaje');
  assert.ok(comenzar, 'falta "Comenzar viaje"');
  assert.equal(comenzar.disabled, false);
  assert.ok(!contenedor.textContent.includes(MOTIVO));
  assert.equal(contenedor.querySelector('.comenzar-viaje-ir'), null);
}

describe('Dashboard del chofer: Tus viajes pendientes', () => {
  test('sin viaje en curso, "Comenzar viaje" está habilitado', async () => {
    hayEnCurso = false;
    await montar('Dashboard', 'CHOFER', '/');
    assertHabilitado();
  });

  test('con un viaje en curso, "Comenzar viaje" está deshabilitado con el motivo y el viaje en curso', async () => {
    hayEnCurso = true;
    await montar('Dashboard', 'CHOFER', '/');
    assertBloqueado();
    // "Finalizar viaje" del viaje en curso sigue disponible.
    assert.equal(botones('Finalizar viaje')[0]?.disabled, false);
  });
});

describe('Mis viajes: ficha de un viaje Programado', () => {
  test('sin viaje en curso, "Comenzar viaje" está habilitado', async () => {
    hayEnCurso = false;
    await montar('MisViajes', 'CHOFER', '/mis-viajes');
    await abrirFichaMendoza();
    assertHabilitado();
  });

  test('con un viaje en curso está deshabilitado y "Ver el viaje en curso" abre su ficha', async () => {
    hayEnCurso = true;
    await montar('MisViajes', 'CHOFER', '/mis-viajes');
    await abrirFichaMendoza();
    const ir = assertBloqueado();

    await act(async () => ir.click());
    assert.ok(botones('Finalizar viaje').length === 1, 'no se abrió la ficha del viaje en curso');
    assert.equal(botones('Comenzar viaje').length, 0);
  });
});

describe('Viajes (gestor): ficha de un viaje Programado', () => {
  test('sin viaje en curso, "Comenzar viaje" está habilitado', async () => {
    hayEnCurso = false;
    await montar('Viajes', 'ADMINISTRADOR', '/viajes');
    await abrirFichaMendoza();
    assertHabilitado();
  });

  test('con el chofer en otro viaje En viaje, está deshabilitado con el motivo', async () => {
    hayEnCurso = true;
    await montar('Viajes', 'ADMINISTRADOR', '/viajes');
    await abrirFichaMendoza();
    assertBloqueado();
  });
});
