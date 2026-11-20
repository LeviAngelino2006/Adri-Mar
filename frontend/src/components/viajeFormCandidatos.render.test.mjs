// Choferes y vehículos posibles en el formulario de viaje (SCRUM-251): el
// buscador de siempre (SelectorMultiple) con los elegidos como cuadraditos.
// Buscar y agregar, quitar con la X, los deshabilitados por documentación, el
// orden de los resultados y que guardar envíe lo mismo de siempre
// (choferesCandidatos / vehiculosCandidatos como listas de ids, en el orden en
// que se eligieron). Se corre con `npm test`.
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

// --- El buscador (SelectorMultiple) ------------------------------------------

const campo = (grupo) => contenedor.querySelector(`#${grupo}`);
const selector = (grupo) => campo(grupo).closest('.selector-multiple');

// Escribe en el buscador como lo haría el usuario (React escucha el evento input).
async function escribir(grupo, texto) {
  const input = campo(grupo);
  const asignar = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    input.click(); // abre la lista
    asignar.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function abrirLista(grupo) {
  await act(async () => campo(grupo).click());
}

// Resultados de la lista abierta: [{ texto, deshabilitada, li }]. El texto es la
// etiqueta, sin el " · motivo" de los deshabilitados.
const resultados = (grupo) =>
  [...selector(grupo).querySelectorAll('[role="option"]')].map((li) => ({
    texto: li.childNodes[0].textContent,
    deshabilitada: li.getAttribute('aria-disabled') === 'true',
    li,
  }));

// Elige una opción de la lista (el selector elige con mousedown, para no perder el foco).
async function elegir(grupo, texto) {
  const opcion = resultados(grupo).find((r) => r.texto === texto);
  assert.ok(opcion, `no está "${texto}" en la lista`);
  await act(async () => opcion.li.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
}

// Los elegidos, como cuadraditos: [{ titulo, subtitulo, deshabilitado, motivo }].
const cuadros = (grupo) =>
  [...selector(grupo).querySelectorAll('.selector-multiple-item')].map((item) => ({
    titulo: item.querySelector('.selector-multiple-cuadro-titulo').textContent,
    subtitulo: item.querySelector('.selector-multiple-cuadro-subtitulo')?.textContent ?? null,
    deshabilitado: item.querySelector('.selector-multiple-cuadro').classList.contains('selector-multiple-cuadro-deshabilitado'),
    motivo: item.querySelector('.selector-multiple-cuadro-motivo')?.textContent ?? null,
  }));

const botonQuitar = (grupo, nombre) => selector(grupo).querySelector(`button[aria-label="Quitar ${nombre}"]`);

async function guardar() {
  await act(async () => {
    contenedor.querySelector('form').requestSubmit();
  });
  await esperar();
}

describe('ViajeForm: choferes y vehículos posibles con buscador y cuadraditos', () => {
  test('es el buscador de siempre (combobox), sin elegidos al empezar', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });
    assert.equal(campo('choferesCandidatos').getAttribute('role'), 'combobox');
    assert.equal(campo('choferesCandidatos').placeholder, 'Buscar chofer…');
    assert.equal(campo('vehiculosCandidatos').placeholder, 'Buscar vehículo…');
    assert.deepEqual(cuadros('choferesCandidatos'), []);
    // No hay una grilla con todos: la lista recién aparece al abrir el buscador.
    assert.equal(selector('choferesCandidatos').querySelectorAll('[role="option"]').length, 0);
  });

  test('buscar y agregar: filtra, agrega el elegido como cuadradito y limpia el texto', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });

    await escribir('choferesCandidatos', 'carl');
    assert.deepEqual(resultados('choferesCandidatos').map((r) => r.texto), ['Carla Ruiz']);
    await elegir('choferesCandidatos', 'Carla Ruiz');

    assert.deepEqual(cuadros('choferesCandidatos'), [
      { titulo: 'Carla Ruiz', subtitulo: null, deshabilitado: false, motivo: null },
    ]);
    assert.equal(campo('choferesCandidatos').value, '');
  });

  test('vehículo: el cuadradito dice "Interno N" y la patente debajo, en texto secundario', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });

    await escribir('vehiculosCandidatos', 'AE452');
    await elegir('vehiculosCandidatos', '12 - AE452KD');

    assert.deepEqual(cuadros('vehiculosCandidatos'), [
      { titulo: 'Interno 12', subtitulo: 'AE452KD', deshabilitado: false, motivo: null },
    ]);
    assert.ok(botonQuitar('vehiculosCandidatos', 'Interno 12, AE452KD'));
    // Si una línea no entra termina en "…": el nombre completo queda en el title.
    assert.equal(selector('vehiculosCandidatos').querySelector('.selector-multiple-cuadro-texto').title, 'Interno 12, AE452KD');
  });

  test('los elegidos son cuadraditos (radius-md), no píldoras', async () => {
    await montarForm({ valoresIniciales: { ...VALORES_ALTA, choferesCandidatos: [5] } });
    assert.ok(selector('choferesCandidatos').querySelector('.selector-multiple-cuadros .selector-multiple-cuadro'));
    assert.equal(selector('choferesCandidatos').querySelector('.selector-multiple-chip'), null);
  });

  test('los resultados muestran los habilitados primero y los deshabilitados al final', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });

    await abrirLista('choferesCandidatos');
    // La API los manda alfabéticos (Ana, Beto, Carla); Beto, vencido, va al final.
    assert.deepEqual(
      resultados('choferesCandidatos').map((r) => [r.texto, r.deshabilitada]),
      [
        ['Ana Pérez', false],
        ['Carla Ruiz', false],
        ['Beto Gómez', true],
      ]
    );

    await abrirLista('vehiculosCandidatos');
    // Por interno el 3 (vencido) va antes que el 12: queda al final.
    assert.deepEqual(
      resultados('vehiculosCandidatos').map((r) => [r.texto, r.deshabilitada]),
      [
        ['12 - AE452KD', false],
        ['3 - AB123CD', true],
      ]
    );
  });

  test('un deshabilitado (documentación vencida) no se puede agregar', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });

    await escribir('choferesCandidatos', 'beto');
    await elegir('choferesCandidatos', 'Beto Gómez');

    assert.deepEqual(cuadros('choferesCandidatos'), []);
  });

  test('quitar con la X (con aria-label "Quitar <nombre>")', async () => {
    await montarForm({ valoresIniciales: VALORES_ALTA });
    await escribir('choferesCandidatos', 'ana');
    await elegir('choferesCandidatos', 'Ana Pérez');

    const quitar = botonQuitar('choferesCandidatos', 'Ana Pérez');
    assert.ok(quitar, 'el botón de quitar tiene aria-label "Quitar Ana Pérez"');
    await act(async () => quitar.click());

    assert.deepEqual(cuadros('choferesCandidatos'), []);
  });

  test('un elegido que quedó vencido: se marca con el motivo, se puede quitar y no se puede volver a agregar', async () => {
    const enviados = await montarForm({ valoresIniciales: { ...VALORES_ALTA, choferesCandidatos: [6, 5] } });

    assert.deepEqual(cuadros('choferesCandidatos'), [
      { titulo: 'Beto Gómez', subtitulo: null, deshabilitado: true, motivo: 'Documentación vencida (Licencia de conducir)' },
      { titulo: 'Ana Pérez', subtitulo: null, deshabilitado: false, motivo: null },
    ]);

    await act(async () => botonQuitar('choferesCandidatos', 'Beto Gómez').click());
    assert.deepEqual(cuadros('choferesCandidatos').map((c) => c.titulo), ['Ana Pérez']);

    await escribir('choferesCandidatos', 'beto');
    assert.equal(resultados('choferesCandidatos')[0].deshabilitada, true);
    await elegir('choferesCandidatos', 'Beto Gómez');
    assert.deepEqual(cuadros('choferesCandidatos').map((c) => c.titulo), ['Ana Pérez']);

    await guardar();
    assert.deepEqual(enviados[0].choferesCandidatos, [5]);
  });

  test('alta: guarda los ids en el orden en que se eligieron (no el de la lista), sin choferId ni vehiculoId', async () => {
    const enviados = await montarForm({ valoresIniciales: VALORES_ALTA });

    await escribir('choferesCandidatos', 'carla');
    await elegir('choferesCandidatos', 'Carla Ruiz');
    await escribir('choferesCandidatos', 'ana');
    await elegir('choferesCandidatos', 'Ana Pérez');
    await escribir('vehiculosCandidatos', '12');
    await elegir('vehiculosCandidatos', '12 - AE452KD');
    await guardar();

    assert.equal(enviados.length, 1);
    assert.deepEqual(enviados[0].choferesCandidatos, [9, 5]);
    assert.deepEqual(enviados[0].vehiculosCandidatos, [7]);
    assert.ok(!('choferId' in enviados[0]));
    assert.ok(!('vehiculoId' in enviados[0]));
  });

  test('alta sin elegir ninguno: listas vacías (son opcionales)', async () => {
    const enviados = await montarForm({ valoresIniciales: VALORES_ALTA });
    await guardar();
    assert.deepEqual(enviados[0].choferesCandidatos, []);
    assert.deepEqual(enviados[0].vehiculosCandidatos, []);
  });

  test('edición de un A confirmar: los candidatos guardados aparecen elegidos y se reenvían iguales; quitar uno lo saca', async () => {
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
      // Lucas ya no figura entre los elegibles (p. ej. dado de baja): su cuadradito no desaparece.
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

    assert.deepEqual(cuadros('choferesCandidatos').map((c) => c.titulo), ['Ana Pérez', 'Lucas Díaz']);
    assert.deepEqual(cuadros('vehiculosCandidatos').map((c) => [c.titulo, c.subtitulo]), [['Interno 12', 'AE452KD']]);

    await guardar();
    assert.deepEqual(enviados[0].choferesCandidatos, [5, 11]);
    assert.deepEqual(enviados[0].vehiculosCandidatos, [7]);

    await act(async () => botonQuitar('choferesCandidatos', 'Ana Pérez').click());
    await guardar();
    assert.deepEqual(enviados[1].choferesCandidatos, [11]);
  });
});
