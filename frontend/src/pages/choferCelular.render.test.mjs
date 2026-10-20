// Tests de la tanda "el chofer en el celular": el orden y las vistas de Mis
// viajes. Se corren con `npm test` (node:test).
//
// Mismo método que botonComenzarViaje.render.test.mjs: se montan las pantallas
// reales con react-dom/client sobre jsdom y la API se reemplaza por un doble (sin
// red). Las fechas son relativas a "ahora", para que "Ayer" y "Hoy" den bien.

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
let Routes;
let Route;
let useLocation;
let AuthProvider;
const paginas = {};
let contenedor;
let raiz;
// La ubicación actual del router (ver EspiaUbicacion).
const router = { ubicacion: null };

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AHORA = Date.now();
const fecha = (desplazamiento) => new Date(AHORA + desplazamiento).toISOString();

const MARTIN = { id: 5, nombre: 'Martín', apellido: 'Gómez' };
const VEHICULO = { id: 4, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500', kilometraje: 157345 };
const lugar = (id, nombre) => ({ id, nombre });

function viaje(id, estado, destino, inicio) {
  return {
    id, estado, origen: lugar(1, 'Río Tercero'), destino: lugar(id + 100, destino), paradas: [],
    fechaInicio: fecha(inicio), fechaFin: fecha(inicio + 3 * HORA), kilometrosEstimados: 100,
    chofer: MARTIN, choferId: 5, vehiculo: VEHICULO, vehiculoId: 4, cliente: { id: 1, nombre: 'Colegio San José' },
  };
}

// Un chofer con un viaje en curso, uno atrasado de ayer, dos próximos y dos
// anteriores. El backend los manda del más futuro al más viejo.
const EN_CURSO = { ...viaje(1, 'EN_VIAJE', 'Villa General Belgrano', -2 * HORA), horaInicioReal: fecha(-2 * HORA), odometroInicial: 157345 };
const ATRASADO = viaje(2, 'PROGRAMADO', 'Santa Rosa de Calamuchita', -DIA);
const PROXIMO_1 = viaje(3, 'PROGRAMADO', 'Mendoza', 2 * DIA);
const PROXIMO_2 = viaje(4, 'PROGRAMADO', 'Aeropuerto Internacional Ingeniero Taravella', 7 * DIA);
const FINALIZADO = { ...viaje(5, 'FINALIZADO', 'Córdoba', -5 * DIA), horaInicioReal: fecha(-5 * DIA), horaFinReal: fecha(-5 * DIA + 3 * HORA) };
const CANCELADO = viaje(6, 'CANCELADO', 'Villa Carlos Paz', -3 * DIA);
const TODOS = [PROXIMO_2, PROXIMO_1, EN_CURSO, ATRASADO, CANCELADO, FINALIZADO];

let viajesDelChofer;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint, config = {}) => {
    if (endpoint === '/viajes/mis-viajes') {
      const { estado } = config.params ?? {};
      return { data: { viajes: estado ? viajesDelChofer.filter((v) => v.estado === estado) : viajesDelChofer } };
    }
    throw new Error(`endpoint no previsto en el test: ${endpoint}`);
  };
  ({ MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['MisViajes', 'Dashboard']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
});

after(() => vite.close());

beforeEach(() => {
  viajesDelChofer = TODOS;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

const CHOFER = { id: 5, nombre: 'Martín', apellido: 'Gómez', perfil: 'CHOFER', habilitadoParaConducir: true };

// Guarda la ubicación actual del router, para ver el ?tab= de la URL.
function EspiaUbicacion({ alCambiar }) {
  const ubicacion = useLocation();
  React.useEffect(() => alCambiar(ubicacion), [ubicacion, alCambiar]);
  return null;
}
const guardarUbicacion = (ubicacion) => {
  router.ubicacion = ubicacion;
};

async function montar(nombre, ruta) {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(CHOFER));
  const Pagina = paginas[nombre];
  await act(async () => {
    raiz.render(
      h(
        MemoryRouter,
        { initialEntries: [ruta] },
        h(AuthProvider, null, h(EspiaUbicacion, { alCambiar: guardarUbicacion }), h(Routes, null, h(Route, { path: '*', element: h(Pagina) })))
      )
    );
  });
}

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);

// [[título del grupo, [destinos]]] del listado, en el orden de la pantalla.
const grupos = () =>
  [...contenedor.querySelectorAll('.listado-grupo')].map((grupo) => [
    grupo.querySelector('.listado-dia').textContent,
    [...grupo.querySelectorAll('.listado-card')].map((card) => [...card.querySelectorAll('.ruta-viaje-punto')].at(-1).textContent),
  ]);
const destinos = () => grupos().flatMap(([, lista]) => lista);

describe('Mis viajes: Próximos | Anteriores', () => {
  test('Próximos: el viaje en curso arriba de todo y después los Programados en orden ascendente', async () => {
    await montar('MisViajes', '/mis-viajes');
    const [primero, ...resto] = grupos();
    assert.deepEqual(primero, ['En curso', ['Villa General Belgrano']]);
    assert.match(resto[0][0], /^Ayer · /);
    assert.deepEqual(destinos().slice(1), ['Santa Rosa de Calamuchita', 'Mendoza', 'Aeropuerto Internacional Ingeniero Taravella']);
    // Ni Finalizados ni Cancelados.
    assert.ok(!contenedor.textContent.includes('Córdoba') && !contenedor.textContent.includes('Villa Carlos Paz'));
    assert.equal(boton('Próximos').getAttribute('aria-pressed'), 'true');
  });

  test('Anteriores: Finalizados y Cancelados, el más reciente primero, con la vista en la URL', async () => {
    await montar('MisViajes', '/mis-viajes');
    await act(async () => boton('Anteriores').click());
    assert.equal(router.ubicacion.search, '?tab=anteriores');
    assert.deepEqual(destinos(), ['Villa Carlos Paz', 'Córdoba']);
    assert.ok(!grupos().some(([titulo]) => titulo === 'En curso'));
  });

  test('entrar con ?tab=anteriores abre Anteriores', async () => {
    await montar('MisViajes', '/mis-viajes?tab=anteriores');
    assert.equal(boton('Anteriores').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(destinos(), ['Villa Carlos Paz', 'Córdoba']);
  });

  test('Próximos vacío dice "No tenés viajes próximos." y no habla de filtros', async () => {
    viajesDelChofer = [CANCELADO, FINALIZADO];
    await montar('MisViajes', '/mis-viajes');
    assert.equal(contenedor.querySelector('.listado-vacio')?.textContent, 'No tenés viajes próximos.');
  });

  test('con un filtro activo, el vacío lo dice', async () => {
    viajesDelChofer = [PROXIMO_1];
    await montar('MisViajes', '/mis-viajes');
    await act(async () => contenedor.querySelector('.filtros-toggle-btn').click());
    const estado = contenedor.querySelector('select[name="estado"]');
    // Solo los estados de Próximos.
    assert.deepEqual([...estado.options].map((o) => o.textContent), ['Todos', 'Programado', 'En viaje']);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(estado, 'EN_VIAJE');
      estado.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(contenedor.querySelector('.listado-vacio')?.textContent, 'No hay viajes con esos filtros.');
  });
});
