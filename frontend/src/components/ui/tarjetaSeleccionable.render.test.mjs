// Tarjetas seleccionables de choferes y vehículos posibles (SCRUM-251):
// TarjetaSeleccionable, el grupo de selección múltiple (SeleccionTarjetas) y la
// selección única al confirmar (SeleccionCandidato). Se corre con `npm test`.
//
// El marcado se revisa con SSR; los clicks y el teclado, montando con
// react-dom/client sobre un DOM de jsdom (como grupoCasillas.render.test.mjs).

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
const { act, useState } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let TarjetaSeleccionable;
let SeleccionTarjetas;
let SeleccionCandidato;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  TarjetaSeleccionable = (await vite.ssrLoadModule('/src/components/ui/TarjetaSeleccionable.jsx')).default;
  SeleccionTarjetas = (await vite.ssrLoadModule('/src/components/ui/SeleccionTarjetas.jsx')).default;
  SeleccionCandidato = (await vite.ssrLoadModule('/src/components/SeleccionCandidato.jsx')).default;
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

const montar = (elemento) => act(() => raiz.render(elemento));
const ssr = (elemento) => new JSDOM(`<body>${renderToStaticMarkup(elemento)}</body>`).window.document;

const HABILITADO = { texto: 'Habilitado', tono: 'ok' };
const VENCIDA = { texto: 'Licencia vencida', tono: 'error' };

describe('TarjetaSeleccionable: render', () => {
  test('habilitada: un <label> con un checkbox real (visualmente oculto), el título, los detalles y el estado', () => {
    const doc = ssr(
      h(TarjetaSeleccionable, {
        name: 'vehiculos',
        value: 7,
        titulo: 'Interno 12',
        detalles: ['Patente AE452KD', '45 asientos'],
        estado: HABILITADO,
        onChange() {},
      })
    );
    const label = doc.querySelector('label.tarjeta-seleccionable');
    const input = label.querySelector('input');

    assert.ok(label, 'la tarjeta es un <label>');
    assert.equal(input.type, 'checkbox');
    assert.equal(input.className, 'tarjeta-seleccionable-input');
    assert.equal(input.value, '7');
    assert.equal(input.checked, false);
    assert.equal(input.disabled, false);
    assert.equal(label.querySelector('.tarjeta-seleccionable-titulo').textContent, 'Interno 12');
    assert.deepEqual(
      [...label.querySelectorAll('.tarjeta-seleccionable-detalle')].map((d) => d.textContent),
      ['Patente AE452KD', '45 asientos']
    );
    const estado = label.querySelector('.tarjeta-seleccionable-estado');
    assert.equal(estado.textContent, 'Habilitado');
    assert.ok(estado.classList.contains('tarjeta-seleccionable-estado-ok'));
    // El lector de pantalla lee el estado al enfocar el input.
    assert.ok(input.getAttribute('aria-describedby').split(' ').includes(estado.id));
    assert.ok(!label.classList.contains('tarjeta-seleccionable-seleccionada'));
  });

  test('deshabilitada: el input queda disabled y el motivo se ve y se anuncia', () => {
    const doc = ssr(h(TarjetaSeleccionable, { titulo: 'Beto Gómez', estado: VENCIDA, deshabilitada: true, onChange() {} }));
    const label = doc.querySelector('label');
    const input = label.querySelector('input');
    const estado = label.querySelector('.tarjeta-seleccionable-estado');

    assert.ok(label.classList.contains('tarjeta-seleccionable-deshabilitada'));
    assert.equal(input.disabled, true);
    assert.equal(estado.textContent, 'Licencia vencida');
    assert.ok(estado.classList.contains('tarjeta-seleccionable-estado-error'));
    assert.ok(input.getAttribute('aria-describedby').includes(estado.id));
  });

  test('seleccionada: input marcado y la clase de seleccionada (borde y fondo de marca)', () => {
    const doc = ssr(h(TarjetaSeleccionable, { titulo: 'Ana Pérez', estado: HABILITADO, seleccionada: true, onChange() {} }));
    const label = doc.querySelector('label');
    assert.equal(label.querySelector('input').checked, true);
    assert.ok(label.classList.contains('tarjeta-seleccionable-seleccionada'));
  });

  test('tipo radio: un radio real con su name', () => {
    const input = ssr(h(TarjetaSeleccionable, { tipo: 'radio', name: 'chofer', value: 5, titulo: 'Ana', onChange() {} })).querySelector(
      'input'
    );
    assert.equal(input.type, 'radio');
    assert.equal(input.name, 'chofer');
  });

  test('el aviso (informativo) va en la tarjeta y también se anuncia', () => {
    const doc = ssr(h(TarjetaSeleccionable, { titulo: 'Ana', aviso: 'Se superpone con otro viaje programado (08:00–10:00)', onChange() {} }));
    const aviso = doc.querySelector('.tarjeta-seleccionable-aviso');
    assert.equal(aviso.textContent, 'Se superpone con otro viaje programado (08:00–10:00)');
    assert.ok(doc.querySelector('input').getAttribute('aria-describedby').includes(aviso.id));
    assert.equal(doc.querySelector('input').disabled, false, 'un aviso no bloquea');
  });
});

describe('TarjetaSeleccionable: interacción', () => {
  test('un click en la tarjeta (el label) la elige', () => {
    let llamadas = 0;
    montar(h(TarjetaSeleccionable, { titulo: 'Ana', onChange: () => (llamadas += 1) }));
    act(() => contenedor.querySelector('.tarjeta-seleccionable-titulo').click());
    assert.equal(llamadas, 1);
  });

  test('una deshabilitada no se puede elegir: ni con click en la tarjeta ni en el input', () => {
    let llamadas = 0;
    montar(h(TarjetaSeleccionable, { titulo: 'Beto', estado: VENCIDA, deshabilitada: true, onChange: () => (llamadas += 1) }));
    act(() => contenedor.querySelector('label').click());
    act(() => contenedor.querySelector('input').click());
    assert.equal(llamadas, 0);
    assert.equal(contenedor.querySelector('input').checked, false);
  });

  test('una deshabilitada que ya venía elegida se puede quitar (si no, quedaría trabada)', () => {
    let llamadas = 0;
    montar(
      h(TarjetaSeleccionable, { titulo: 'Beto', estado: VENCIDA, deshabilitada: true, seleccionada: true, onChange: () => (llamadas += 1) })
    );
    assert.equal(contenedor.querySelector('input').disabled, false);
    act(() => contenedor.querySelector('label').click());
    assert.equal(llamadas, 1);
  });

  test('el input se puede enfocar con teclado (está en el orden de tabulación)', () => {
    montar(h(TarjetaSeleccionable, { titulo: 'Ana', onChange() {} }));
    const input = contenedor.querySelector('input');
    input.focus();
    assert.equal(document.activeElement, input);
    assert.notEqual(input.tabIndex, -1);
  });
});

// Envoltorio con estado, como lo usa ViajeForm.
function GrupoControlado({ inicial = [], alCambiar, ...props }) {
  const [valor, setValor] = useState(inicial);
  return h(SeleccionTarjetas, {
    ...props,
    valor,
    onChange: (ids) => {
      alCambiar?.(ids);
      setValor(ids);
    },
  });
}

const CHOFERES = [
  { id: 5, titulo: 'Ana Pérez', detalles: [], estado: HABILITADO, deshabilitada: false },
  { id: 6, titulo: 'Beto Gómez', detalles: [], estado: VENCIDA, deshabilitada: true },
  { id: 9, titulo: 'Carla Ruiz', detalles: [], estado: HABILITADO, deshabilitada: false },
];

const tarjetaDe = (titulo) =>
  [...contenedor.querySelectorAll('label.tarjeta-seleccionable')].find(
    (l) => l.querySelector('.tarjeta-seleccionable-titulo').textContent === titulo
  );

describe('SeleccionTarjetas (selección múltiple)', () => {
  test('un fieldset con legend y una tarjeta con checkbox por opción, en una grilla', () => {
    const doc = ssr(h(SeleccionTarjetas, { id: 'choferesCandidatos', legend: 'Choferes posibles', opciones: CHOFERES, valor: [9], onChange() {} }));
    assert.equal(doc.querySelector('fieldset').id, 'choferesCandidatos');
    assert.equal(doc.querySelector('legend').textContent, 'Choferes posibles');
    assert.ok(doc.querySelector('.tarjetas-seleccionables'));
    const inputs = [...doc.querySelectorAll('input')];
    assert.deepEqual(inputs.map((i) => i.type), ['checkbox', 'checkbox', 'checkbox']);
    assert.deepEqual(inputs.map((i) => i.checked), [false, false, true]);
    assert.deepEqual(inputs.map((i) => i.disabled), [false, true, false]);
  });

  test('onChange recibe los ids en el orden en que se eligieron, como el selector de chips', () => {
    const recibidos = [];
    montar(h(GrupoControlado, { id: 'c', legend: 'Choferes', opciones: CHOFERES, alCambiar: (ids) => recibidos.push(ids) }));

    act(() => tarjetaDe('Carla Ruiz').click());
    act(() => tarjetaDe('Ana Pérez').click());
    act(() => tarjetaDe('Carla Ruiz').click());

    assert.deepEqual(recibidos, [[9], [9, 5], [5]]);
  });

  test('la deshabilitada no entra en la selección', () => {
    const recibidos = [];
    montar(h(GrupoControlado, { id: 'c', legend: 'Choferes', opciones: CHOFERES, alCambiar: (ids) => recibidos.push(ids) }));
    act(() => tarjetaDe('Beto Gómez').click());
    assert.deepEqual(recibidos, []);
  });

  test('un id elegido que no está en las opciones no se pierde: tarjeta "#id" elegida', () => {
    const doc = ssr(h(SeleccionTarjetas, { id: 'c', legend: 'Choferes', opciones: CHOFERES, valor: [42], onChange() {} }));
    const ultima = [...doc.querySelectorAll('label')].at(-1);
    assert.equal(ultima.querySelector('.tarjeta-seleccionable-titulo').textContent, '#42');
    assert.equal(ultima.querySelector('input').checked, true);
  });

  test('con error: mensaje con role="alert" y aria-invalid en la primera tarjeta que se puede tocar', () => {
    const opciones = [CHOFERES[1], CHOFERES[0]]; // la primera está deshabilitada
    const doc = ssr(h(SeleccionTarjetas, { id: 'c', legend: 'Choferes', opciones, valor: [], onChange() {}, error: 'No se pudo cargar' }));
    assert.equal(doc.querySelector('[role="alert"]').textContent, 'No se pudo cargar');
    const invalidos = [...doc.querySelectorAll('[aria-invalid="true"]')];
    assert.equal(invalidos.length, 1);
    assert.equal(invalidos[0].value, '5');
  });

  test('los avisos de disponibilidad se muestran, sin repetir el motivo del estado', () => {
    const doc = ssr(
      h(SeleccionTarjetas, {
        id: 'c',
        legend: 'Choferes',
        opciones: CHOFERES,
        valor: [5, 6],
        onChange() {},
        avisos: { 5: 'Se superpone con otro viaje programado (08:00–10:00)', 6: 'Licencia vencida' },
      })
    );
    const avisos = [...doc.querySelectorAll('.tarjeta-seleccionable-aviso')].map((a) => a.textContent);
    assert.deepEqual(avisos, ['Se superpone con otro viaje programado (08:00–10:00)']);
  });

  test('sin opciones muestra el texto de vacío', () => {
    const doc = ssr(h(SeleccionTarjetas, { id: 'c', legend: 'Choferes', opciones: [], valor: [], onChange() {}, textoVacio: 'Cargando choferes…' }));
    assert.equal(doc.querySelector('.seleccion-tarjetas-vacio').textContent, 'Cargando choferes…');
  });
});

describe('SeleccionCandidato (selección única al confirmar)', () => {
  const candidatos = [
    { id: 7, etiqueta: '12 - AE452KD', titulo: 'Interno 12', detalles: ['Patente AE452KD', '45 asientos'] },
    { id: 8, etiqueta: '3 - AB123CD', titulo: 'Interno 3', detalles: ['Patente AB123CD'] },
  ];
  const estados = {
    7: { disponible: true, motivo: null },
    8: { disponible: false, motivo: 'Documentación vencida (VTV)' },
  };
  const props = (extra = {}) => ({
    id: 'confirmar-vehiculoId',
    etiqueta: 'Vehículo',
    placeholder: 'Elegí el vehículo',
    candidatos,
    otros: [],
    estados,
    valor: { opcion: '', otroId: '' },
    onChange() {},
    ...extra,
  });

  test('una tarjeta con radio por candidato, más "Elegir otro…"; la no disponible, deshabilitada con su motivo', () => {
    const doc = ssr(h(SeleccionCandidato, props()));
    const labels = [...doc.querySelectorAll('label.tarjeta-seleccionable')];
    assert.deepEqual(
      labels.map((l) => l.querySelector('.tarjeta-seleccionable-titulo').textContent),
      ['Interno 12', 'Interno 3', 'Elegir otro…']
    );
    assert.ok(labels.every((l) => l.querySelector('input').type === 'radio'));
    assert.ok(labels.every((l) => l.querySelector('input').name === 'confirmar-vehiculoId'));
    assert.equal(labels[0].querySelector('.tarjeta-seleccionable-estado').textContent, 'Habilitado');
    assert.equal(labels[1].querySelector('input').disabled, true);
    assert.equal(labels[1].querySelector('.tarjeta-seleccionable-estado').textContent, 'Documentación vencida (VTV)');
  });

  test('elegir una tarjeta manda lo mismo que el radio de antes: { opcion: id, otroId: "" }', () => {
    const recibidos = [];
    montar(h(SeleccionCandidato, props({ onChange: (v) => recibidos.push(v) })));
    act(() => tarjetaDe('Interno 12').click());
    act(() => tarjetaDe('Interno 3').click()); // deshabilitada: no hace nada
    act(() => tarjetaDe('Elegir otro…').click());
    assert.deepEqual(recibidos, [
      { opcion: '7', otroId: '' },
      { opcion: 'otro', otroId: '' },
    ]);
  });

  test('verificando: cada tarjeta dice "Verificando…" y ninguna se puede elegir', () => {
    const doc = ssr(h(SeleccionCandidato, props({ estados: null, verificando: true })));
    const labels = [...doc.querySelectorAll('label.tarjeta-seleccionable')];
    assert.equal(labels.length, 3);
    assert.ok(labels.every((l) => l.querySelector('input').disabled));
    assert.deepEqual(
      labels.map((l) => l.querySelector('.tarjeta-seleccionable-estado').textContent),
      ['Verificando…', 'Verificando…', 'Verificando…']
    );
    assert.ok(labels.every((l) => l.querySelector('.tarjeta-seleccionable-estado-neutral')));
    assert.equal(doc.querySelector('fieldset').getAttribute('aria-busy'), 'true');
  });

  test('verificando: un click no elige nada', () => {
    const recibidos = [];
    montar(h(SeleccionCandidato, props({ estados: null, verificando: true, onChange: (v) => recibidos.push(v) })));
    act(() => tarjetaDe('Interno 12').click());
    act(() => tarjetaDe('Elegir otro…').click());
    assert.deepEqual(recibidos, []);
  });

  test('verificando y sin candidatos: el select queda deshabilitado', () => {
    const doc = ssr(h(SeleccionCandidato, props({ candidatos: [], estados: null, verificando: true, valor: { opcion: 'otro', otroId: '' } })));
    assert.equal(doc.querySelector('select').disabled, true);
    assert.equal(doc.querySelector('select option').textContent, 'Verificando…');
  });

  test('sin candidatos sigue siendo directamente el select', () => {
    const doc = ssr(h(SeleccionCandidato, props({ candidatos: [], valor: { opcion: 'otro', otroId: '' } })));
    assert.equal(doc.querySelector('.tarjeta-seleccionable'), null);
    assert.ok(doc.querySelector('select'));
  });
});
