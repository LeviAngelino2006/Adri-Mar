// Tests de la tanda "encontrar viajes": el listado de Viajes con Próximos |
// Anteriores, el buscador por cliente o lugar, el cliente en la tarjeta, el
// filtro "Cobro", "Limpiar filtros", los estados vacíos y, en el Dashboard de
// gestión, "Viajes de hoy" (solo lo de hoy) y el panel "Sin cerrar". Se corren con `npm test`
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
// Ayer a una hora fija de Córdoba. Córdoba no tiene horario de verano: ahora - 24 h
// siempre es el día anterior, a cualquier hora en que corra el test.
const DIA_CORDOBA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' });
const ayerA = (hhmm) => new Date(`${DIA_CORDOBA.format(AHORA - DIA)}T${hhmm}:00-03:00`).toISOString();

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
const PROGRAMADO_AYER = viaje(1, 'PROGRAMADO', 'Santa Rosa de Calamuchita', -DIA, {
  sinCerrar: true, fechaInicio: ayerA('08:00'), fechaFin: ayerA('11:00'),
});
const EN_VIAJE_DESDE_AYER = viaje(2, 'EN_VIAJE', 'Villa General Belgrano', -DIA, {
  sinCerrar: true, fechaInicio: ayerA('22:00'), fechaFin: ayerA('23:30'),
});
const EN_VIAJE_HOY = viaje(3, 'EN_VIAJE', 'Alta Gracia', -HORA, { sinCerrar: false });
const PROGRAMADO_HOY = viaje(4, 'PROGRAMADO', 'Córdoba', 0, { sinCerrar: false });
const PROGRAMADO_SEMANA_QUE_VIENE = viaje(5, 'PROGRAMADO', 'Mendoza', 7 * DIA, { sinCerrar: false });
const PROXIMOS = [PROGRAMADO_AYER, EN_VIAJE_DESDE_AYER, EN_VIAJE_HOY, PROGRAMADO_HOY, PROGRAMADO_SEMANA_QUE_VIENE];
// Con vista=anteriores: el más reciente primero.
const FINALIZADO = viaje(6, 'FINALIZADO', 'Villa Carlos Paz', -8 * DIA);
const CANCELADO = viaje(7, 'CANCELADO', 'Embalse', -15 * DIA);
const ANTERIORES = [FINALIZADO, CANCELADO];

let respuestas;
// Si está, responde GET /viajes en lugar de `respuestas` (el Dashboard).
let responderViajes = null;
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
    if (endpoint === '/viajes/mis-viajes') return { data: { viajes: PROXIMOS } };
    if (endpoint === '/documentos/alertas') return { data: { totalAlertas: 0, vencidos: 0, porVencer: 0, documentos: [] } };
    if (endpoint !== '/viajes') throw new Error(`endpoint no previsto en el test: ${endpoint}`);
    if (responderViajes) return { data: { viajes: responderViajes(params) } };
    let lista = params.vista ? respuestas[params.vista] : [...respuestas.proximos, ...respuestas.anteriores];
    if (params.estado) lista = lista.filter((v) => v.estado === params.estado);
    if (params.q) lista = lista.filter((v) => coincide(v, params.q));
    if (demoraPorBusqueda[params.q]) await esperar(demoraPorBusqueda[params.q]);
    return { data: { viajes: lista } };
  };
  ({ MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['Viajes', 'MisViajes', 'Dashboard']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
});

after(() => vite.close());

beforeEach(() => {
  respuestas = { proximos: PROXIMOS, anteriores: ANTERIORES };
  demoraPorBusqueda = {};
  responderViajes = null;
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

describe('Cliente en la tarjeta: solo en el listado de gestión', () => {
  const bajadas = () => [...contenedor.querySelectorAll('.listado-card-bajada')].map((b) => b.textContent);

  test('Viajes muestra el cliente en cada tarjeta', async () => {
    await montar('Viajes', '/viajes');
    assert.equal(bajadas().length, PROXIMOS.length);
    assert.ok(bajadas().every((texto) => texto === 'Colegio San José'));
  });

  test('Mis viajes (también para un gestor) no lo muestra', async () => {
    await montar('MisViajes', '/mis-viajes');
    assert.ok(contenedor.querySelectorAll('.listado-card').length > 0);
    assert.deepEqual(bajadas(), []);
  });
});

describe('Filtro "Cobro"', () => {
  test('se llama "Cobro", con "Sin precio o cobro pendiente", y manda el mismo parámetro de siempre', async () => {
    await montar('Viajes', '/viajes');
    await abrirFiltros();
    const campo = contenedor.querySelector('select[name="administrativoPendiente"]');
    assert.equal(contenedor.querySelector('label[for="administrativoPendiente"]').textContent, 'Cobro');
    assert.deepEqual([...campo.options].map((o) => o.textContent), ['Todos', 'Sin precio o cobro pendiente']);
    assert.ok(!contenedor.textContent.includes('Administrativo'));

    await elegir('administrativoPendiente', 'true');
    assert.equal(ultimoPedido().administrativoPendiente, 'true');
  });

  test('Personal de Taller no lo ve', async () => {
    await montar('Viajes', '/viajes', { id: 9, personaId: 30, nombre: 'Raúl', apellido: 'Quiroga', perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false });
    await abrirFiltros();
    assert.equal(contenedor.querySelector('select[name="administrativoPendiente"]'), null);
  });
});

describe('Limpiar filtros y estados vacíos', () => {
  const botonesLimpiar = () => [...contenedor.querySelectorAll('button')].filter((b) => b.textContent === 'Limpiar filtros');
  const enPanel = () => contenedor.querySelector('.listado-filtros .listado-filtros-limpiar');
  const vacio = () => contenedor.querySelector('.listado-vacio');

  test('en el panel, "Limpiar filtros" aparece solo con algún filtro o una búsqueda', async () => {
    await montar('Viajes', '/viajes');
    await abrirFiltros();
    assert.equal(enPanel(), null);

    await elegir('choferId', '5');
    assert.ok(enPanel());
    await elegir('choferId', '');
    assert.equal(enPanel(), null);

    await escribir('Mendoza');
    assert.ok(enPanel(), 'también con solo la búsqueda');
  });

  test('limpia los filtros y la búsqueda de una vez, pero no cambia la vista', async () => {
    await montar('Viajes', '/viajes?tab=anteriores');
    await abrirFiltros();
    await elegir('estado', 'CANCELADO');
    await escribir('Embalse');
    await dejarPasar();
    assert.deepEqual(ultimoPedido(), { vista: 'anteriores', estado: 'CANCELADO', q: 'Embalse' });

    await act(async () => enPanel().click());
    assert.deepEqual(ultimoPedido(), { vista: 'anteriores' });
    assert.equal(buscador().value, '');
    assert.equal(contenedor.querySelector('select[name="estado"]').value, '');
    assert.equal(router.ubicacion.search, '?tab=anteriores');
    assert.equal(boton('Anteriores').getAttribute('aria-pressed'), 'true');
    assert.equal(contenedor.querySelector('.filtros-toggle-badge'), null);
    assert.equal(enPanel(), null);
  });

  test('vacío sin filtros: el texto de cada vista, sin botón', async () => {
    respuestas = { proximos: [], anteriores: [] };
    await montar('Viajes', '/viajes');
    assert.equal(vacio().textContent, 'No hay viajes próximos.');
    assert.equal(botonesLimpiar().length, 0);

    await act(async () => boton('Anteriores').click());
    assert.equal(vacio().textContent, 'No hay viajes anteriores.');
    assert.equal(botonesLimpiar().length, 0);
  });

  test('vacío con un filtro: "No hay viajes con esos filtros." y "Limpiar filtros", que vuelve a la lista', async () => {
    await montar('Viajes', '/viajes');
    await abrirFiltros();
    respuestas = { proximos: [], anteriores: ANTERIORES };
    await elegir('estado', 'A_CONFIRMAR');
    assert.equal(vacio().querySelector('.listado-vacio-texto').textContent, 'No hay viajes con esos filtros.');

    respuestas = { proximos: PROXIMOS, anteriores: ANTERIORES };
    const enElVacio = vacio().querySelector('button');
    assert.equal(enElVacio.textContent, 'Limpiar filtros');
    await act(async () => enElVacio.click());
    assert.deepEqual(ultimoPedido(), { vista: 'proximos' });
    assert.equal(destinos().length, PROXIMOS.length);
  });

  test('vacío con solo una búsqueda: el mismo texto y el mismo botón', async () => {
    await montar('Viajes', '/viajes');
    await escribir('Ushuaia');
    await dejarPasar();
    assert.equal(vacio().querySelector('.listado-vacio-texto').textContent, 'No hay viajes con esos filtros.');
    assert.equal(botonesLimpiar().length, 1);
  });
});

describe('Dashboard de gestión: "Viajes de hoy" y el panel "Sin cerrar"', () => {
  // Responde como el backend: con vista=proximos, los abiertos marcados con
  // sinCerrar; sin vista, los de hoy sin la marca.
  const quitarMarca = (v) => {
    const sinMarca = { ...v };
    delete sinMarca.sinCerrar;
    return sinMarca;
  };
  const A_CONFIRMAR_HOY = viaje(8, 'A_CONFIRMAR', 'Embalse', 2 * HORA, { sinCerrar: false, chofer: null, choferId: null });
  const FINALIZADO_HOY = viaje(9, 'FINALIZADO', 'Villa Carlos Paz', -6 * HORA);
  // Uno viejo SIN la marca: el front no tiene que tratarlo como sin cerrar.
  const VIEJO_SIN_MARCA = viaje(10, 'PROGRAMADO', 'Almafuerte', -3 * DIA, { sinCerrar: false });
  function comoElBackend(params, sinCerrar = [PROGRAMADO_AYER, EN_VIAJE_DESDE_AYER]) {
    const abiertos = [...sinCerrar, EN_VIAJE_HOY, PROGRAMADO_HOY, A_CONFIRMAR_HOY];
    if (params.estado === 'A_CONFIRMAR') return [];
    if (params.vista === 'proximos' && params.estado === 'EN_VIAJE') return abiertos.filter((v) => v.estado === 'EN_VIAJE');
    if (params.vista === 'proximos') return [...abiertos, VIEJO_SIN_MARCA];
    if (params.fechaDesde && params.fechaHasta) {
      return [EN_VIAJE_HOY, PROGRAMADO_HOY, A_CONFIRMAR_HOY, FINALIZADO_HOY].map(quitarMarca);
    }
    return [];
  }
  // N sin cerrar de días anteriores, del más viejo al más nuevo.
  const variosSinCerrar = (cantidad) =>
    Array.from({ length: cantidad }, (_, i) =>
      viaje(100 + i, 'PROGRAMADO', `Destino ${i + 1}`, -(cantidad + 1 - i) * DIA, { sinCerrar: true })
    );

  const panelHoy = () => contenedor.querySelector('[aria-label="Viajes de hoy"]');
  const panelSinCerrar = () => contenedor.querySelector('[role="region"][aria-label="Sin cerrar"]');
  const destinosEn = (seccion) =>
    [...seccion.querySelectorAll('.dashboard-fila')].map((fila) => [...fila.querySelectorAll('.ruta-viaje-punto')].at(-1).textContent);

  test('"Viajes de hoy" muestra solo lo de hoy: sin el grupo "Sin cerrar" ni el En viaje de ayer', async () => {
    responderViajes = comoElBackend;
    await montar('Dashboard', '/');
    assert.equal(panelHoy().querySelector('[aria-label="Sin cerrar"]'), null);
    assert.equal(panelHoy().querySelector('h3, h4'), null);
    assert.deepEqual(destinosEn(panelHoy()), ['Villa Carlos Paz', 'Alta Gracia', 'Córdoba']);
    assert.equal(panelHoy().querySelector('.dashboard-resumen').textContent, '3 viajes · 1 en viaje · 1 finalizado');
  });

  test('panel "Sin cerrar" en la columna derecha, junto a Documentación, con la cantidad y del más viejo al más nuevo', async () => {
    responderViajes = comoElBackend;
    await montar('Dashboard', '/');
    const panel = panelSinCerrar();
    assert.ok(panel, 'aparece el panel');
    assert.equal(panel.querySelector('h2').textContent, 'Sin cerrar');
    assert.equal(panel.querySelector('.dashboard-resumen').textContent, '2 viajes');
    // Misma columna que Documentación, arriba de ella; Viajes por confirmar va en la otra.
    const columna = panel.parentElement;
    assert.ok(columna.classList.contains('dashboard-columna'));
    assert.deepEqual([...columna.querySelectorAll('h2')].map((t) => t.textContent), ['Sin cerrar', 'Documentación']);
    assert.ok(columna.parentElement.classList.contains('dashboard-columnas'));
    // El En viaje de ayer aparece una sola vez en el Dashboard, acá.
    assert.deepEqual(destinosEn(panel), ['Santa Rosa de Calamuchita', 'Villa General Belgrano']);
    // Sin color ni badge para el atraso: un solo badge por fila, el del estado.
    for (const fila of panel.querySelectorAll('.dashboard-fila')) assert.equal(fila.querySelectorAll('.estado-badge').length, 1);
    assert.equal(boton('Ver todos'), undefined);
  });

  test('toma la marca del backend (vista=proximos): un viaje viejo sin la marca no aparece', async () => {
    responderViajes = comoElBackend;
    await montar('Dashboard', '/');
    const pedido = pedidos.find((p) => p.endpoint === '/viajes' && p.params.vista === 'proximos' && !p.params.estado);
    assert.ok(pedido, 'pide vista=proximos');
    assert.ok(!destinosEn(panelSinCerrar()).includes('Almafuerte'));
  });

  test('sin viajes sin cerrar, el panel no aparece', async () => {
    responderViajes = (params) => comoElBackend(params, []);
    await montar('Dashboard', '/');
    assert.equal(panelSinCerrar(), null);
    assert.deepEqual([...contenedor.querySelectorAll('.dashboard-columna h2')].map((t) => t.textContent), ['Documentación']);
  });

  test('con más de 5: las 5 más viejas, el total en el encabezado y "Ver todos" lleva a Viajes (Próximos)', async () => {
    responderViajes = (params) => comoElBackend(params, variosSinCerrar(7));
    await montar('Dashboard', '/');
    assert.equal(panelSinCerrar().querySelector('.dashboard-resumen').textContent, '7 viajes');
    assert.deepEqual(destinosEn(panelSinCerrar()), ['Destino 1', 'Destino 2', 'Destino 3', 'Destino 4', 'Destino 5']);

    await act(async () => boton('Ver todos').click());
    assert.equal(router.ubicacion.pathname, '/viajes');
    assert.equal(router.ubicacion.search, '');
  });

  test('cada fila abre la ficha del viaje', async () => {
    responderViajes = comoElBackend;
    await montar('Dashboard', '/');
    await act(async () => panelSinCerrar().querySelector('.dashboard-fila').click());
    assert.equal(router.ubicacion.pathname, '/viajes');
    assert.equal(router.ubicacion.search, '');
    assert.deepEqual(router.ubicacion.state, { viajeId: PROGRAMADO_AYER.id });
  });

  test('si no se pudo cargar: el error con "Reintentar" en el panel, nunca el panel vacío', async () => {
    let falla = true;
    responderViajes = (params) => {
      if (falla && params.vista === 'proximos' && !params.estado) throw new Error('Network Error');
      return comoElBackend(params);
    };
    await montar('Dashboard', '/');
    const panel = panelSinCerrar();
    assert.match(panel.textContent, /No pudimos cargar los viajes sin cerrar\. Revisá tu conexión\./);
    assert.equal(panel.querySelector('.dashboard-resumen'), null);

    falla = false;
    await act(async () => [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar').click());
    assert.deepEqual(destinosEn(panelSinCerrar()), ['Santa Rosa de Calamuchita', 'Villa General Belgrano']);
  });
});
