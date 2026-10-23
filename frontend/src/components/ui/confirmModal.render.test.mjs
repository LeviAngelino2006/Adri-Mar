// Tests del modal base (ConfirmModal) con encabezado y pie fijos y el cuerpo con
// scroll propio. Se corren con `npm test` (node:test).
//
// El bug: el modal "Confirmar viaje" no entraba ni a 390px ni a 1280 × 800 y los
// botones quedaban abajo, fuera de la vista, sin ninguna señal de que había más.
// jsdom no calcula layout: se verifica la estructura (los botones fuera del cuerpo
// que scrollea) y la señal de "hay más abajo" simulando las medidas del scroll.

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

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let ConfirmModal;
let ModalConfirmarViaje;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ConfirmModal = (await vite.ssrLoadModule('/src/components/ui/ConfirmModal.jsx')).default;
  ModalConfirmarViaje = (await vite.ssrLoadModule('/src/components/ModalConfirmarViaje.jsx')).default;
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

const textoBotones = (el) => [...el.querySelectorAll('button')].map((b) => b.textContent);

// El viaje A confirmar de Confirmar viaje, con candidatos: el caso largo.
const VIAJE_A_CONFIRMAR = {
  id: 227, estado: 'A_CONFIRMAR', origen: { id: 1, nombre: 'Río Tercero' }, destino: { id: 2, nombre: 'Córdoba' },
  paradas: [], cliente: { id: 1, nombre: 'ACME' }, fechaInicio: '2026-10-09T20:30:00.000Z', fechaFin: null,
  kilometrosEstimados: null, cantidadPasajeros: null, chofer: null, vehiculo: null,
  choferesCandidatos: [{ id: 2, nombre: 'Ana', apellido: 'Pérez' }],
  vehiculosCandidatos: [{ id: 87, dominio: 'AE452KD', numeroInterno: '12' }],
};

describe('ConfirmModal: encabezado y pie fijos, cuerpo con scroll', () => {
  test('Confirmar viaje: el título arriba, los campos en el cuerpo y los botones en el pie, fuera del cuerpo', () => {
    contenedor.innerHTML = renderToStaticMarkup(h(ModalConfirmarViaje, { viaje: VIAJE_A_CONFIRMAR, onCerrar() {}, onExito() {} }));
    const modal = contenedor.querySelector('.confirm-modal');
    const hijos = [...modal.children].map((el) => el.className);
    assert.deepEqual(hijos, ['confirm-modal-encabezado', 'confirm-modal-cuerpo', 'confirm-modal-actions']);

    assert.equal(modal.querySelector('.confirm-modal-encabezado h3').textContent, 'Confirmar viaje');
    const cuerpo = modal.querySelector('.confirm-modal-cuerpo > .confirm-modal-description');
    assert.ok(cuerpo.querySelector('input[name="fechaFin"]'), 'los campos van en el cuerpo');
    assert.deepEqual(textoBotones(modal.querySelector('.confirm-modal-actions')), ['Cancelar', 'Confirmar viaje']);
    assert.ok(!textoBotones(cuerpo).includes('Confirmar viaje'), 'el botón no puede quedar dentro del cuerpo que scrollea');
  });

  test('el degradé de "hay más abajo" aparece solo mientras queda contenido por ver', async () => {
    const parrafos = Array.from({ length: 30 }, (_, i) => h('p', { key: i }, `Línea ${i + 1}`));
    await act(async () => {
      raiz.render(
        h(ConfirmModal, {
          open: true, tone: 'brand', title: 'Un modal largo', description: parrafos,
          confirmLabel: 'Guardar', onConfirm() {}, onCancel() {},
        })
      );
    });
    const cuerpo = contenedor.querySelector('.confirm-modal-cuerpo');
    const scroll = contenedor.querySelector('.confirm-modal-description');
    assert.ok(!cuerpo.classList.contains('hay-mas-abajo'), 'sin medidas (todo entra) no hay degradé');

    // 900px de contenido en 400px visibles, arriba de todo.
    const medidas = { scrollHeight: 900, clientHeight: 400, scrollTop: 0 };
    for (const clave of Object.keys(medidas)) {
      Object.defineProperty(scroll, clave, { configurable: true, get: () => medidas[clave] });
    }
    await act(async () => scroll.dispatchEvent(new window.Event('scroll')));
    assert.ok(cuerpo.classList.contains('hay-mas-abajo'), 'con scroll pendiente falta el degradé');

    // Al final del scroll, sin degradé.
    medidas.scrollTop = 500;
    await act(async () => scroll.dispatchEvent(new window.Event('scroll')));
    assert.ok(!cuerpo.classList.contains('hay-mas-abajo'), 'al final del scroll el degradé sobra');

    // Los botones siguen en el pie.
    assert.deepEqual(textoBotones(contenedor.querySelector('.confirm-modal-actions')), ['Cancelar', 'Guardar']);
  });

  test('cerrado no renderiza nada', async () => {
    await act(async () => {
      raiz.render(h(ConfirmModal, { open: false, title: 'x', description: 'y', confirmLabel: 'z', onConfirm() {}, onCancel() {} }));
    });
    assert.equal(contenedor.innerHTML, '');
  });
});
