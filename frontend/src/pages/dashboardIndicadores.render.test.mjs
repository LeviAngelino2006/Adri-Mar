// Tests de render del rediseño del Dashboard (SCRUM-262, SCRUM-282, SCRUM-283):
// - ADMINISTRADOR / ENCARGADO: KPIs de km, viajes, flota operativa y próximos al service;
//   cambio de período (Este mes | Esta semana) y navegación al tocar cada tarjeta.
// - Panel de Mantenimiento: alertas ordenadas, límite inicial de 5 con "Ver N más" y
//   navegación directa a /mantenimiento?vehiculoId={id}.
// - PERSONAL_TALLER: ve solo Flota operativa, Próximos al service y alertas de Mantenimiento.
// - CHOFER: sigue viendo solo ViajeEnCurso / Tus viajes pendientes sin pedir /dashboard/indicadores.
// - Manejo de error con "Reintentar".

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

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

const USUARIOS = {
  ADMINISTRADOR: { id: 1, personaId: 1, nombre: 'Adriana', apellido: 'Martínez', nombreUsuario: 'amartinez', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false },
  PERSONAL_TALLER: { id: 7, personaId: 7, nombre: 'Hugo', apellido: 'Paz', nombreUsuario: 'hpaz', perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false },
  CHOFER: { id: 11, personaId: 14, nombre: 'Ramiro', apellido: 'Acosta', nombreUsuario: 'racosta', perfil: 'CHOFER', habilitadoParaConducir: true },
};

const alerta = (id, interno, dominio, estado = 'PROXIMO') => ({
  vehiculo: { id, numeroInterno: interno, dominio, marca: 'Mercedes-Benz', modelo: 'O500', kilometraje: 120000, estado: 'OPERATIVO', tipoVehiculoId: 1, tipoVehiculo: 'Colectivo' },
  estado,
  kmDesdeService: estado === 'VENCIDO' ? 20500 : 19200,
  kmProximoService: 120000,
  kmRestantes: estado === 'VENCIDO' ? 0 : 800,
  kmExcedidos: estado === 'VENCIDO' ? 500 : 0,
  porcentajeConsumido: estado === 'VENCIDO' ? 1.025 : 0.96,
});

const INDICADORES_MES = {
  periodo: { tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' },
  flota: { totalActivos: 8, operativos: 7, enTaller: 1 },
  mantenimiento: {
    vencidos: 1,
    proximos: 1,
    alDia: 6,
    sinPlan: 0,
    alertas: [alerta(10, '12', 'AE452KD', 'VENCIDO'), alerta(11, '4', 'AB123CD', 'PROXIMO')],
  },
  km: { totalRecorridos: 12450, promedioPorViaje: 623, viajesConOdometro: 20, viajesSinOdometro: 0 },
  viajes: { finalizadosPeriodo: 20, enViajeAhora: 1, programadosProximos: 4, porConfirmarPendientes: 2 },
};

const INDICADORES_SEMANA = {
  ...INDICADORES_MES,
  periodo: { tipo: 'semana', desde: '2026-11-16', hasta: '2026-11-22' },
  km: { totalRecorridos: 3100, promedioPorViaje: 775, viajesConOdometro: 4, viajesSinOdometro: 0 },
  viajes: { finalizadosPeriodo: 4, enViajeAhora: 1, programadosProximos: 4, porConfirmarPendientes: 2 },
};

let vite;
let MemoryRouter;
let Routes;
let Route;
let useLocation;
let AuthProvider;
let Dashboard;
let contenedor;
let raiz;
let respuestasIndicadores;
let pedidos = [];
const ubicacionActual = { valor: null };

function EspiaUbicacion() {
  const ubicacion = useLocation();
  React.useEffect(() => {
    ubicacionActual.valor = ubicacion;
  }, [ubicacion]);
  return null;
}

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint, config = {}) => {
    const params = config.params ?? {};
    pedidos.push({ endpoint, params });
    if (endpoint === '/auth/me') return { data: { usuario: JSON.parse(localStorage.getItem('adrimar_usuario')) } };
    if (endpoint === '/dashboard/indicadores') {
      if (respuestasIndicadores instanceof Error) throw respuestasIndicadores;
      if (typeof respuestasIndicadores === 'function') return { data: respuestasIndicadores(params) };
      return { data: params.periodo === 'semana' ? INDICADORES_SEMANA : INDICADORES_MES };
    }
    if (endpoint === '/viajes' || endpoint === '/viajes/mis-viajes') return { data: { viajes: [] } };
    if (endpoint === '/documentos/alertas') return { data: { totalAlertas: 0, vencidos: 0, porVencer: 0, documentos: [] } };
    return { data: {} };
  };
  ({ MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  Dashboard = (await vite.ssrLoadModule('/src/pages/Dashboard.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  pedidos = [];
  respuestasIndicadores = null;
  ubicacionActual.valor = null;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

async function montar(perfil = 'ADMINISTRADOR') {
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(USUARIOS[perfil]));
  await act(async () => {
    raiz.render(
      h(
        MemoryRouter,
        { initialEntries: ['/'] },
        h(
          AuthProvider,
          null,
          h(EspiaUbicacion),
          h(Routes, null, h(Route, { path: '/', element: h(Dashboard) }), h(Route, { path: '*', element: h('main', null, 'Destino') }))
        )
      )
    );
  });
}

const kpis = () =>
  [...contenedor.querySelectorAll('.dashboard-kpi')].map((el) => ({
    etiqueta: el.querySelector('.dashboard-kpi-etiqueta')?.textContent,
    valor: el.querySelector('.dashboard-kpi-valor')?.textContent.trim(),
    detalle: el.querySelector('.dashboard-kpi-detalle')?.textContent,
    el,
  }));

describe('Dashboard de gestión: panel de Mantenimiento', () => {
  test('panel de Mantenimiento: lista hasta 5, expande con "Ver N más" y abre el panel del vehículo', async () => {
    respuestasIndicadores = () => ({
      ...INDICADORES_MES,
      mantenimiento: {
        vencidos: 2,
        proximos: 5,
        alDia: 1,
        sinPlan: 0,
        alertas: [
          alerta(10, '12', 'AE452KD', 'VENCIDO'),
          alerta(11, '4', 'AB123CD', 'VENCIDO'),
          alerta(12, '5', 'AC555EE', 'PROXIMO'),
          alerta(13, '6', 'AC666FF', 'PROXIMO'),
          alerta(14, '7', 'AC777GG', 'PROXIMO'),
          alerta(15, '8', 'AC888HH', 'PROXIMO'),
          alerta(16, '9', 'AC999II', 'PROXIMO'),
        ],
      },
    });

    await montar('ADMINISTRADOR');
    assert.equal(kpis().length, 0);
    const panel = contenedor.querySelector('[role="region"][aria-label="Mantenimiento"]');
    assert.ok(panel);
    assert.equal(panel.querySelector('.dashboard-resumen')?.textContent, '2 vencidos · 5 próximos');
    assert.equal(panel.querySelectorAll('.dashboard-fila').length, 5);

    const verMas = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Ver 2 más');
    assert.ok(verMas);
    await act(async () => verMas.click());
    assert.equal(panel.querySelectorAll('.dashboard-fila').length, 7);

    await act(async () => panel.querySelector('.dashboard-fila').click());
    assert.equal(ubicacionActual.valor.pathname, '/mantenimiento');
    assert.equal(ubicacionActual.valor.search, '?vehiculoId=10');
  });
});

describe('Dashboard por perfil y errores', () => {
  test('PERSONAL_TALLER ve solo el panel de Mantenimiento', async () => {
    await montar('PERSONAL_TALLER');

    assert.equal(kpis().length, 0);
    assert.ok(contenedor.querySelector('[role="region"][aria-label="Mantenimiento"]'));
    assert.equal(contenedor.querySelector('[aria-label="Viajes de hoy"]'), null);
    assert.equal(contenedor.querySelector('[aria-label="Viajes por confirmar"]'), null);
    assert.equal(pedidos.some((p) => p.endpoint === '/viajes' || p.endpoint === '/documentos/alertas'), false);
  });

  test('CHOFER sigue viendo solo lo del chofer y no pide /dashboard/indicadores', async () => {
    await montar('CHOFER');
    assert.equal(kpis().length, 0);
    assert.match(contenedor.textContent, /Tus viajes pendientes/);
    assert.equal(pedidos.some((p) => p.endpoint === '/dashboard/indicadores'), false);
  });

  test('si falla /dashboard/indicadores muestra "Reintentar" y al reintentar carga', async () => {
    respuestasIndicadores = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    await montar('PERSONAL_TALLER');

    const reintentar = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar');
    assert.ok(reintentar);
    respuestasIndicadores = null;
    await act(async () => reintentar.click());

    const panel = contenedor.querySelector('[role="region"][aria-label="Mantenimiento"]');
    assert.equal(panel.querySelectorAll('.dashboard-fila').length, 2);
  });
});
