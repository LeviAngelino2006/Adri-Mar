// Tests de los tres estados de carga de los listados (cargando, vacío y error
// con "Reintentar"): Viajes, Flota, Mis viajes, el Dashboard del chofer y los
// paneles del Dashboard de gestión. Se
// corren con `npm test` (node:test).
//
// El bug: un error de red se mostraba como listado vacío ("No se encontraron
// viajes", "No tenés viajes pendientes"). Se montan las pantallas
// reales con react-dom/client sobre jsdom (mismo método que
// selectorBuscarOCrear.render.test.mjs); la API se reemplaza por un doble que
// responde, devuelve una lista vacía o falla como falla axios sin red (sin
// `response`).

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

// El DOM tiene que existir antes de cargar react-dom/client.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom no implementa el scroll; las pantallas vuelven arriba al abrir fichas.
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

// Doble de la API. `modo` decide qué pasa con los listados: 'datos', 'vacio' o
// 'falla' (como axios sin red: un Error sin `response`). `pedidos` cuenta los
// GET por endpoint, para ver que "Reintentar" vuelve a pedir.
let modo;
const pedidos = [];

const VEHICULO = {
  id: 4, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500',
  kilometraje: 157345, estado: 'OPERATIVO', tipoVehiculo: { id: 1, descripcion: 'Colectivo' },
};
const VIAJE = {
  id: 9, estado: 'PROGRAMADO', fechaInicio: '2026-11-20T11:00:00.000Z', fechaFin: '2026-11-20T15:00:00.000Z',
  origen: { id: 1, nombre: 'Río Tercero' }, destino: { id: 2, nombre: 'Mendoza' }, paradas: [],
  chofer: { id: 5, nombre: 'Martín', apellido: 'Gómez' }, choferId: 5, vehiculo: VEHICULO, kilometrosEstimados: 720,
};

function respuestaListado(endpoint) {
  if (modo === 'falla') throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
  const lista = (item) => (modo === 'vacio' ? [] : [item]);
  if (endpoint === '/vehiculos') return { data: { vehiculos: lista(VEHICULO) } };
  if (endpoint === '/viajes' || endpoint === '/viajes/mis-viajes') return { data: { viajes: lista(VIAJE) } };
  if (endpoint === '/documentos/alertas') return { data: { totalAlertas: 0, vencidos: 0, porVencer: 0, documentos: [] } };
  throw new Error(`endpoint no previsto en el test: ${endpoint}`);
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    pedidos.push(endpoint);
    if (endpoint === '/tipos-vehiculo') return { data: { tiposVehiculo: [] } };
    return respuestaListado(endpoint);
  };
  // import() nativo: es la misma instancia que importan las páginas (Vite deja
  // las dependencias de node_modules afuera del SSR).
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['Viajes', 'FlotaVehiculos', 'MisViajes', 'Dashboard']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
});

after(() => vite.close());

beforeEach(() => {
  pedidos.length = 0;
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
  ADMINISTRADOR: { id: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false },
  CHOFER: { id: 5, nombre: 'Martín', apellido: 'Gómez', perfil: 'CHOFER', habilitadoParaConducir: true },
};

// Monta la página con sesión iniciada y espera a que se resuelvan los pedidos.
async function montar(nombre, perfil, ruta) {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(USUARIOS[perfil]));
  await act(async () => {
    raiz.render(h(MemoryRouter, { initialEntries: [ruta] }, h(AuthProvider, null, h(paginas[nombre]))));
  });
}

const texto = () => contenedor.textContent;
const botonReintentar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar');

const CASOS = [
  {
    pantalla: 'Viajes', perfil: 'ADMINISTRADOR', ruta: '/viajes', endpoint: '/viajes',
    vacio: 'No se encontraron viajes', error: 'No pudimos cargar los viajes. Revisá tu conexión.', dato: 'Mendoza',
  },
  {
    pantalla: 'FlotaVehiculos', perfil: 'ADMINISTRADOR', ruta: '/vehiculos', endpoint: '/vehiculos',
    vacio: 'No se encontraron vehículos', error: 'No pudimos cargar los vehículos. Revisá tu conexión.', dato: 'AE452KD',
  },
  {
    pantalla: 'MisViajes', perfil: 'CHOFER', ruta: '/mis-viajes', endpoint: '/viajes/mis-viajes',
    vacio: 'No tenés viajes próximos.', error: 'No pudimos cargar tus viajes. Revisá tu conexión.', dato: 'Mendoza',
  },
  {
    pantalla: 'Dashboard', perfil: 'CHOFER', ruta: '/', endpoint: '/viajes/mis-viajes',
    vacio: 'No tenés viajes pendientes', error: 'No pudimos cargar tus viajes. Revisá tu conexión.', dato: 'Mendoza',
  },
];

for (const caso of CASOS) {
  describe(`${caso.pantalla}: cargando, vacío y error`, () => {
    test('mientras carga no dice que no hay datos ni muestra un error', async () => {
      // Un pedido que no termina: queda en "cargando".
      const original = api.get;
      api.get = (endpoint) => (endpoint === '/tipos-vehiculo' ? original(endpoint) : new Promise(() => {}));
      try {
        await montar(caso.pantalla, caso.perfil, caso.ruta);
        assert.ok(contenedor.querySelector('.carga[role="status"]'), 'falta el contenedor de Cargando');
        assert.ok(!texto().includes(caso.vacio));
        assert.ok(!contenedor.querySelector('[role="alert"]'));
      } finally {
        api.get = original;
      }
    });

    test('sin datos muestra el vacío, sin error', async () => {
      modo = 'vacio';
      await montar(caso.pantalla, caso.perfil, caso.ruta);
      assert.ok(texto().includes(caso.vacio));
      assert.ok(!texto().includes('No pudimos cargar'));
      assert.equal(botonReintentar(), undefined);
    });

    test('con un error de red muestra el error con "Reintentar", nunca el vacío', async () => {
      modo = 'falla';
      await montar(caso.pantalla, caso.perfil, caso.ruta);
      const alerta = contenedor.querySelector('.alert-error[role="alert"]');
      assert.ok(alerta, 'falta el Alert de error');
      assert.ok(alerta.textContent.includes(caso.error));
      assert.ok(botonReintentar());
      assert.ok(!texto().includes(caso.vacio));
    });

    test('"Reintentar" vuelve a pedir y, si ahora responde, muestra los datos', async () => {
      modo = 'falla';
      await montar(caso.pantalla, caso.perfil, caso.ruta);
      const antes = pedidos.filter((e) => e === caso.endpoint).length;

      modo = 'datos';
      await act(async () => botonReintentar().click());

      assert.ok(pedidos.filter((e) => e === caso.endpoint).length > antes, 'no se volvió a pedir');
      assert.ok(!contenedor.querySelector('.alert-error'));
      assert.ok(texto().includes(caso.dato));
    });
  });
}

describe('mensaje de error según la causa', () => {
  test('si el servidor responde con un error no se pide revisar la conexión', async () => {
    const original = api.get;
    api.get = async (endpoint) => {
      if (endpoint === '/vehiculos') throw Object.assign(new Error('Request failed'), { response: { status: 500 } });
      return original(endpoint);
    };
    try {
      await montar('FlotaVehiculos', 'ADMINISTRADOR', '/vehiculos');
      assert.ok(texto().includes('No pudimos cargar los vehículos. Intentá de nuevo en unos minutos.'));
      assert.ok(!texto().includes('Revisá tu conexión'));
    } finally {
      api.get = original;
    }
  });
});

// Los tres paneles del Dashboard de gestión: antes mostraban el error, pero sin
// "Reintentar" (había que recargar la página entera).
describe('Dashboard de gestión: los tres paneles con el backend cortado', () => {
  const ERRORES = [
    'No pudimos cargar los viajes de hoy. Revisá tu conexión.',
    'No pudimos cargar los viajes por confirmar. Revisá tu conexión.',
    'No pudimos cargar las alertas de documentación. Revisá tu conexión.',
  ];
  const VACIOS = ['No hay viajes para hoy', 'Nada pendiente para hoy ni mañana', 'Sin alertas por ahora'];
  const botonesReintentar = () => [...contenedor.querySelectorAll('button')].filter((b) => b.textContent === 'Reintentar');

  test('cada panel muestra su error con "Reintentar", nunca el vacío', async () => {
    modo = 'falla';
    await montar('Dashboard', 'ADMINISTRADOR', '/');
    const alertas = [...contenedor.querySelectorAll('.alert-error[role="alert"]')].map((a) => a.textContent);
    for (const error of ERRORES) assert.ok(alertas.some((a) => a.includes(error)), `falta: ${error}`);
    assert.equal(botonesReintentar().length, 3);
    for (const vacio of VACIOS) assert.ok(!texto().includes(vacio), vacio);
  });

  test('"Reintentar" de cada panel vuelve a pedir solo lo suyo y, si ahora responde, lo muestra', async () => {
    modo = 'falla';
    await montar('Dashboard', 'ADMINISTRADOR', '/');
    modo = 'datos';

    const pedidosViajes = pedidos.filter((e) => e === '/viajes').length;
    await act(async () => botonesReintentar()[0].click());
    assert.equal(pedidos.filter((e) => e === '/viajes').length, pedidosViajes + 2, 'Viajes de hoy hace dos consultas');
    assert.ok(texto().includes('Mendoza'));
    assert.equal(botonesReintentar().length, 2);

    await act(async () => botonesReintentar()[0].click());
    assert.ok(texto().includes('Nada pendiente para hoy ni mañana'));

    const pedidosAlertas = pedidos.filter((e) => e === '/documentos/alertas').length;
    await act(async () => botonesReintentar()[0].click());
    assert.equal(pedidos.filter((e) => e === '/documentos/alertas').length, pedidosAlertas + 1);
    assert.ok(texto().includes('Sin alertas por ahora'));
    assert.equal(botonesReintentar().length, 0);
    assert.ok(!contenedor.querySelector('.alert-error'));
  });
});
