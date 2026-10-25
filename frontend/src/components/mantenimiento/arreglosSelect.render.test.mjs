// Tests de los campos obligatorios de Arreglos con los tipos ya cargados: los
// tipos son casillas (no hay un "Elegí el tipo de trabajo" elegible) y el
// placeholder del select de Vehículo no se puede elegir. Se corren con `npm test` (node:test).
//
// Mismo método que opcionesFormularios.render.test.mjs: se monta el componente
// con react-dom/client sobre jsdom y la API se reemplaza por un doble (sin red).

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
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
let PestanaArreglos;
let contenedor;
let raiz;

const TIPOS = [
  { id: 1, nombre: 'Engrase', descripcion: 'Engrase general', requiereDetalle: false },
  { id: 4, nombre: 'Frenos', descripcion: 'Pastillas, discos o cintas', requiereDetalle: false },
];
const VEHICULO = { id: 7, numeroInterno: '12', dominio: 'AB123CD', marca: 'Mercedes-Benz', modelo: 'O500', kilometraje: 339200 };

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/mantenimientos/tipos-arreglo') return { data: { tiposArreglo: TIPOS } };
    throw new Error(`pedido inesperado: ${endpoint}`);
  };
  PestanaArreglos = (await vite.ssrLoadModule('/src/components/mantenimiento/PestanaArreglos.jsx')).default;
});

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

async function montar() {
  await act(async () =>
    raiz.render(
      h(PestanaArreglos, {
        cargaVehiculos: { datos: [{ vehiculo: VEHICULO }], cargando: false, error: null, recargar() {} },
        vistas: { opciones: [{ valor: 'arreglos', etiqueta: 'Arreglos' }], valor: 'arreglos', onChange() {}, ariaLabel: 'Vista' },
        onSuccess() {},
      })
    )
  );
}

describe('Arreglos: "Tipo de trabajo" con los tipos cargados', () => {
  // Desde que un arreglo lleva uno o más tipos, el select de tipo es una
  // checklist: no hay placeholder que se pueda elegir.
  test('los tipos se ven como casillas, sin un "Elegí el tipo de trabajo"', async () => {
    await montar();
    assert.equal(contenedor.querySelector('#arreglo-tipo'), null);
    assert.doesNotMatch(contenedor.innerHTML, /Elegí el tipo de trabajo/);
    const casillas = [...contenedor.querySelectorAll('#arreglo-tipos input[type="checkbox"]')];
    assert.deepEqual(
      casillas.map((c) => [c.closest('label').textContent, c.checked, c.disabled]),
      [
        ['Engrase', false, false],
        ['Frenos', false, false],
      ]
    );
  });

  test('marcar un tipo deja los demás elegibles', async () => {
    await montar();
    await act(async () => contenedor.querySelector('#arreglo-tipos-4').click());
    const casillas = [...contenedor.querySelectorAll('#arreglo-tipos input[type="checkbox"]')];
    assert.deepEqual(
      casillas.map((c) => [c.id, c.checked, c.disabled]),
      [
        ['arreglo-tipos-1', false, false],
        ['arreglo-tipos-4', true, false],
      ]
    );
  });

  test('Vehículo, también obligatorio, sigue el mismo patrón', async () => {
    await montar();
    const [placeholder] = contenedor.querySelector('#arreglo-vehiculo').options;
    assert.equal(placeholder.textContent, 'Elegí el vehículo');
    assert.equal(placeholder.disabled, true);
    assert.equal(placeholder.hidden, true);
  });
});
