// Tests del select "Tipo de trabajo" de Arreglos con los tipos ya cargados: el
// placeholder "Elegí el tipo de trabajo" no se puede elegir (antes aparecía como
// una opción más de la lista). Se corren con `npm test` (node:test).
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

function elegir(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, valor);
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('Arreglos: "Tipo de trabajo" con los tipos cargados', () => {
  test('"Elegí el tipo de trabajo" se ve al empezar, pero no es una opción elegible', async () => {
    await montar();
    const select = contenedor.querySelector('#arreglo-tipo');
    const [placeholder, ...tipos] = select.options;
    assert.equal(select.value, '');
    assert.equal(placeholder.textContent, 'Elegí el tipo de trabajo');
    assert.equal(placeholder.disabled, true);
    assert.equal(placeholder.hidden, true);
    assert.deepEqual(
      tipos.map((o) => [o.textContent, o.disabled]),
      [
        ['Engrase', false],
        ['Frenos', false],
      ]
    );
  });

  test('después de elegir un tipo, la lista sigue sin ofrecer el placeholder', async () => {
    await montar();
    const select = contenedor.querySelector('#arreglo-tipo');
    await act(async () => elegir(select, '4'));
    assert.equal(select.value, '4');
    const elegibles = [...select.options].filter((o) => !o.disabled && !o.hidden).map((o) => o.textContent);
    assert.deepEqual(elegibles, ['Engrase', 'Frenos']);
  });

  test('Vehículo, también obligatorio, sigue el mismo patrón', async () => {
    await montar();
    const [placeholder] = contenedor.querySelector('#arreglo-vehiculo').options;
    assert.equal(placeholder.textContent, 'Elegí el vehículo');
    assert.equal(placeholder.disabled, true);
    assert.equal(placeholder.hidden, true);
  });
});
