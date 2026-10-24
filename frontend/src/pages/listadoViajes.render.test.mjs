// Tests de la tanda "encontrar viajes": el listado de Viajes con Próximos |
// Anteriores y el buscador por cliente o lugar. Se corren con `npm test`
// (node:test).
//
// Mismo método que choferCelular.render.test.mjs: se monta la pantalla real con
// react-dom/client sobre jsdom y la API se reemplaza por un doble (sin red) que
// guarda los parámetros de cada pedido. El doble responde por vista con listas
// ya ordenadas y marcadas como las manda el backend (el corte y el orden se
// prueban en backend/tests/viajesListado.test.js). Las fechas son relativas a
// "ahora", para que "Ayer" y "Hoy" den bien.

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

function viaje(id, estado, destino, inicio, extra = {}) {
  return {
    id, estado, origen: { id: 1, nombre: 'Río Tercero' }, destino: { id: id + 100, nombre: destino }, paradas: [],
    fechaInicio: fecha(inicio), fechaFin: fecha(inicio + 3 * HORA), kilometrosEstimados: 100,
    chofer: MARTIN, choferId: 5, vehiculo: VEHICULO, vehiculoId: 4, cliente: { id: 1, nombre: 'Colegio San José' },
    pendienteAdministrativo: null,
    ...extra,
  };
}

// Como los manda el backend con vista=proximos: sin cerrar, En viaje y el resto.
const PROGRAMADO_AYER = viaje(1, 'PROGRAMADO', 'Santa Rosa de Calamuchita', -DIA, { sinCerrar: true });
const EN_VIAJE_DESDE_AYER = viaje(2, 'EN_VIAJE', 'Villa General Belgrano', -DIA + HORA, { sinCerrar: true });
const EN_VIAJE_HOY = viaje(3, 'EN_VIAJE', 'Alta Gracia', -HORA, { sinCerrar: false });
const PROGRAMADO_HOY = viaje(4, 'PROGRAMADO', 'Córdoba', 0, { sinCerrar: false });
const PROGRAMADO_SEMANA_QUE_VIENE = viaje(5, 'PROGRAMADO', 'Mendoza', 7 * DIA, { sinCerrar: false });
const PROXIMOS = [PROGRAMADO_AYER, EN_VIAJE_DESDE_AYER, EN_VIAJE_HOY, PROGRAMADO_HOY, PROGRAMADO_SEMANA_QUE_VIENE];
// Con vista=anteriores: el más reciente primero.
const FINALIZADO = viaje(6, 'FINALIZADO', 'Villa Carlos Paz', -8 * DIA);
const CANCELADO = viaje(7, 'CANCELADO', 'Embalse', -15 * DIA);
const ANTERIORES = [FINALIZADO, CANCELADO];

let respuestas;
const pedidos = [];
// Demora de la respuesta según la búsqueda (ms), para ver que una respuesta vieja
// no pisa a una nueva.
let demoraPorBusqueda = {};
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
// La búsqueda del doble: el texto en el cliente o en el destino, sin mayúsculas.
const coincide = (v, q) => [v.cliente?.nombre, v.destino.nombre].some((n) => n?.toLowerCase().includes(q.toLowerCase()));

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint, config = {}) => {
    const params = config.params ?? {};
    pedidos.push({ endpoint, params });
    if (endpoint === '/documentos/alertas') return { data: { totalAlertas: 0, vencidos: 0, porVencer: 0, documentos: [] } };
    if (endpoint !== '/viajes') throw new Error(`endpoint no previsto en el test: ${endpoint}`);
    let lista = params.vista ? respuestas[params.vista] : [...respuestas.proximos, ...respuestas.anteriores];
    if (params.estado) lista = lista.filter((v) => v.estado === params.estado);
    if (params.q) lista = lista.filter((v) => coincide(v, params.q));
    if (demoraPorBusqueda[params.q]) await esperar(demoraPorBusqueda[params.q]);
    return { data: { viajes: lista } };
  };
  ({ MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['Viajes', 'Dashboard']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
});

after(() => vite.close());

beforeEach(() => {
  respuestas = { proximos: PROXIMOS, anteriores: ANTERIORES };
  demoraPorBusqueda = {};
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

const ENCARGADA = { id: 2, personaId: 2, nombre: 'Lucía', apellido: 'Ferreyra', perfil: 'ENCARGADO', habilitadoParaConducir: false };

function EspiaUbicacion({ alCambiar }) {
  const ubicacion = useLocation();
  React.useEffect(() => alCambiar(ubicacion), [ubicacion, alCambiar]);
  return null;
}
const guardarUbicacion = (ubicacion) => {
  router.ubicacion = ubicacion;
};

async function montar(nombre, ruta, usuario = ENCARGADA) {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(usuario));
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

// Los pedidos del listado (el de las opciones de chofer y vehículo va sin vista).
const pedidosDelListado = () => pedidos.filter((p) => p.params.vista);
const ultimoPedido = () => pedidosDelListado().at(-1).params;

async function elegir(nombre, valor) {
  const select = contenedor.querySelector(`select[name="${nombre}"]`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, valor);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

const buscador = () => contenedor.querySelector('input[aria-label="Buscar por cliente o lugar"]');

// Escribe en el buscador como lo haría el usuario (React escucha el evento input).
async function escribir(texto) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(buscador(), texto);
    buscador().dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

// Deja pasar el debounce del buscador (300 ms) y lo que tarde la respuesta.
const dejarPasar = (ms = 350) => act(() => esperar(ms));

const abrirFiltros = () => act(async () => contenedor.querySelector('.filtros-toggle-btn').click());

describe('Viajes: Próximos | Anteriores', () => {
  test('abre en Próximos: pide vista=proximos y muestra Sin cerrar, En curso y después por día', async () => {
    await montar('Viajes', '/viajes');

    assert.equal(ultimoPedido().vista, 'proximos');
    assert.equal(boton('Próximos').getAttribute('aria-pressed'), 'true');
    const [sinCerrar, enCurso, hoy, ...resto] = grupos();
    assert.deepEqual(sinCerrar, ['Sin cerrar', ['Santa Rosa de Calamuchita', 'Villa General Belgrano']]);
    assert.deepEqual(enCurso, ['En curso', ['Alta Gracia']]);
    assert.match(hoy[0], /^Hoy · /);
    assert.deepEqual(hoy[1], ['Córdoba']);
    assert.deepEqual(resto.flatMap(([, d]) => d), ['Mendoza']);
    // El En viaje que empezó ayer aparece una sola vez.
    assert.equal(destinos().filter((d) => d === 'Villa General Belgrano').length, 1);
    // Sin color ni badge para el atraso: las tarjetas sin cerrar tienen solo el badge de estado.
    const tarjetaSinCerrar = contenedor.querySelector('.listado-grupo .listado-card');
    assert.equal(tarjetaSinCerrar.querySelectorAll('.estado-badge').length, 1);
  });

  test('sin viajes sin cerrar ni en curso, no aparecen esos grupos', async () => {
    respuestas.proximos = [PROGRAMADO_HOY, PROGRAMADO_SEMANA_QUE_VIENE];
    await montar('Viajes', '/viajes');
    assert.ok(!grupos().some(([titulo]) => titulo === 'Sin cerrar' || titulo === 'En curso'));
    assert.deepEqual(destinos(), ['Córdoba', 'Mendoza']);
  });

  test('entrar con ?tab=anteriores abre Anteriores y pide vista=anteriores', async () => {
    await montar('Viajes', '/viajes?tab=anteriores');
    assert.equal(ultimoPedido().vista, 'anteriores');
    assert.equal(boton('Anteriores').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(destinos(), ['Villa Carlos Paz', 'Embalse']);
    assert.ok(!grupos().some(([titulo]) => titulo === 'Sin cerrar' || titulo === 'En curso'));
  });

  test('pasar a Anteriores pone la vista en la URL y vuelve a pedir', async () => {
    await montar('Viajes', '/viajes');
    await act(async () => boton('Anteriores').click());
    assert.equal(router.ubicacion.search, '?tab=anteriores');
    assert.equal(ultimoPedido().vista, 'anteriores');
    assert.deepEqual(destinos(), ['Villa Carlos Paz', 'Embalse']);

    await act(async () => boton('Próximos').click());
    assert.equal(router.ubicacion.search, '');
    assert.equal(ultimoPedido().vista, 'proximos');
  });

  test('el filtro de estado ofrece los estados de la vista y se limpia si no es de la nueva', async () => {
    await montar('Viajes', '/viajes');
    await abrirFiltros();
    const opciones = () => [...contenedor.querySelector('select[name="estado"]').options].map((o) => o.textContent);
    assert.deepEqual(opciones(), ['Todos', 'A confirmar', 'Programado', 'En viaje']);

    await elegir('estado', 'PROGRAMADO');
    assert.equal(ultimoPedido().estado, 'PROGRAMADO');
    assert.equal(ultimoPedido().vista, 'proximos');

    await act(async () => boton('Anteriores').click());
    assert.deepEqual(opciones(), ['Todos', 'Finalizado', 'Cancelado']);
    assert.equal(ultimoPedido().vista, 'anteriores');
    assert.equal(ultimoPedido().estado, undefined);
  });
});

describe('Dashboard de gestión: abrir un viaje en el listado', () => {
  // Las filas de Viajes de hoy abren la ficha en Viajes: un Finalizado está en
  // Anteriores, así que se abre esa vista (si no, la ficha no lo encontraría).
  const fila = (destino) => [...contenedor.querySelectorAll('.dashboard-fila')].find((b) => b.textContent.includes(destino));

  test('un Finalizado abre Viajes en Anteriores; un Programado, en Próximos', async () => {
    const finalizadoHoy = { ...FINALIZADO, fechaInicio: fecha(-2 * HORA), fechaFin: fecha(-HORA) };
    respuestas = { proximos: [PROGRAMADO_HOY], anteriores: [finalizadoHoy] };
    await montar('Dashboard', '/');

    await act(async () => fila('Villa Carlos Paz').click());
    assert.equal(router.ubicacion.pathname, '/viajes');
    assert.equal(router.ubicacion.search, '?tab=anteriores');
    assert.deepEqual(router.ubicacion.state, { viajeId: FINALIZADO.id });

    await act(async () => fila('Córdoba').click());
    assert.equal(router.ubicacion.search, '');
    assert.deepEqual(router.ubicacion.state, { viajeId: PROGRAMADO_HOY.id });
  });
});

describe('Viajes: buscador por cliente o lugar', () => {
  test('siempre visible en la barra, fuera del panel de filtros, con el máximo del backend', async () => {
    await montar('Viajes', '/viajes');
    const campo = buscador();
    assert.ok(campo);
    assert.equal(campo.getAttribute('placeholder'), 'Buscar por cliente o lugar');
    assert.equal(campo.maxLength, 100);
    assert.equal(campo.closest('.listado-filtros'), null);
    assert.ok(campo.closest('.listado-toolbar'));
  });

  test('pide con q al dejar de escribir (no en cada tecla), recortado y dentro de la vista', async () => {
    await montar('Viajes', '/viajes');
    const antes = pedidosDelListado().length;
    await escribir('Ali');
    await escribir('Alta Gr');
    await escribir(' Alta Gracia ');
    assert.equal(pedidosDelListado().length, antes, 'no pide mientras se escribe');

    await dejarPasar();
    assert.equal(pedidosDelListado().length, antes + 1);
    assert.deepEqual(ultimoPedido(), { vista: 'proximos', q: 'Alta Gracia' });
    assert.deepEqual(destinos(), ['Alta Gracia']);
  });

  test('borrar la búsqueda (o dejar solo espacios) vuelve a pedir sin q', async () => {
    await montar('Viajes', '/viajes');
    await escribir('Mendoza');
    await dejarPasar();
    assert.deepEqual(destinos(), ['Mendoza']);

    await escribir('   ');
    await dejarPasar();
    assert.deepEqual(ultimoPedido(), { vista: 'proximos' });
    assert.equal(destinos().length, PROXIMOS.length);
  });

  test('una respuesta vieja que llega tarde no pisa a la nueva', async () => {
    demoraPorBusqueda = { Col: 900 };
    await montar('Viajes', '/viajes');
    await escribir('Col');
    await dejarPasar();
    // "Col" sigue esperando su respuesta; ahora se busca "Córdoba", que responde enseguida.
    await escribir('Córdoba');
    await dejarPasar();
    assert.deepEqual(destinos(), ['Córdoba']);

    // Llega la respuesta de "Col" (todos los del Colegio): se descarta.
    await dejarPasar(700);
    assert.deepEqual(destinos(), ['Córdoba']);
    assert.equal(buscador().value, 'Córdoba');
  });
});
