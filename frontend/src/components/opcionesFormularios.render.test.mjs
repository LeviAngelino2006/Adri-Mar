// Tests de las listas de opciones (choferes y vehículos) de ViajeForm y de
// ModalConfirmarViaje cuando no se pueden cargar: un mensaje claro en el campo y
// el formulario sigue usable. Se corren con `npm test` (node:test).
//
// Antes los pedidos no tenían catch: el campo quedaba vacío sin explicación y
// la promesa rechazada quedaba sin manejar. Se montan los componentes con
// react-dom/client sobre jsdom y la API se reemplaza por un doble que falla
// como axios sin red (un Error sin `response`).

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.scrollIntoView = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let api;
let ViajeForm;
let ModalConfirmarViaje;
let contenedor;
let raiz;

const LISTAS = ['/usuarios/disponibles-chofer', '/vehiculos'];
const ERROR_CHOFERES = 'No pudimos cargar la lista de choferes. Revisá tu conexión.';
const ERROR_VEHICULOS = 'No pudimos cargar la lista de vehículos. Revisá tu conexión.';
const enviados = [];

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (LISTAS.includes(endpoint)) throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    if (endpoint.endsWith('/disponibilidad')) return { data: { choferes: [], vehiculos: [] } };
    return { data: { items: [] } };
  };
  api.patch = async (endpoint, datos) => {
    enviados.push({ endpoint, datos });
    return { data: { viaje: { id: 3 } } };
  };
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  ModalConfirmarViaje = (await vite.ssrLoadModule('/src/components/ModalConfirmarViaje.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  enviados.length = 0;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);
const errorDe = (id) => contenedor.querySelector(`#${id}-error`)?.textContent;
const montar = (elemento) => act(async () => raiz.render(elemento));

// Un viaje con lo obligatorio cargado, como llega al editar o duplicar.
const VALORES_COMPLETOS = {
  clienteId: 1, clienteNombre: 'Colegio San José',
  choferId: '', vehiculoId: '', choferesCandidatos: [], vehiculosCandidatos: [], paradas: [],
  origenId: 1, origenNombre: 'Río Tercero', destinoId: 2, destinoNombre: 'Córdoba', origenLugar: null, destinoLugar: null,
  fechaInicio: '2026-10-21T08:00', fechaFin: '', kilometrosEstimados: '', cantidadPasajeros: '',
};

describe('ViajeForm: si no cargan los choferes o los vehículos', () => {
  test('alta: el mensaje va en cada campo y se puede guardar igual', async () => {
    const recibidos = [];
    await montar(
      h(ViajeForm, {
        valoresIniciales: VALORES_COMPLETOS,
        onSubmit: async (datos) => recibidos.push(datos),
        textoBoton: 'Crear viaje',
        textoEnviando: 'Creando…',
      })
    );
    assert.equal(errorDe('choferesCandidatos'), ERROR_CHOFERES);
    assert.equal(errorDe('vehiculosCandidatos'), ERROR_VEHICULOS);
    assert.equal(contenedor.querySelector('#choferesCandidatos').disabled, false);

    await act(async () => boton('Crear viaje').click());
    assert.equal(recibidos.length, 1, 'el formulario sigue usable');
    assert.deepEqual(recibidos[0].choferesCandidatos, []);
  });

  test('edición de un Programado: el mensaje va en los selects de chofer y vehículo', async () => {
    await montar(
      h(ViajeForm, {
        valoresIniciales: { ...VALORES_COMPLETOS, choferId: 5, vehiculoId: 4 },
        estadoActual: 'PROGRAMADO',
        onSubmit: async () => {},
        textoBoton: 'Guardar cambios',
        textoEnviando: 'Guardando…',
      })
    );
    assert.equal(errorDe('choferId'), ERROR_CHOFERES);
    assert.equal(errorDe('vehiculoId'), ERROR_VEHICULOS);
  });
});

const VIAJE_A_CONFIRMAR = {
  id: 3,
  estado: 'A_CONFIRMAR',
  fechaInicio: '2026-10-21T11:00:00.000Z',
  fechaFin: '2026-10-21T15:00:00.000Z',
  kilometrosEstimados: 120,
  origen: { id: 1, nombre: 'Río Tercero' },
  destino: { id: 2, nombre: 'Córdoba' },
  paradas: [],
  choferesCandidatos: [{ id: 5, nombre: 'Martín', apellido: 'Gómez' }],
  vehiculosCandidatos: [{ id: 4, numeroInterno: '12', dominio: 'AE452KD' }],
};

describe('ModalConfirmarViaje: si no cargan los choferes o los vehículos', () => {
  test('el mensaje va en cada bloque y se puede confirmar con los candidatos del viaje', async () => {
    await montar(h(ModalConfirmarViaje, { viaje: VIAJE_A_CONFIRMAR, onCerrar() {}, onExito() {} }));
    assert.equal(errorDe('confirmar-choferId'), ERROR_CHOFERES);
    assert.equal(errorDe('confirmar-vehiculoId'), ERROR_VEHICULOS);

    const [radioChofer] = contenedor.querySelectorAll('input[name="confirmar-choferId"]');
    const [radioVehiculo] = contenedor.querySelectorAll('input[name="confirmar-vehiculoId"]');
    await act(async () => radioChofer.click());
    await act(async () => radioVehiculo.click());
    await act(async () => boton('Confirmar viaje').click());

    assert.equal(enviados.length, 1, 'el modal sigue usable');
    assert.equal(enviados[0].endpoint, '/viajes/3/confirmar');
    assert.equal(String(enviados[0].datos.choferId), '5');
    assert.equal(String(enviados[0].datos.vehiculoId), '4');
  });
});
