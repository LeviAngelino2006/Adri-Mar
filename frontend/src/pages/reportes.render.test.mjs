import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/reportes' });
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
let Route;
let Routes;
let useLocation;
let AuthProvider;
let Reportes;
let rangoSemanaActual;
let rangoSemanaAnterior;
let contenedor;
let raiz;

const pedidos = [];
let responderReporte;

function fixtureReporte({ desde = '2026-11-16', hasta = '2026-11-22' } = {}) {
  return {
    periodo: { desde, hasta },
    totales: {
      kmRecorridos: 1620,
      kmEstimadosComparables: 1550,
      kmRealesComparables: 1620,
      desvioKm: 70,
      desvioPorcentaje: 4.5,
      cantidadViajes: 6,
      viajesSinOdometro: 0,
      promedioKmPorViaje: 270,
      vehiculosConViajes: 2,
      vehiculosActivos: 3,
    },
    granularidadTemporal: 'dia',
    serieTemporal: [
      { clave: '2026-11-16', desde: '2026-11-16', hasta: '2026-11-16', kmRecorridos: 0, cantidadViajes: 0 },
      { clave: '2026-11-17', desde: '2026-11-17', hasta: '2026-11-17', kmRecorridos: 420, cantidadViajes: 2 },
      { clave: '2026-11-18', desde: '2026-11-18', hasta: '2026-11-18', kmRecorridos: 250, cantidadViajes: 1 },
      { clave: '2026-11-19', desde: '2026-11-19', hasta: '2026-11-19', kmRecorridos: 950, cantidadViajes: 3 },
      { clave: '2026-11-20', desde: '2026-11-20', hasta: '2026-11-20', kmRecorridos: 0, cantidadViajes: 0 },
      { clave: '2026-11-21', desde: '2026-11-21', hasta: '2026-11-21', kmRecorridos: 0, cantidadViajes: 0 },
      { clave: '2026-11-22', desde: '2026-11-22', hasta: '2026-11-22', kmRecorridos: 0, cantidadViajes: 0 },
    ],
    porTipoVehiculo: [
      { tipoVehiculoId: 1, tipoVehiculo: 'Colectivo', kmRecorridos: 1200, cantidadViajes: 4, vehiculosConViajes: 1, vehiculosActivos: 1, promedioKmPorViaje: 300 },
      { tipoVehiculoId: 2, tipoVehiculo: 'Minibús', kmRecorridos: 420, cantidadViajes: 2, vehiculosConViajes: 1, vehiculosActivos: 1, promedioKmPorViaje: 210 },
      { tipoVehiculoId: 3, tipoVehiculo: 'Combi', kmRecorridos: 0, cantidadViajes: 0, vehiculosConViajes: 0, vehiculosActivos: 1, promedioKmPorViaje: null },
    ],
    vehiculos: [
      {
        vehiculo: {
          id: 1,
          numeroInterno: '12',
          dominio: 'AE452KD',
          marca: 'Mercedes-Benz',
          modelo: 'O500',
          tipoVehiculoId: 1,
          tipoVehiculo: 'Colectivo',
          estado: 'OPERATIVO',
          kilometraje: 157345,
        },
        kmRecorridos: 1200,
        kmEstimadosComparables: 1150,
        cantidadViajes: 4,
        viajesSinOdometro: 0,
        promedioKmPorViaje: 300,
        porcentajeKmTotal: 74.1,
        desvioKm: 50,
        desvioPorcentaje: 4.3,
        viajes: [
          {
            id: 91,
            fechaInicio: '2026-11-19T11:00:00.000Z',
            origen: 'Río Tercero',
            destino: 'Córdoba',
            cliente: 'Colegio Jesús Redentor',
            chofer: 'Ana Pérez',
            kmRealizados: 950,
            kilometrosEstimados: 900,
          },
        ],
      },
      {
        vehiculo: {
          id: 2,
          numeroInterno: '4',
          dominio: 'AA111BB',
          marca: 'Iveco',
          modelo: 'Daily',
          tipoVehiculoId: 2,
          tipoVehiculo: 'Minibús',
          estado: 'EN_TALLER',
          kilometraje: 85000,
        },
        kmRecorridos: 420,
        kmEstimadosComparables: 400,
        cantidadViajes: 2,
        viajesSinOdometro: 0,
        promedioKmPorViaje: 210,
        porcentajeKmTotal: 25.9,
        desvioKm: 20,
        desvioPorcentaje: 5,
        viajes: [],
      },
      {
        vehiculo: {
          id: 3,
          numeroInterno: '7',
          dominio: 'AB333CC',
          marca: 'Renault',
          modelo: 'Master',
          tipoVehiculoId: 3,
          tipoVehiculo: 'Combi',
          estado: 'OPERATIVO',
          kilometraje: 42000,
        },
        kmRecorridos: 0,
        kmEstimadosComparables: 0,
        cantidadViajes: 0,
        viajesSinOdometro: 0,
        promedioKmPorViaje: null,
        porcentajeKmTotal: 0,
        desvioKm: null,
        desvioPorcentaje: null,
        viajes: [],
      },
    ],
  };
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint, config) => {
    if (endpoint === '/reportes/km-por-vehiculo') {
      pedidos.push({ endpoint, params: config?.params });
      return responderReporte(config?.params ?? {});
    }
    return { data: {} };
  };
  ({ MemoryRouter, Route, Routes, useLocation } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  Reportes = (await vite.ssrLoadModule('/src/pages/Reportes.jsx')).default;
  ({ rangoSemanaActual, rangoSemanaAnterior } = await vite.ssrLoadModule('/src/utils/reporteKm.js'));
});

after(() => vite.close());

async function montar(rutaInicial = '/reportes') {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem(
    'adrimar_usuario',
    JSON.stringify({ id: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false })
  );
  await act(async () => {
    function DestinoViajes() {
      const loc = useLocation();
      return h('div', { id: 'destino-viajes' }, `${loc.pathname}${loc.search}#${loc.state?.viajeId ?? ''}`);
    }
    raiz.render(
      h(
        MemoryRouter,
        { initialEntries: [rutaInicial] },
        h(
          AuthProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/reportes', element: h(Reportes) }),
            h(Route, { path: '/viajes', element: h(DestinoViajes) })
          )
        )
      )
    );
  });
}

beforeEach(() => {
  pedidos.length = 0;
  responderReporte = async (params) => ({ data: fixtureReporte(params) });
});

afterEach(() => {
  if (raiz) act(() => raiz.unmount());
  if (contenedor) contenedor.remove();
  localStorage.clear();
});

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const clic = (el) => act(async () => el.click());

function cambiarInputDate(input, valor) {
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  return act(async () => {
    asignarValue.call(input, valor);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

describe('Página Reportes', () => {
  test('carga la semana actual por defecto y muestra totales y tarjetas con .num y .patente', async () => {
    await montar();
    const esperada = rangoSemanaActual();
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].endpoint, '/reportes/km-por-vehiculo');
    assert.deepEqual(pedidos[0].params, esperada);

    assert.ok(contenedor.textContent.includes('1.620 km'));
    assert.ok(contenedor.textContent.includes('2 de 3'));
    assert.equal(contenedor.querySelectorAll('.listado-card').length, 3);
    assert.ok(contenedor.querySelector('.patente')?.textContent.includes('AE452KD'));
    assert.ok(contenedor.querySelectorAll('.num').length > 0);
    const btnAyuda = contenedor.querySelector('.reporte-kpis button[aria-label="Más información"]');
    assert.ok(btnAyuda);
    assert.ok(contenedor.textContent.includes('Compara los km reales del odómetro'));
    assert.equal(contenedor.querySelector('[role="progressbar"]'), null);
    assert.equal(contenedor.textContent.includes('% del total'), false);
    assert.ok(boton('Descargar PDF'));
    assert.equal(boton('Exportar CSV'), undefined);
    assert.equal(boton('Imprimir'), undefined);
  });

  test('cambia de período con Semana pasada, muestra rango y despliega fechas solo en Personalizado', async () => {
    await montar();
    assert.equal(contenedor.querySelector('#reporte-desde'), null);
    assert.equal(contenedor.querySelector('#reporte-hasta'), null);
    assert.ok(contenedor.querySelector('.reporte-periodo-rango')?.textContent.includes('–'));

    await clic(boton('Semana pasada'));
    const anterior = rangoSemanaAnterior();
    assert.equal(pedidos.length, 2);
    assert.deepEqual(pedidos[1].params, anterior);
    assert.equal(contenedor.querySelector('#reporte-desde'), null);
    assert.ok(contenedor.querySelector('.reporte-periodo-rango'));

    await clic(boton('Personalizado'));
    assert.equal(contenedor.querySelector('.reporte-periodo-rango'), null);
    const desdeInput = contenedor.querySelector('#reporte-desde');
    const hastaInput = contenedor.querySelector('#reporte-hasta');
    assert.ok(desdeInput);
    assert.ok(hastaInput);

    // Rango invertido muestra error inline y NO llama al backend
    await cambiarInputDate(desdeInput, '2099-01-10');
    assert.equal(pedidos.length, 2);
    assert.ok(contenedor.textContent.includes('La fecha hasta no puede ser anterior a desde.'));

    // Rango válido dispara nueva consulta y mantiene visibles los inputs en Personalizado
    await cambiarInputDate(hastaInput, '2099-01-15');
    assert.equal(pedidos.length, 3);
    assert.deepEqual(pedidos[2].params, { desde: '2099-01-10', hasta: '2099-01-15' });
    assert.ok(contenedor.querySelector('#reporte-desde'));

    // Volver a un preset predefinido oculta las fechas y restaura el indicador de rango
    await clic(boton('Esta semana'));
    assert.equal(contenedor.querySelector('#reporte-desde'), null);
    assert.equal(contenedor.querySelector('#reporte-hasta'), null);
    assert.ok(contenedor.querySelector('.reporte-periodo-rango'));
  });

  test('abre la ficha centrada del vehículo y permite volver al listado y filtrar sin viajes', async () => {
    await montar();
    await clic(contenedor.querySelector('button.listado-card'));
    assert.equal(contenedor.querySelector('[role="dialog"]'), null);
    assert.equal(contenedor.querySelectorAll('.listado-card').length, 0);
    assert.equal(contenedor.querySelector('[role="progressbar"]'), null);
    assert.equal(contenedor.textContent.includes('Participación del total'), false);
    assert.ok(contenedor.querySelector('h1')?.textContent.includes('Vehículo 12 - AE452KD'));
    assert.ok(contenedor.textContent.includes('Río Tercero → Córdoba'));
    assert.ok(contenedor.textContent.includes('Colegio Jesús Redentor'));
    assert.ok(contenedor.textContent.includes('950 km'));

    await clic(boton('← Volver al reporte'));
    assert.equal(contenedor.querySelectorAll('.listado-card').length, 3);

    // Abrir filtros y desactivar "Mostrar vehículos sin viajes"
    await clic(contenedor.querySelector('.filtros-toggle-btn'));
    const sw = contenedor.querySelector('#reporte-filtro-sin-viajes');
    await clic(sw);
    assert.equal(contenedor.querySelectorAll('.listado-card').length, 2);
  });

  test('al tocar un viaje desde la ficha del vehículo navega a su detalle en /viajes', async () => {
    await montar();
    await clic(contenedor.querySelector('button.listado-card'));
    const btnViaje = contenedor.querySelector('.reporte-viaje-boton');
    assert.ok(btnViaje);
    await clic(btnViaje);
    const destino = contenedor.querySelector('#destino-viajes');
    assert.equal(destino?.textContent, '/viajes?tab=anteriores#91');
  });

  test('ante error de carga muestra ErrorCarga y permite reintentar', async () => {
    let intento = 0;
    responderReporte = async (params) => {
      intento += 1;
      if (intento === 1) throw new Error('fallo');
      return { data: fixtureReporte(params) };
    };

    await montar();
    assert.ok(contenedor.textContent.includes('No pudimos cargar el reporte de kilómetros'));
    await clic(boton('Reintentar'));
    assert.equal(contenedor.querySelectorAll('.listado-card').length, 3);
  });

  test('renderiza los 2 gráficos operativos con líneas guía y eje Y, permite alternar Km/Viajes y los oculta sin viajes', async () => {
    await montar();
    const seccionGraficos = contenedor.querySelector('.reporte-graficos');
    assert.ok(seccionGraficos);
    assert.ok(seccionGraficos.textContent.includes('Km y viajes por tipo de vehículo'));
    assert.ok(seccionGraficos.textContent.includes('Actividad del período'));
    assert.equal(seccionGraficos.textContent.includes('Comparativa por vehículo'), false);

    assert.equal(seccionGraficos.querySelectorAll('.reporte-guia-linea').length, 4);
    assert.deepEqual(
      [...seccionGraficos.querySelectorAll('.reporte-eje-y-etiqueta')].map((el) => el.textContent),
      ['1.500', '1.000', '500', '0']
    );

    // Alternar Km | Viajes en Actividad del período actualiza la escala del eje Y
    const btnViajes = boton('Viajes');
    assert.ok(btnViajes);
    await clic(btnViajes);
    assert.equal(btnViajes.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(
      [...seccionGraficos.querySelectorAll('.reporte-eje-y-etiqueta')].map((el) => el.textContent),
      ['3', '2', '1', '0']
    );

    // Si el período tiene 0 viajes, los gráficos no se muestran
    responderReporte = async (params) => {
      const base = fixtureReporte(params);
      return {
        data: {
          ...base,
          totales: { ...base.totales, kmRecorridos: 0, cantidadViajes: 0, vehiculosConViajes: 0 },
          vehiculos: base.vehiculos.map((v) => ({ ...v, kmRecorridos: 0, cantidadViajes: 0, viajes: [] })),
        },
      };
    };
    await clic(boton('Semana pasada'));
    assert.equal(contenedor.querySelector('.reporte-graficos'), null);
  });
});
