// Choferes y vehículos posibles en el formulario de viaje (SCRUM-251): con las
// tarjetas, guardar sigue enviando lo mismo que con el selector de chips
// (choferesCandidatos / vehiculosCandidatos como listas de ids, en el orden en
// que se eligieron, y nada de choferId / vehiculoId). Se corre con `npm test`.
//
// Se monta el ViajeForm real con react-dom/client sobre jsdom. No hay red: el
// adapter de axios se reemplaza por uno que contesta las listas de choferes y
// vehículos, y cualquier otro pedido hace fallar el test.

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
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

// Choferes elegibles: Beto tiene la licencia vencida (disponible: false).
const CHOFERES = [
  { id: 5, nombre: 'Ana', apellido: 'Pérez' },
  { id: 6, nombre: 'Beto', apellido: 'Gómez', disponible: false, motivo: 'Documentación vencida (Licencia de conducir)' },
  { id: 9, nombre: 'Carla', apellido: 'Ruiz' },
];
const VEHICULOS = [
  { id: 7, numeroInterno: '12', dominio: 'AE452KD', asientos: 45, disponible: true, motivo: null },
  { id: 8, numeroInterno: '3', dominio: 'AB123CD', asientos: 19, disponible: false, motivo: 'Documentación vencida (VTV)' },
];

let vite;
let ViajeForm;
let viajeAValoresForm;
let contenedor;
let raiz;
let pedidosInesperados;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.defaults.adapter = async (config) => {
    const respuesta = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.method === 'get' && config.url === '/usuarios/disponibles-chofer') return respuesta({ usuarios: CHOFERES });
    if (config.method === 'get' && config.url === '/vehiculos') return respuesta({ vehiculos: VEHICULOS });
    // La consulta de avisos de disponibilidad (solo lectura): sin avisos.
    if (config.method === 'post' && config.url === '/viajes/disponibilidad') return respuesta({ choferes: [], vehiculos: [] });
    pedidosInesperados.push(`${config.method} ${config.url}`);
    throw new Error(`Pedido inesperado en el test: ${config.method} ${config.url}`);
  };
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  ({ viajeAValoresForm } = await vite.ssrLoadModule('/src/utils/valoresFormViaje.js'));
});

after(() => vite.close());

beforeEach(() => {
  pedidosInesperados = [];
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  assert.deepEqual(pedidosInesperados, []);
});

const VALORES_ALTA = {
  clienteId: 1,
  clienteNombre: 'ACME',
  choferId: '',
  vehiculoId: '',
  choferesCandidatos: [],
  vehiculosCandidatos: [],
  paradas: [],
  origenId: 1,
  origenNombre: 'Río Tercero',
  destinoId: 2,
  destinoNombre: 'Córdoba',
  fechaInicio: '2026-12-01T10:00', // obligatoria siempre
  fechaFin: '',
  kilometrosEstimados: '',
  cantidadPasajeros: '',
};

// Deja correr los efectos y las promesas del adapter falso.
const esperar = () => act(() => new Promise((resolver) => setTimeout(resolver, 0)));

async function montarForm(props) {
  const enviados = [];
  await act(async () => {
    raiz.render(
      h(ViajeForm, {
        onSubmit: async (payload) => enviados.push(payload),
        textoBoton: 'Guardar',
        textoEnviando: 'Guardando…',
        ...props,
      })
    );
  });
  await esperar();
  return enviados;
}

const tarjeta = (grupo, titulo) =>
  [...contenedor.querySelectorAll(`#${grupo} label.tarjeta-seleccionable`)].find(
    (l) => l.querySelector('.tarjeta-seleccionable-titulo').textContent === titulo
  );

async function guardar() {
  await act(async () => {
    contenedor.querySelector('form').requestSubmit();
  });
  await esperar();
}

describe('ViajeForm: choferes y vehículos posibles como tarjetas', () => {
  test('se muestran como tarjetas con checkbox: los vencidos, deshabilitados con su motivo', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });

    const choferes = [...contenedor.querySelectorAll('#choferesCandidatos label.tarjeta-seleccionable')];
    assert.deepEqual(
      choferes.map((l) => l.querySelector('.tarjeta-seleccionable-titulo').textContent),
      ['Ana Pérez', 'Beto Gómez', 'Carla Ruiz']
    );
    assert.ok(choferes.every((l) => l.querySelector('input').type === 'checkbox'));
    assert.equal(tarjeta('choferesCandidatos', 'Beto Gómez').querySelector('input').disabled, true);
    assert.equal(
      tarjeta('choferesCandidatos', 'Beto Gómez').querySelector('.tarjeta-seleccionable-estado').textContent,
      'Documentación vencida (Licencia de conducir)'
    );

    const interno12 = tarjeta('vehiculosCandidatos', 'Interno 12');
    assert.deepEqual(
      [...interno12.querySelectorAll('.tarjeta-seleccionable-detalle')].map((d) => d.textContent),
      ['Patente AE452KD', '45 asientos']
    );
    assert.equal(interno12.querySelector('.tarjeta-seleccionable-estado').textContent, 'Habilitado');
    assert.equal(tarjeta('vehiculosCandidatos', 'Interno 3').querySelector('input').disabled, true);
  });

  test('alta: guardar envía los ids elegidos, en el orden en que se eligieron, sin choferId ni vehiculoId', async () => {
    const enviados = await montarForm({ valoresIniciales: VALORES_ALTA });

    await act(async () => tarjeta('choferesCandidatos', 'Carla Ruiz').click());
    await act(async () => tarjeta('choferesCandidatos', 'Beto Gómez').click()); // vencido: no entra
    await act(async () => tarjeta('choferesCandidatos', 'Ana Pérez').click());
    await act(async () => tarjeta('vehiculosCandidatos', 'Interno 12').click());
    await act(async () => tarjeta('vehiculosCandidatos', 'Interno 3').click()); // vencido: no entra
    await guardar();

    assert.equal(enviados.length, 1);
    assert.deepEqual(enviados[0].choferesCandidatos, [9, 5]);
    assert.deepEqual(enviados[0].vehiculosCandidatos, [7]);
    assert.ok(!('choferId' in enviados[0]));
    assert.ok(!('vehiculoId' in enviados[0]));
  });

  test('alta sin elegir ninguno: listas vacías, como antes (son opcionales)', async () => {
    const enviados = await montarForm({ valoresIniciales: VALORES_ALTA });
    await guardar();
    assert.deepEqual(enviados[0].choferesCandidatos, []);
    assert.deepEqual(enviados[0].vehiculosCandidatos, []);
  });

  test('edición de un A confirmar: los candidatos guardados vienen marcados y se reenvían iguales; quitar uno lo saca', async () => {
    const viaje = {
      id: 30,
      estado: 'A_CONFIRMAR',
      clienteId: 1,
      cliente: { nombre: 'ACME' },
      origenId: 1,
      origen: { id: 1, nombre: 'Río Tercero' },
      destinoId: 2,
      destino: { id: 2, nombre: 'Córdoba' },
      paradas: [],
      fechaInicio: '2026-12-01T13:00:00.000Z',
      fechaFin: null,
      // Lucas ya no figura entre los elegibles (p. ej. dado de baja): su tarjeta no desaparece.
      choferesCandidatos: [
        { id: 5, nombre: 'Ana', apellido: 'Pérez' },
        { id: 11, nombre: 'Lucas', apellido: 'Díaz' },
      ],
      vehiculosCandidatos: [{ id: 7, numeroInterno: '12', dominio: 'AE452KD' }],
    };
    const enviados = await montarForm({
      valoresIniciales: viajeAValoresForm(viaje),
      estadoActual: 'A_CONFIRMAR',
      candidatosActuales: { choferes: viaje.choferesCandidatos, vehiculos: viaje.vehiculosCandidatos },
    });

    assert.equal(tarjeta('choferesCandidatos', 'Ana Pérez').querySelector('input').checked, true);
    assert.equal(tarjeta('choferesCandidatos', 'Lucas Díaz').querySelector('input').checked, true);
    assert.equal(tarjeta('vehiculosCandidatos', 'Interno 12').querySelector('input').checked, true);

    await guardar();
    assert.deepEqual(enviados[0].choferesCandidatos, [5, 11]);
    assert.deepEqual(enviados[0].vehiculosCandidatos, [7]);

    await act(async () => tarjeta('choferesCandidatos', 'Ana Pérez').click());
    await guardar();
    assert.deepEqual(enviados[1].choferesCandidatos, [11]);
  });
});
