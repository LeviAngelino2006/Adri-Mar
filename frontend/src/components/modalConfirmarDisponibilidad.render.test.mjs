// Modal Confirmar viaje mientras se consulta la disponibilidad (SCRUM-251):
// hasta que llega, cada tarjeta dice "Verificando…", no se puede elegir y el
// botón de confirmar queda deshabilitado; si falla, el error con "Reintentar".
// Se corre con `npm test`.
//
// Se monta el ModalConfirmarViaje real con react-dom/client sobre jsdom. No hay
// red: el adapter de axios se reemplaza por uno falso y la respuesta de la
// disponibilidad la decide cada test.

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

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

const VIAJE = {
  id: 30,
  estado: 'A_CONFIRMAR',
  fechaInicio: '2026-12-01T13:00:00.000Z',
  fechaFin: '2026-12-01T17:00:00.000Z',
  kilometrosEstimados: 120,
  choferesCandidatos: [
    { id: 5, nombre: 'Ana', apellido: 'Pérez' },
    { id: 6, nombre: 'Beto', apellido: 'Gómez' },
  ],
  vehiculosCandidatos: [{ id: 7, numeroInterno: '12', dominio: 'AE452KD' }],
};

const DISPONIBILIDAD = {
  choferes: [
    { id: 5, disponible: true, motivo: null },
    { id: 6, disponible: false, motivo: 'Documentación vencida (Licencia de conducir)' },
  ],
  vehiculos: [{ id: 7, disponible: true, motivo: null }],
};

let vite;
let ModalConfirmarViaje;
let contenedor;
let raiz;
// Qué hace el pedido de disponibilidad: () => Promise de la respuesta.
let responderDisponibilidad;
let pedidosDisponibilidad;
let confirmaciones;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.defaults.adapter = async (config) => {
    const respuesta = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.method === 'get' && config.url === '/usuarios/disponibles-chofer') return respuesta({ usuarios: [] });
    if (config.method === 'get' && config.url === '/vehiculos') return respuesta({ vehiculos: [] });
    if (config.method === 'get' && config.url === `/viajes/${VIAJE.id}/disponibilidad`) {
      pedidosDisponibilidad += 1;
      return responderDisponibilidad(respuesta);
    }
    if (config.method === 'patch' && config.url === `/viajes/${VIAJE.id}/confirmar`) {
      confirmaciones.push(JSON.parse(config.data));
      return respuesta({ viaje: { ...VIAJE, estado: 'PROGRAMADO' } });
    }
    throw new Error(`Pedido inesperado en el test: ${config.method} ${config.url}`);
  };
  ModalConfirmarViaje = (await vite.ssrLoadModule('/src/components/ModalConfirmarViaje.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  pedidosDisponibilidad = 0;
  confirmaciones = [];
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

const esperar = () => act(() => new Promise((resolver) => setTimeout(resolver, 0)));

async function montarModal() {
  await act(async () => {
    raiz.render(h(ModalConfirmarViaje, { viaje: VIAJE, onCerrar() {}, onExito() {} }));
  });
  await esperar();
}

const tarjetas = () => [...contenedor.querySelectorAll('label.tarjeta-seleccionable')];
const tarjeta = (titulo) => tarjetas().find((l) => l.querySelector('.tarjeta-seleccionable-titulo').textContent === titulo);
const botonConfirmar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar viaje');
const botonReintentar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar');

describe('Confirmar viaje: mientras se consulta la disponibilidad', () => {
  test('todas las tarjetas dicen "Verificando…", no se pueden elegir y no se puede confirmar', async () => {
    responderDisponibilidad = () => new Promise(() => {}); // nunca contesta
    await montarModal();

    assert.equal(tarjetas().length, 5, 'dos choferes + "Elegir otro…", un vehículo + "Elegir otro…"');
    for (const l of tarjetas()) {
      assert.equal(l.querySelector('input').disabled, true);
      assert.equal(l.querySelector('.tarjeta-seleccionable-estado').textContent, 'Verificando…');
    }
    assert.equal(botonConfirmar().disabled, true);

    await act(async () => tarjeta('Ana Pérez').click());
    assert.equal(tarjeta('Ana Pérez').querySelector('input').checked, false);
    await act(async () => botonConfirmar().click());
    assert.deepEqual(confirmaciones, []);
  });

  test('cuando llega: los disponibles primero y los no disponibles al final, antes de "Elegir otro…"', async () => {
    // Beto (no disponible) viene primero entre los candidatos.
    const viaje = { ...VIAJE, choferesCandidatos: [VIAJE.choferesCandidatos[1], VIAJE.choferesCandidatos[0]] };
    responderDisponibilidad = async (respuesta) => respuesta(DISPONIBILIDAD);
    await act(async () => {
      raiz.render(h(ModalConfirmarViaje, { viaje, onCerrar() {}, onExito() {} }));
    });
    await esperar();

    const choferes = [...contenedor.querySelectorAll('fieldset')][0];
    assert.deepEqual(
      [...choferes.querySelectorAll('.tarjeta-seleccionable-titulo')].map((t) => t.textContent),
      ['Ana Pérez', 'Beto Gómez', 'Elegir otro…']
    );
  });

  test('cuando llega: estados reales, se puede elegir y confirmar', async () => {
    responderDisponibilidad = async (respuesta) => respuesta(DISPONIBILIDAD);
    await montarModal();

    assert.equal(tarjeta('Ana Pérez').querySelector('.tarjeta-seleccionable-estado').textContent, 'Habilitado');
    assert.equal(tarjeta('Ana Pérez').querySelector('input').disabled, false);
    assert.equal(tarjeta('Beto Gómez').querySelector('input').disabled, true);
    assert.equal(
      tarjeta('Beto Gómez').querySelector('.tarjeta-seleccionable-estado').textContent,
      'Documentación vencida (Licencia de conducir)'
    );
    assert.equal(botonConfirmar().disabled, false);
    assert.equal(botonReintentar(), undefined);

    await act(async () => tarjeta('Ana Pérez').click());
    await act(async () => tarjeta('Interno 12').click());
    await act(async () => botonConfirmar().click());
    await esperar();

    assert.equal(confirmaciones.length, 1);
    assert.equal(confirmaciones[0].choferId, '5');
    assert.equal(confirmaciones[0].vehiculoId, '7');
  });

  test('si la consulta falla: el error con "Reintentar", sigue sin poder confirmarse; al reintentar y salir bien, se habilita', async () => {
    responderDisponibilidad = async () => {
      const error = new Error('Network Error');
      error.request = {}; // sin respuesta del servidor
      throw error;
    };
    await montarModal();

    const alerta = contenedor.querySelector('.alert');
    assert.ok(alerta, 'se muestra el error');
    assert.match(alerta.textContent, /No pudimos cargar la disponibilidad de choferes y vehículos/);
    assert.ok(botonReintentar(), 'con el botón Reintentar');
    assert.equal(botonConfirmar().disabled, true);
    assert.ok(tarjetas().every((l) => l.querySelector('input').disabled));

    responderDisponibilidad = async (respuesta) => respuesta(DISPONIBILIDAD);
    await act(async () => botonReintentar().click());
    await esperar();

    assert.equal(pedidosDisponibilidad, 2);
    assert.equal(botonReintentar(), undefined);
    assert.equal(botonConfirmar().disabled, false);
    assert.equal(tarjeta('Ana Pérez').querySelector('input').disabled, false);
  });
});
