// Test de render de SelectorBuscarOCrear (cliente en ViajeForm y PresupuestoForm;
// marca y modelo en FlotaVehiculos). Se corre con `npm test` (node:test).
//
// A diferencia de los otros .render.test.mjs (SSR, solo marcado), acá hace falta
// que corran los efectos y los eventos: el bug era que, con un valor ya elegido,
// escribir encima borraba lo tecleado. Por eso se monta con react-dom/client
// sobre un DOM de jsdom. Vite en modo SSR carga los .jsx y la API se reemplaza
// por un doble que no hace pedidos.

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

// El DOM tiene que existir antes de cargar react-dom/client.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let SelectorBuscarOCrear;
let api;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  SelectorBuscarOCrear = (await vite.ssrLoadModule('/src/components/ui/SelectorBuscarOCrear.jsx')).default;
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  // Sin red: /marcas devuelve dos marcas; cualquier otra búsqueda, una lista vacía.
  api.get = async (endpoint) =>
    endpoint === '/marcas'
      ? { data: { marcas: [{ id: 1, nombre: 'Mercedes-Benz' }, { id: 2, nombre: 'Iveco' }] } }
      : { data: { items: [] } };
});

// Espera a que pase el debounce de la búsqueda y lleguen los resultados.
const esperarBusqueda = () => act(() => new Promise((resolver) => setTimeout(resolver, 400)));

after(() => vite.close());

beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

const montar = (elemento) => act(() => raiz.render(elemento));

// Escribe como lo haría el usuario: React escucha "input" y lee el value nativo.
function escribir(input, texto) {
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    asignarValue.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

const inputs = () => [...contenedor.querySelectorAll('input')];

// Mismo manejo que ViajeForm y PresupuestoForm: elegir guarda id y nombre;
// escribir encima (onSeleccionar(null)) vacía los dos.
function FormCliente({ inicial, alExponer }) {
  const [form, setForm] = React.useState(inicial);
  alExponer?.(setForm);
  return h(SelectorBuscarOCrear, {
    endpoint: '/clientes',
    valor: form.clienteId,
    valorNombre: form.clienteNombre,
    onSeleccionar: (item) => setForm((f) => ({ ...f, clienteId: item?.id || '', clienteNombre: item?.nombre || '' })),
  });
}

// Mismo manejo que FlotaVehiculos: cambiar la marca limpia el modelo, y el
// selector de modelo se vuelve a montar (key) y queda deshabilitado sin marca.
function FormVehiculo({ inicial }) {
  const [form, setForm] = React.useState(inicial);
  return h(
    React.Fragment,
    null,
    h(SelectorBuscarOCrear, {
      endpoint: '/marcas',
      valor: form.marcaId,
      valorNombre: form.marcaNombre,
      onSeleccionar: (item) =>
        setForm((f) => {
          const marcaId = item?.id || '';
          const mismaMarca = marcaId === f.marcaId;
          return {
            ...f,
            marcaId,
            marcaNombre: item?.nombre || '',
            modeloId: mismaMarca ? f.modeloId : '',
            modeloNombre: mismaMarca ? f.modeloNombre : '',
          };
        }),
    }),
    h(SelectorBuscarOCrear, {
      key: form.marcaId || 'sin-marca',
      endpoint: `/marcas/${form.marcaId}/modelos`,
      valor: form.modeloId,
      valorNombre: form.modeloNombre,
      onSeleccionar: (item) => setForm((f) => ({ ...f, modeloId: item?.id || '', modeloNombre: item?.nombre || '' })),
      disabled: !form.marcaId,
    })
  );
}

describe('SelectorBuscarOCrear: escribir sobre un valor elegido', () => {
  test('cliente: lo tecleado encima de la selección no se borra', () => {
    montar(h(FormCliente, { inicial: { clienteId: 7, clienteNombre: 'Escuela Normal' } }));
    const [input] = inputs();
    assert.equal(input.value, 'Escuela Normal');

    escribir(input, 'Escuela Normal S');
    assert.equal(input.value, 'Escuela Normal S');
    escribir(input, 'Escuela Normal Su');
    assert.equal(input.value, 'Escuela Normal Su');
  });

  test('cliente: borrar todo y escribir otro nombre deja lo escrito', () => {
    montar(h(FormCliente, { inicial: { clienteId: 7, clienteNombre: 'Escuela Normal' } }));
    const [input] = inputs();

    escribir(input, 'C');
    assert.equal(input.value, 'C');
    escribir(input, 'Club');
    assert.equal(input.value, 'Club');
  });

  test('una selección que llega desde afuera sigue mostrando su nombre', () => {
    let setForm;
    montar(h(FormCliente, { inicial: { clienteId: '', clienteNombre: '' }, alExponer: (s) => (setForm = s) }));
    const [input] = inputs();
    assert.equal(input.value, '');

    // Ej. el formulario carga un viaje para editar o duplicar.
    act(() => setForm({ clienteId: 3, clienteNombre: 'Municipalidad' }));
    assert.equal(input.value, 'Municipalidad');
    act(() => setForm({ clienteId: 4, clienteNombre: 'Club Atlético' }));
    assert.equal(input.value, 'Club Atlético');
  });

  test('marca y modelo: escribir encima no borra lo tecleado', () => {
    montar(h(FormVehiculo, { inicial: { marcaId: 1, marcaNombre: 'Mercedes-Benz', modeloId: 10, modeloNombre: 'O500' } }));
    const [, modelo] = inputs();

    escribir(modelo, 'O5001');
    assert.equal(inputs()[1].value, 'O5001');

    const [marca] = inputs();
    escribir(marca, 'Mercedes-Benz X');
    assert.equal(inputs()[0].value, 'Mercedes-Benz X');
  });

  test('marca → modelo: cambiar la marca sigue limpiando el modelo', () => {
    montar(h(FormVehiculo, { inicial: { marcaId: 1, marcaNombre: 'Mercedes-Benz', modeloId: 10, modeloNombre: 'O500' } }));
    assert.equal(inputs()[1].value, 'O500');

    escribir(inputs()[0], 'Iveco');
    const [marca, modelo] = inputs();
    assert.equal(marca.value, 'Iveco');
    assert.equal(modelo.value, '');
    assert.equal(modelo.disabled, true);
  });

  test('marca → modelo: elegir otra marca de la lista deja el modelo vacío y habilitado', async () => {
    montar(h(FormVehiculo, { inicial: { marcaId: 1, marcaNombre: 'Mercedes-Benz', modeloId: 10, modeloNombre: 'O500' } }));

    escribir(inputs()[0], 'Ive');
    await esperarBusqueda();
    const opcion = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Iveco');
    act(() => opcion.click());

    const [marca, modelo] = inputs();
    assert.equal(marca.value, 'Iveco');
    assert.equal(modelo.value, '');
    assert.equal(modelo.disabled, false);
  });
});
