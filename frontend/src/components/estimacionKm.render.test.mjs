// Smoke test de render del cálculo de km del formulario de viaje: el botón
// "Calcular km" (deshabilitado sin origen/destino), el resultado en una línea
// con la atribución de ORS, el aviso de desactualizado, el error en el campo
// (con la acción para ubicar una ubicación sin coordenadas) y el paso "Ubicar en
// el mapa" que usan el selector de ubicaciones y ese error.
//
// Mismo método que viajes.render.test.mjs: Vite en modo SSR (ws: false, así no
// choca con otros tests en paralelo) y react-dom/server. Verifica estructura,
// no clicks: la lógica de "el campo se completa" y de cuándo un cálculo queda
// desactualizado está en utils/estimacionKm (estimacionKm.test.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let ViajeForm;
let CampoKmEstimados;
let ResultadoEstimacionKm;
let PasoUbicarEnMapa;
let EditorRecorrido;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  CampoKmEstimados = (await vite.ssrLoadModule('/src/components/CampoKmEstimados.jsx')).default;
  ResultadoEstimacionKm = (await vite.ssrLoadModule('/src/components/ResultadoEstimacionKm.jsx')).default;
  PasoUbicarEnMapa = (await vite.ssrLoadModule('/src/components/PasoUbicarEnMapa.jsx')).default;
  EditorRecorrido = (await vite.ssrLoadModule('/src/components/EditorRecorrido.jsx')).default;
});

after(() => vite.close());

const ATRIBUCION = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors';
const sinEtiquetas = (html) => html.replace(/<[^>]+>/g, '');
// El <button> "Calcular km" (el texto va en un <span> adentro).
const botonCalcular = (html) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Calcular km(?:(?!<\/button>).)*<\/button>/s)?.[0];

const RESULTADO = { kilometros: 38, duracionMinutos: 41 };

describe('ViajeForm: botón "Calcular km"', () => {
  const renderForm = (valoresIniciales) =>
    renderToStaticMarkup(
      h(ViajeForm, { valoresIniciales, onSubmit() {}, textoBoton: 'Crear viaje', textoEnviando: 'Creando…' })
    );
  const valores = (extra) => ({
    clienteId: '', clienteNombre: '', choferId: '', vehiculoId: '', choferesCandidatos: [], vehiculosCandidatos: [],
    paradas: [], origenId: '', origenNombre: '', destinoId: '', destinoNombre: '', fechaInicio: '', fechaFin: '',
    kilometrosEstimados: '', cantidadPasajeros: '', ...extra,
  });

  test('sin origen ni destino: deshabilitado, con la indicación de qué falta', () => {
    const html = renderForm(undefined);
    const boton = botonCalcular(html);
    assert.ok(boton, 'no se encontró el botón Calcular km');
    assert.match(boton, /disabled=""/);
    assert.match(html, /Elegí origen y destino para calcularlos/);
  });

  test('con origen pero sin destino: deshabilitado', () => {
    const html = renderForm(valores({ origenId: 1, origenNombre: 'Córdoba' }));
    assert.match(botonCalcular(html), /disabled=""/);
  });

  test('con origen y destino: habilitado y sin la indicación', () => {
    const html = renderForm(valores({ origenId: 1, origenNombre: 'Córdoba', destinoId: 2, destinoNombre: 'Villa Carlos Paz' }));
    assert.doesNotMatch(botonCalcular(html), /disabled=""/);
    assert.doesNotMatch(html, /Elegí origen y destino/);
  });

  test('es type="button": no envía el formulario', () => {
    assert.match(botonCalcular(renderForm(undefined)), /type="button"/);
  });

  test('el campo sigue siendo un input editable con el valor del formulario', () => {
    const html = renderForm(valores({ kilometrosEstimados: '120' }));
    assert.match(html, /<input type="number" id="kilometrosEstimados"[^>]*name="kilometrosEstimados" value="120"/);
  });
});

describe('CampoKmEstimados: error del cálculo', () => {
  const renderCampo = (props) =>
    renderToStaticMarkup(
      h(CampoKmEstimados, { valor: '', onChange() {}, puedeCalcular: true, calculando: false, onCalcular() {}, ...props })
    );

  test('el error se muestra como mensaje del campo y no rompe nada', () => {
    const html = renderCampo({ errorCalculo: { mensaje: 'Se agotó la cuota de OpenRouteService. Intentá más tarde.', faltantes: [] } });
    assert.match(html, /id="kilometrosEstimados-error" class="form-field-error" role="alert">Se agotó la cuota de OpenRouteService\. Intentá más tarde\.</);
    assert.match(html, /<input type="number" id="kilometrosEstimados" aria-invalid="true"[^>]*name="kilometrosEstimados"/);
    assert.doesNotMatch(botonCalcular(html), /disabled=""/, 'se puede volver a intentar');
    assert.doesNotMatch(html, /campo-km-ubicar/);
  });

  test('una ubicación sin coordenadas: mensaje corto y la acción "Ubicarla" (type=button)', () => {
    const html = renderCampo({
      errorCalculo: { mensaje: 'Falta ubicar "Hotel Sierras" en el mapa.', faltantes: [{ ubicacionId: 21, nombre: 'Hotel Sierras' }] },
    });
    assert.match(
      html,
      /role="alert">Falta ubicar &quot;Hotel Sierras&quot; en el mapa\.<span> <button type="button" class="campo-km-ubicar">Ubicarla<\/button><\/span><\/p>/
    );
  });

  test('varias sin coordenadas: una acción por cada una, con su nombre', () => {
    const html = renderCampo({
      errorCalculo: {
        mensaje: 'Faltan ubicar en el mapa: "Hotel Sierras", "Colegio Nacional de Monserrat".',
        faltantes: [
          { ubicacionId: 21, nombre: 'Hotel Sierras' },
          { ubicacionId: 20, nombre: 'Colegio Nacional de Monserrat' },
        ],
      },
    });
    const acciones = [...html.matchAll(/class="campo-km-ubicar">([^<]*)</g)].map((m) => m[1]);
    assert.deepEqual(acciones, ['Ubicar Hotel Sierras', 'Ubicar Colegio Nacional de Monserrat']);
  });

  test('el error de validación al guardar tiene prioridad sobre el del cálculo', () => {
    const html = renderCampo({ errorValidacion: 'Obligatorio para un viaje Programado.', errorCalculo: { mensaje: 'Falta ubicar…', faltantes: [] } });
    assert.match(html, /Obligatorio para un viaje Programado\./);
    assert.doesNotMatch(html, /Falta ubicar/);
  });

  test('mientras calcula, el botón queda ocupado', () => {
    assert.match(botonCalcular(renderCampo({ calculando: true })), /aria-busy="true"/);
  });
});

describe('ResultadoEstimacionKm', () => {
  const render = (props) => renderToStaticMarkup(h(ResultadoEstimacionKm, props));

  test('sin resultado no muestra nada', () => {
    assert.equal(render({ resultado: null }), '');
  });

  test('una sola línea "≈ km · duración" y la atribución en chico; nada más', () => {
    const html = render({ resultado: RESULTADO });
    const texto = sinEtiquetas(html);
    assert.match(html, /<p class="estimacion-km-total"><span>≈ 38 km · 41 min<\/span><\/p>/);
    assert.match(html, /<p class="estimacion-km-atribucion">© openrouteservice\.org by HeiGIT \| © OpenStreetMap contributors<\/p>/);
    assert.equal(texto, `≈ 38 km · 41 min${ATRIBUCION}`);
    assert.doesNotMatch(texto, /Google Maps|interpret|Revisá/);
    assert.doesNotMatch(html, /<details/);
  });

  test('más de una hora: "1 h 31 min"', () => {
    assert.match(sinEtiquetas(render({ resultado: { kilometros: 123, duracionMinutos: 91 } })), /≈ 123 km · 1 h 31 min/);
  });

  test('desactualizado: total tachado y aviso corto en la misma línea, sin sacar la atribución', () => {
    const html = render({ resultado: RESULTADO, desactualizado: true });
    assert.match(
      html,
      /<p class="estimacion-km-total"><span class="estimacion-km-total-viejo">≈ 38 km · 41 min<\/span><span class="estimacion-km-desactualizado" role="status">Cambió el recorrido: recalculá<\/span><\/p>/
    );
    assert.ok(sinEtiquetas(html).includes(ATRIBUCION));
  });

  test('CampoKmEstimados pasa el resultado y el estado desactualizado', () => {
    const html = renderToStaticMarkup(
      h(CampoKmEstimados, {
        valor: '38', onChange() {}, puedeCalcular: true, calculando: false, onCalcular() {},
        estimacion: { resultado: RESULTADO, desactualizado: true },
      })
    );
    assert.match(html, /recalculá/);
    assert.match(sinEtiquetas(html), /≈ 38 km/);
  });
});

describe('PasoUbicarEnMapa', () => {
  const render = (props) =>
    renderToStaticMarkup(h(PasoUbicarEnMapa, { nombre: 'Colegio Nacional de Monserrat', textoConfirmar: 'Crear ubicación', onConfirmar() {}, onCancelar() {}, ...props }));

  test('título con el nombre, las dos formas de ubicarla y la búsqueda precargada con el nombre', () => {
    const html = render();
    assert.match(html, /role="alertdialog" aria-modal="true" aria-label="Ubicar &quot;Colegio Nacional de Monserrat&quot; en el mapa"/);
    assert.match(html, /aria-pressed="true"[^>]*>Nombre</);
    assert.match(html, /aria-pressed="false"[^>]*>Coordenadas</);
    assert.match(html, /<input type="text"[^>]*value="Colegio Nacional de Monserrat"/);
    assert.match(html, /role="group" aria-label="Ubicar por"/);
    const nombres = [...html.matchAll(/<button[^>]*>(?:<span>)?([^<]*)/g)].map((m) => m[1]).filter(Boolean);
    assert.equal(new Set(nombres).size, nombres.length, 'sin dos botones con el mismo nombre: ' + nombres);
    assert.match(sinEtiquetas(html), /Crear ubicación/);
  });

  test('todos sus botones son type="button" (vive dentro del <form> del viaje)', () => {
    const botones = [...render().matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.ok(botones.length >= 4);
    for (const b of botones) assert.match(b, /type="button"/, b);
  });

  test('para completar una existente, el botón dice "Guardar ubicación"', () => {
    assert.match(sinEtiquetas(render({ nombre: 'Hotel Sierras', textoConfirmar: 'Guardar ubicación' })), /Guardar ubicación/);
  });
});

describe('EditorRecorrido usa el selector de ubicaciones', () => {
  test('origen, paradas y destino con el placeholder de ubicaciones', () => {
    const html = renderToStaticMarkup(
      h(EditorRecorrido, {
        origen: { id: '', nombre: '' },
        destino: { id: '', nombre: '' },
        paradas: [{ clave: 'a', id: '', nombre: '' }],
        onCambiarOrigen() {}, onCambiarDestino() {}, onCambiarParadas() {},
      })
    );
    assert.equal([...html.matchAll(/placeholder="Buscar o crear ubicación…"/g)].length, 3);
  });
});
