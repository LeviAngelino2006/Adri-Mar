// SCRUM-249: en el formulario de "Datos administrativos", con el pago Pendiente
// la fecha de pago se deshabilita y se limpia (también al pasar de Pagado a
// Pendiente) y no se manda al backend.
// SCRUM-248: la tarjeta de la ficha es solo lectura y "Editar datos
// administrativos" pide la pantalla aparte (FormDatosAdministrativos).
// Se corre con `npm test` (node:test).
//
// Se monta el componente con react-dom/client sobre jsdom y la API se reemplaza
// por un doble.

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

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

const ESTADOS_PAGO = [
  { id: 1, descripcion: 'PENDIENTE' },
  { id: 2, descripcion: 'PAGADO' },
  { id: 3, descripcion: 'PARCIAL' },
];

const VIAJE = {
  id: 40,
  precio: 1000,
  estadoPagoClienteId: 2,
  estadoPagoCliente: ESTADOS_PAGO[1],
  fechaPagoCliente: '2026-10-10T03:00:00.000Z',
  metodoPagoClienteId: null,
  pagoChofer: null,
  estadoPagoChoferId: null,
  fechaPagoChofer: null,
  metodoPagoChoferId: null,
};

let vite;
let DatosAdministrativosViaje;
let FormDatosAdministrativos;
let contenedor;
let raiz;
const enviados = [];
// Respuesta del PATCH; un test la cambia por un error.
let responderPatch;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/estados-pago') return { data: { estadosPago: ESTADOS_PAGO } };
    if (endpoint === '/metodos-pago') return { data: { metodosPago: [{ id: 1, descripcion: 'EFECTIVO' }] } };
    return { data: {} };
  };
  api.patch = async (endpoint, datos) => {
    enviados.push({ endpoint, datos });
    return responderPatch(endpoint, datos);
  };
  DatosAdministrativosViaje = (await vite.ssrLoadModule('/src/components/DatosAdministrativosViaje.jsx')).default;
  FormDatosAdministrativos = (await vite.ssrLoadModule('/src/components/FormDatosAdministrativos.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  enviados.length = 0;
  responderPatch = async (_endpoint, datos) => ({ data: { viaje: { ...VIAJE, ...datos } } });
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

async function montar(componente, props) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  await act(async () => raiz.render(h(componente, props)));
}

// El formulario pide los catálogos al montarse.
const montarYEditar = (viaje, props = {}) =>
  montar(FormDatosAdministrativos, { viaje, onGuardado() {}, onCancelar() {}, ...props });

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);

function elegir(nombre, valor) {
  const select = contenedor.querySelector(`select[name="${nombre}"]`);
  act(() => {
    select.value = valor;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

const campo = (nombre) => contenedor.querySelector(`input[name="${nombre}"]`);
const guardar = () => act(async () => contenedor.querySelector('form').requestSubmit());

describe('Datos administrativos: fecha de pago con el pago Pendiente', () => {
  test('Pagado con fecha: el campo está habilitado y con la fecha', async () => {
    await montarYEditar(VIAJE);
    assert.equal(campo('fechaPagoCliente').disabled, false);
    assert.equal(campo('fechaPagoCliente').value, '2026-10-10');
  });

  test('al pasar de Pagado a Pendiente la fecha se deshabilita, se limpia y se manda null', async () => {
    await montarYEditar(VIAJE);
    elegir('estadoPagoClienteId', '1');

    assert.equal(campo('fechaPagoCliente').disabled, true);
    assert.equal(campo('fechaPagoCliente').value, '');
    assert.match(contenedor.textContent, /Con el pago Pendiente no se carga la fecha de pago/);

    // Volver a Pagado no recupera la fecha: quedó limpia.
    elegir('estadoPagoClienteId', '2');
    assert.equal(campo('fechaPagoCliente').disabled, false);
    assert.equal(campo('fechaPagoCliente').value, '');

    elegir('estadoPagoClienteId', '1');
    await guardar();
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].datos.estadoPagoClienteId, 1);
    assert.equal(enviados[0].datos.fechaPagoCliente, null);
  });

  test('viaje histórico Pendiente con fecha: el campo aparece vacío y deshabilitado y se guarda sin fecha', async () => {
    await montarYEditar({ ...VIAJE, estadoPagoClienteId: 1, estadoPagoCliente: ESTADOS_PAGO[0] });
    assert.equal(campo('fechaPagoCliente').disabled, true);
    assert.equal(campo('fechaPagoCliente').value, '');

    await guardar();
    assert.equal(enviados[0].datos.fechaPagoCliente, null);
  });

  test('el pago al chofer sigue la misma regla', async () => {
    await montarYEditar(VIAJE);
    assert.equal(campo('fechaPagoChofer').disabled, false);
    elegir('estadoPagoChoferId', '1');
    assert.equal(campo('fechaPagoChofer').disabled, true);
  });
});

describe('Datos administrativos de la ficha (solo lectura)', () => {
  test('muestra los datos sin inputs ni selects editables', async () => {
    await montar(DatosAdministrativosViaje, { viaje: VIAJE, onEditar() {} });
    assert.equal(contenedor.querySelectorAll('input, select, textarea, form').length, 0);
    assert.match(contenedor.textContent, /Pagado/);
    assert.match(contenedor.textContent, /No cargado/);
  });

  test('"Editar datos administrativos" llama a onEditar con el viaje y no abre nada en el lugar', async () => {
    const pedidos = [];
    await montar(DatosAdministrativosViaje, { viaje: VIAJE, onEditar: (v) => pedidos.push(v) });
    await act(async () => boton('Editar datos administrativos').click());
    assert.deepEqual(pedidos, [VIAJE]);
    assert.equal(contenedor.querySelectorAll('input, select').length, 0);
  });

  test('el ref llega a la tarjeta (scroll después del alta)', async () => {
    const ref = React.createRef();
    await montar(DatosAdministrativosViaje, { viaje: VIAJE, onEditar() {}, ref });
    assert.equal(ref.current?.getAttribute('aria-label'), 'Datos administrativos');
  });
});

describe('FormDatosAdministrativos: guardar y cancelar', () => {
  test('al guardar entrega el viaje que devolvió el backend', async () => {
    const guardados = [];
    await montarYEditar(VIAJE, { onGuardado: (v) => guardados.push(v) });
    act(() => {
      const precio = campo('precio');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(precio, '2500');
      precio.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await guardar();
    assert.equal(enviados[0].endpoint, `/viajes/${VIAJE.id}/datos-administrativos`);
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].precio, 2500);
  });

  test('Cancelar llama a onCancelar sin mandar nada', async () => {
    let cancelado = 0;
    await montarYEditar(VIAJE, { onCancelar: () => cancelado++ });
    await act(async () => boton('Cancelar').click());
    assert.equal(cancelado, 1);
    assert.equal(enviados.length, 0);
  });

  test('un 404 muestra el error y no llama a onGuardado', async () => {
    responderPatch = async () => {
      throw Object.assign(new Error('404'), { response: { status: 404, data: {} } });
    };
    const guardados = [];
    await montarYEditar(VIAJE, { onGuardado: (v) => guardados.push(v) });
    await guardar();
    assert.equal(guardados.length, 0);
    assert.match(contenedor.textContent, /El viaje ya no existe/);
  });
});
