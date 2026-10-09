// Smoke test de render del modal de Confirmar viaje abierto desde el panel
// "Viajes por confirmar" del Dashboard y desde el detalle de Viajes. Se corre con
// `npm test` (node:test).
//
// No hay un runner de componentes en el proyecto: se levanta Vite en modo SSR para
// cargar los .jsx y se renderiza a HTML con react-dom/server. Eso verifica la
// estructura (qué se muestra con qué datos), NO los clicks ni los estilos. El
// render del servidor no ejecuta efectos, así que el estado inicial del modal es el
// que se ve acá; la lista de viajes del panel se prueba pasándole los datos ya
// cargados a su parte visual.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// La raíz sale de la ubicación de este archivo (no de process.cwd()), y tanto Vite
// como este test resuelven React desde ella: en Windows una ruta con otra
// capitalización de la unidad cargaría React dos veces y fallarían los hooks.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let ModalConfirmarViaje;
let ContenidoPorConfirmar;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  ModalConfirmarViaje = (await vite.ssrLoadModule('/src/components/ModalConfirmarViaje.jsx')).default;
  ({ ContenidoPorConfirmar } = await vite.ssrLoadModule('/src/components/PanelViajesPorConfirmar.jsx'));
});

after(() => vite.close());

// --- Viajes con la forma EXACTA que devuelve GET /viajes a un gestor --------------

const baseApi = {
  estado: 'A_CONFIRMAR',
  choferId: null,
  chofer: null,
  vehiculoId: null,
  vehiculo: null,
  origenId: 1,
  origen: { id: 1, nombre: 'Río Tercero' },
  destinoId: 2,
  destino: { id: 2, nombre: 'Córdoba' },
  paradas: [],
  clienteId: 1,
  cliente: { id: 1, nombre: 'ACME' },
  fechaFin: null,
  kilometrosEstimados: null,
  cantidadPasajeros: null,
};

const viajeConCandidatos = {
  ...baseApi,
  id: 227,
  fechaInicio: '2026-10-09T20:30:00.000Z',
  choferesCandidatos: [{ id: 2, nombre: 'Ana', apellido: 'Pérez' }],
  vehiculosCandidatos: [{ id: 87, dominio: 'AE452KD', numeroInterno: '12' }],
};

const viajeSinCandidatos = {
  ...baseApi,
  id: 229,
  fechaInicio: '2026-10-09T00:41:00.000Z',
  choferesCandidatos: [],
  vehiculosCandidatos: [],
};

// --- Helpers de render --------------------------------------------------------------

const renderizarModal = (viaje) => renderToStaticMarkup(h(ModalConfirmarViaje, { viaje, onCerrar() {}, onExito() {} }));

const contar = (html, patron) => (html.match(patron) || []).length;
const radios = (html) => contar(html, /type="radio"/g);
const selects = (html) => contar(html, /<select/g);

// Expande los componentes de función SIN hooks (la parte visual del panel, Button,
// RutaViaje…) hasta quedar solo con elementos del DOM, para poder encontrar el
// botón "Confirmar" y llamar a su onClick como lo haría el navegador.
function expandir(nodo) {
  if (Array.isArray(nodo)) return nodo.map(expandir);
  if (!nodo || typeof nodo !== 'object' || !nodo.type) return nodo;
  if (typeof nodo.type === 'function') return expandir(nodo.type(nodo.props));
  return { ...nodo, props: { ...nodo.props, children: expandir(nodo.props?.children) } };
}

function buscarTodos(nodo, coincide, encontrados = []) {
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo) => buscarTodos(hijo, coincide, encontrados));
  } else if (nodo && typeof nodo === 'object' && nodo.type) {
    if (coincide(nodo)) encontrados.push(nodo);
    buscarTodos(nodo.props?.children, coincide, encontrados);
  }
  return encontrados;
}

// Los botones "Confirmar" del panel, en el orden en que aparecen.
function botonesConfirmar(contenido) {
  const arbol = expandir(contenido);
  return buscarTodos(
    arbol,
    (nodo) => nodo.type === 'button' && String(nodo.props.className).includes('por-confirmar-accion')
  );
}

// --- Tests ---------------------------------------------------------------------------

describe('el modal abierto desde el panel "Viajes por confirmar"', () => {
  test('el botón Confirmar le entrega al modal el viaje tal cual vino de la API', () => {
    const entregados = [];
    const contenido = h(ContenidoPorConfirmar, {
      cargando: false,
      error: false,
      hoy: [viajeSinCandidatos],
      manana: [viajeConCandidatos],
      onConfirmar: (viaje) => entregados.push(viaje),
    });

    const botones = botonesConfirmar(contenido);
    assert.equal(botones.length, 2);
    botones.forEach((boton) => boton.props.onClick());

    // El mismo objeto, sin copiar ni recortar: con sus choferesCandidatos y vehiculosCandidatos.
    assert.equal(entregados[0], viajeSinCandidatos);
    assert.equal(entregados[1], viajeConCandidatos);
    assert.equal(entregados[1].choferesCandidatos.length, 1);
    assert.equal(entregados[1].vehiculosCandidatos.length, 1);
  });

  test('con candidatos muestra los radios y "Elegir otro…", no los selects', () => {
    let entregado;
    const contenido = h(ContenidoPorConfirmar, {
      cargando: false,
      error: false,
      hoy: [],
      manana: [viajeConCandidatos],
      onConfirmar: (viaje) => (entregado = viaje),
    });
    botonesConfirmar(contenido)[0].props.onClick();

    const html = renderizarModal(entregado);

    assert.equal(radios(html), 4, 'un candidato + "Elegir otro…" por cada uno de los dos bloques');
    assert.equal(contar(html, /Elegir otro…/g), 2);
    assert.equal(selects(html), 0, 'los selects solo aparecen al elegir "Elegir otro…"');
    assert.ok(html.includes('Ana Pérez'));
    assert.ok(html.includes('12 - AE452KD'));
    assert.ok(html.includes('confirm-modal-wide'), 'el modal es el ancho (size="wide")');
    assert.ok(!html.includes('no tiene choferes'), 'con candidatos no hay texto de "sin candidatos"');
  });

  test('es exactamente el mismo modal, con los mismos datos, que el detalle de Viajes', () => {
    // El detalle de Viajes le pasa al modal el viaje de la misma respuesta de la API
    // (una copia con los mismos datos): el HTML tiene que ser idéntico.
    const delPanel = renderizarModal(viajeConCandidatos);
    const delDetalle = renderizarModal(JSON.parse(JSON.stringify(viajeConCandidatos)));
    assert.equal(delPanel, delDetalle);

    const sinDelPanel = renderizarModal(viajeSinCandidatos);
    const sinDelDetalle = renderizarModal(JSON.parse(JSON.stringify(viajeSinCandidatos)));
    assert.equal(sinDelPanel, sinDelDetalle);
  });

  test('el panel y el detalle usan el mismo componente ModalConfirmarViaje', () => {
    const leer = (ruta) => fs.readFileSync(path.join(RAIZ, 'src', ruta), 'utf8');
    const panel = leer('components/PanelViajesPorConfirmar.jsx');
    const detalle = leer('pages/Viajes.jsx');

    assert.match(panel, /import ModalConfirmarViaje from '\.\/ModalConfirmarViaje'/);
    assert.match(detalle, /import ModalConfirmarViaje from '\.\.\/components\/ModalConfirmarViaje'/);
    assert.match(panel, /<ModalConfirmarViaje\s+viaje=\{pedidoConfirmar\}/);
    assert.match(detalle, /<ModalConfirmarViaje\s+viaje=\{pedidoConfirmar\}/);
    // El tamaño y todo lo demás lo decide el propio modal, no quien lo monta.
    assert.ok(!/<ModalConfirmarViaje[^>]*size=/.test(panel + detalle));
  });
});

describe('un viaje que de verdad no tiene candidatos', () => {
  test('sin choferes ni vehículos: texto único arriba de los dos selects', () => {
    const html = renderizarModal(viajeSinCandidatos);

    assert.equal(radios(html), 0);
    assert.equal(selects(html), 2);
    assert.equal(contar(html, /Este viaje no tiene/g), 1);
    assert.ok(
      html.includes('Este viaje no tiene choferes ni vehículos posibles cargados. Elegí uno de la lista.')
    );
    // El texto va ANTES del primer select.
    assert.ok(html.indexOf('Este viaje no tiene') < html.indexOf('<select'));
  });

  test('faltan solo los choferes: el texto va arriba del select de chofer', () => {
    const html = renderizarModal({ ...viajeConCandidatos, choferesCandidatos: [] });

    assert.ok(html.includes('Este viaje no tiene choferes posibles cargados. Elegí uno de la lista.'));
    assert.ok(!html.includes('vehículos posibles cargados'));
    assert.equal(selects(html), 1, 'solo el de chofer; el vehículo sigue con sus radios');
    assert.equal(radios(html), 2);
    assert.ok(html.indexOf('Este viaje no tiene') < html.indexOf('<select'));
  });

  test('faltan solo los vehículos: el texto va arriba del select de vehículo', () => {
    const html = renderizarModal({ ...viajeConCandidatos, vehiculosCandidatos: [] });

    assert.ok(html.includes('Este viaje no tiene vehículos posibles cargados. Elegí uno de la lista.'));
    assert.ok(!html.includes('choferes posibles cargados'));
    assert.equal(selects(html), 1);
    assert.equal(radios(html), 2);
    // Los radios de chofer van primero y el texto después, arriba del select de vehículo.
    assert.ok(html.indexOf('type="radio"') < html.indexOf('Este viaje no tiene'));
    assert.ok(html.indexOf('Este viaje no tiene') < html.indexOf('<select'));
  });

  test('si el viaje llega sin las claves de candidatos no se afirma que "no tiene"', () => {
    const { choferesCandidatos: _c, vehiculosCandidatos: _v, ...sinClaves } = viajeConCandidatos;

    const html = renderizarModal(sinClaves);

    assert.ok(!html.includes('Este viaje no tiene'));
    assert.equal(selects(html), 2);
  });

  test('las fechas y los km siguen siendo obligatorios en los dos casos', () => {
    for (const viaje of [viajeConCandidatos, viajeSinCandidatos]) {
      const html = renderizarModal(viaje);
      assert.ok(html.includes('Fecha y hora de inicio') && html.includes('Fecha y hora de fin'));
      assert.ok(html.includes('Kilómetros estimados'));
    }
  });
});
