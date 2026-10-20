// Tests de "Guardar" en el modal de actualizar un documento: deshabilitado hasta
// que cambie algo. Se corren con `npm test` (node:test).
//
// El bug: el modal llega con las fechas de la versión vigente y, sin PDF nuevo,
// conserva el actual; apretar "Guardar" sin tocar nada creaba una versión
// idéntica y la purga del historial borraba la más vieja. Se monta el modal con
// react-dom/client sobre jsdom y la API se reemplaza por un doble.

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
const h = React.createElement;

let vite;
let api;
let ModalSubirDocumento;
let hayCambiosEnActualizacion;
let contenedor;
let raiz;
const enviados = [];

const POLIZA = { id: 1, descripcion: 'POLIZA_SEGURO', requiereVencimiento: true, requiereArchivo: true };
const VIGENTE = {
  id: 30, fechaEmision: '2026-03-01T15:00:00.000Z', fechaVencimiento: '2027-03-01T15:00:00.000Z',
  observaciones: null, nombreArchivo: 'poliza.pdf', creadoEn: '2026-03-02T13:00:00.000Z',
};

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.post = async (endpoint, formData) => {
    enviados.push({ endpoint, campos: Object.fromEntries(formData.entries()) });
    return { data: {} };
  };
  ModalSubirDocumento = (await vite.ssrLoadModule('/src/components/documentacion/ModalSubirDocumento.jsx')).default;
  ({ hayCambiosEnActualizacion } = await vite.ssrLoadModule('/src/utils/cambiosDocumento.js'));
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

async function montar(documentoActual) {
  await act(async () => {
    raiz.render(
      h(ModalSubirDocumento, {
        subtitulo: '12 - AE452KD',
        vehiculo: { id: 4 },
        tipoDocumento: POLIZA,
        documentoActual,
        onClose() {},
        onSuccess() {},
      })
    );
  });
}

// React escucha "input" y lee el value nativo.
function escribir(elemento, texto) {
  const prototipo = elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(elemento, texto);
    elemento.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

const guardar = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Guardar');
const PISTA = 'Para guardar una versión nueva, adjuntá un PDF o cambiá una fecha o las observaciones.';

describe('Actualizar un documento', () => {
  test('sin cambios, "Guardar" está deshabilitado y dice qué hace falta', async () => {
    await montar(VIGENTE);
    const boton = guardar();
    assert.equal(boton.disabled, true);
    assert.equal(document.getElementById(boton.getAttribute('aria-describedby'))?.textContent, PISTA);
  });

  test('cambiar las observaciones lo habilita; volver al valor original lo deshabilita otra vez', async () => {
    await montar(VIGENTE);
    const observaciones = document.querySelector('#documento-observaciones');
    escribir(observaciones, 'Renovada');
    assert.equal(guardar().disabled, false);
    assert.ok(!document.body.textContent.includes(PISTA));
    escribir(observaciones, '   ');
    assert.equal(guardar().disabled, true);
  });

  test('cambiar la fecha de vencimiento lo habilita y se guarda', async () => {
    await montar(VIGENTE);
    escribir(document.querySelector('#documento-fecha-vencimiento'), '2028-03-01');
    assert.equal(guardar().disabled, false);
    await act(async () => guardar().click());
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].campos.fechaVencimiento, '2028-03-01');
  });

  test('cargar un documento nuevo (sin versión actual) no depende de cambios', async () => {
    await montar(undefined);
    assert.equal(guardar().disabled, false);
    assert.ok(!document.body.textContent.includes(PISTA));
  });
});

describe('hayCambiosEnActualizacion', () => {
  const sinTocar = { archivo: null, fechaEmision: '2026-03-01', fechaVencimiento: '2027-03-01', observaciones: '' };

  test('con los datos de la vigente no hay cambios (fechas en día de Córdoba)', () => {
    assert.equal(hayCambiosEnActualizacion(VIGENTE, sinTocar, true), false);
  });

  test('un PDF nuevo, una fecha u observaciones distintas son cambios', () => {
    assert.equal(hayCambiosEnActualizacion(VIGENTE, { ...sinTocar, archivo: { name: 'nueva.pdf' } }, true), true);
    assert.equal(hayCambiosEnActualizacion(VIGENTE, { ...sinTocar, fechaEmision: '' }, true), true);
    assert.equal(hayCambiosEnActualizacion(VIGENTE, { ...sinTocar, fechaVencimiento: '2027-04-01' }, true), true);
    assert.equal(hayCambiosEnActualizacion(VIGENTE, { ...sinTocar, observaciones: 'Nueva' }, true), true);
  });

  test('si el tipo no tiene vencimiento, esa fecha no cuenta', () => {
    assert.equal(hayCambiosEnActualizacion(VIGENTE, { ...sinTocar, fechaVencimiento: '' }, false), false);
  });
});
