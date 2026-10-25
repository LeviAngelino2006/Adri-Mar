// Test de la pestaña Arreglos montada (react-dom/client sobre jsdom, como
// selectorBuscarOCrear.render.test.mjs): la carga de los tipos y el detalle
// obligatorio de "Otro" al marcarlo y desmarcarlo. La API se reemplaza por un
// doble que no hace pedidos. Se corre con `npm test` (node:test).

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
const { MemoryRouter } = require('react-router-dom');
const h = React.createElement;

const TIPOS = [
  { id: 1, nombre: 'Engrase', descripcion: 'Rodamientos', requiereDetalle: false },
  { id: 8, nombre: 'Otro', descripcion: 'Cualquier otro trabajo', requiereDetalle: true },
];

const VEHICULO = { id: 7, numeroInterno: '12', dominio: 'AE452KD', kilometraje: 1000, marca: 'Mercedes', modelo: 'O500' };

let vite;
let PestanaArreglos;
let api;
let contenedor;
let raiz;
// Resuelve el pedido de tipos pendiente (para ver el estado "cargando").
let responderTipos;
// Bodies que llegan a POST /mantenimientos/arreglos.
const enviados = [];

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  PestanaArreglos = (await vite.ssrLoadModule('/src/components/mantenimiento/PestanaArreglos.jsx')).default;
  ({ DEMORA_KM_MS } = await vite.ssrLoadModule('/src/constants/mantenimiento.js'));
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = () =>
    new Promise((resolver) => {
      responderTipos = () => resolver({ data: { tiposArreglo: TIPOS } });
    });
  api.post = async (_endpoint, body) => {
    enviados.push(body);
    return { data: { registro: { id: 1, vehiculo: { id: body.vehiculoId } } } };
  };
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

function montar() {
  act(() =>
    raiz.render(
      h(
        MemoryRouter,
        null,
        h(PestanaArreglos, {
          cargaVehiculos: { datos: [{ vehiculo: VEHICULO }], cargando: false, error: null, recargar: () => {} },
          vistas: { opciones: [{ valor: 'arreglos', etiqueta: 'Arreglos' }], valor: 'arreglos', onChange: () => {}, ariaLabel: 'Vista' },
          onSuccess: () => {},
        })
      )
    )
  );
}

const grupo = () => contenedor.querySelector('#arreglo-tipos');
const casilla = (id) => contenedor.querySelector(`#arreglo-tipos-${id}`);
const labelDescripcion = () => contenedor.querySelector('label[for="arreglo-descripcion"]');
const campoDetalle = () => contenedor.querySelector('#arreglo-detalle-8');
const errorDetalle = () => contenedor.querySelector('#arreglo-detalle-8-error');
const enviar = () =>
  act(async () => contenedor.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));

// El switch "arreglo anterior" aparece tras el debounce del km.
let DEMORA_KM_MS;
const esperarDemoraKm = () => act(() => new Promise((resolver) => setTimeout(resolver, DEMORA_KM_MS + 50)));

// Escribe como el usuario: React escucha "input"/"change" y lee el value nativo.
function escribir(elemento, valor) {
  const prototipo = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(elemento, valor);
    elemento.dispatchEvent(new window.Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

describe('PestanaArreglos montada', () => {
  test('mientras cargan los tipos dice "Cargando…"; al llegar, una casilla por tipo, solo con el nombre', async () => {
    montar();
    assert.match(grupo().textContent, /Cargando…/);
    await act(async () => responderTipos());
    assert.doesNotMatch(grupo().textContent, /Cargando…/);
    assert.equal(grupo().querySelectorAll('input[type="checkbox"]').length, 2);
    assert.doesNotMatch(grupo().textContent, /Rodamientos|Cualquier otro trabajo/);
  });

  test('"Otro" pide "¿Qué trabajo?" debajo de su casilla; al desmarcarlo se va con su error', async () => {
    montar();
    await act(async () => responderTipos());
    assert.ok(!campoDetalle(), 'sin marcar no hay campo');

    act(() => casilla(8).click());
    assert.ok(campoDetalle(), 'falta el campo "¿Qué trabajo?"');
    assert.match(contenedor.querySelector('label[for="arreglo-detalle-8"]').textContent, /¿Qué trabajo\?/);
    assert.ok(!labelDescripcion().querySelector('.form-field-required'), 'la descripción no es obligatoria');

    await enviar();
    assert.match(errorDetalle().textContent, /"Otro"/);

    act(() => casilla(8).click());
    assert.ok(!campoDetalle(), 'sigue el campo');
    assert.ok(!errorDetalle(), 'sigue el error');
  });

  test('manda el detalle de "Otro" solo si sigue marcado', async () => {
    montar();
    await act(async () => responderTipos());
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    escribir(contenedor.querySelector('#arreglo-km'), '1500');
    act(() => casilla(1).click());
    act(() => casilla(8).click());
    escribir(campoDetalle(), 'Cambio de espejo');

    enviados.length = 0;
    await enviar();
    assert.equal(enviados.length, 1);
    assert.deepEqual(enviados[0].tiposArregloIds, [1, 8]);
    assert.deepEqual(enviados[0].detallesTipos, { 8: 'Cambio de espejo' });

    // Después de registrar el formulario se limpia: se vuelve a cargar sin "Otro".
    act(() => casilla(1).click());
    act(() => casilla(8).click());
    escribir(campoDetalle(), 'Algo');
    act(() => casilla(8).click());
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    escribir(contenedor.querySelector('#arreglo-km'), '1500');
    await enviar();
    assert.equal(enviados.length, 2);
    assert.deepEqual(enviados[1].tiposArregloIds, [1]);
    assert.ok(!enviados[1].detallesTipos?.[8], 'mandó el detalle de un "Otro" desmarcado');
  });

  test('km menor al odómetro: error y switch "arreglo anterior"; marcado, se registra con esAnterior', async () => {
    montar();
    await act(async () => responderTipos());
    const switchAnterior = () => contenedor.querySelector('#arreglo-anterior');
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    escribir(contenedor.querySelector('#arreglo-km'), '1000');
    assert.equal(switchAnterior(), null, 'con el km igual al odómetro no pregunta');
    act(() => casilla(1).click());

    escribir(contenedor.querySelector('#arreglo-km'), '800');
    assert.equal(switchAnterior(), null, 'preguntó mientras se escribía el km');
    await esperarDemoraKm();
    assert.ok(switchAnterior());
    enviados.length = 0;
    await enviar();
    assert.equal(enviados.length, 0);
    assert.match(contenedor.querySelector('#arreglo-km-error').textContent, /Cargá un kilometraje válido/);

    act(() => switchAnterior().click());
    await enviar();
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].kilometraje, 800);
    assert.equal(enviados[0].esAnterior, true);
  });

  test('si el km vuelve a ser mayor, el switch se va y no se manda esAnterior', async () => {
    montar();
    await act(async () => responderTipos());
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    act(() => casilla(1).click());
    escribir(contenedor.querySelector('#arreglo-km'), '800');
    await esperarDemoraKm();
    act(() => contenedor.querySelector('#arreglo-anterior').click());
    escribir(contenedor.querySelector('#arreglo-km'), '1200');
    assert.equal(contenedor.querySelector('#arreglo-anterior'), null);

    enviados.length = 0;
    await enviar();
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].esAnterior, undefined);
  });

  test('con el switch visible, borrar y volver a escribir lo oculta hasta que el km queda quieto', async () => {
    montar();
    await act(async () => responderTipos());
    const switchAnterior = () => contenedor.querySelector('#arreglo-anterior');
    const km = () => contenedor.querySelector('#arreglo-km');
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    escribir(km(), '800');
    await esperarDemoraKm();
    assert.ok(switchAnterior());

    for (const parcial of ['', '5', '50']) {
      escribir(km(), parcial);
      assert.equal(switchAnterior(), null, `apareció mientras se escribía "${parcial}"`);
    }
    await esperarDemoraKm();
    assert.ok(switchAnterior());
  });

  test('si se envía antes de la demora, el error sale y el switch aparece ya', async () => {
    montar();
    await act(async () => responderTipos());
    escribir(contenedor.querySelector('#arreglo-vehiculo'), '7');
    act(() => casilla(1).click());
    escribir(contenedor.querySelector('#arreglo-km'), '800');
    enviados.length = 0;
    await enviar();
    assert.equal(enviados.length, 0);
    assert.ok(contenedor.querySelector('#arreglo-anterior'));
  });
});
