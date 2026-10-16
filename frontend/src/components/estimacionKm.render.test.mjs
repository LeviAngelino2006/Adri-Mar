// Smoke test de render del cálculo de km del formulario de viaje: el botón
// "Calcular km" (deshabilitado sin origen/destino), el resultado con la
// atribución de ORS, el aviso de desactualizado y el error en el campo.
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

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  CampoKmEstimados = (await vite.ssrLoadModule('/src/components/CampoKmEstimados.jsx')).default;
  ResultadoEstimacionKm = (await vite.ssrLoadModule('/src/components/ResultadoEstimacionKm.jsx')).default;
});

after(() => vite.close());

const ATRIBUCION = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors';
const sinEtiquetas = (html) => html.replace(/<[^>]+>/g, '');
// El <button> "Calcular km" (el texto va en un <span> adentro).
const botonCalcular = (html) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Calcular km(?:(?!<\/button>).)*<\/button>/s)?.[0];

const RESULTADO = {
  kilometros: 38,
  duracionMinutos: 41,
  puntos: [
    { ubicacionId: 1, nombre: 'Córdoba', interpretadoComo: 'Córdoba, Argentina' },
    { ubicacionId: 2, nombre: 'Villa Carlos Paz', interpretadoComo: 'Villa Carlos Paz, CD, Argentina' },
  ],
};

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
    const html = renderCampo({ errorCalculo: 'No se encontró "Xqzwvlk" en el mapa.' });
    assert.match(html, /id="kilometrosEstimados-error" class="form-field-error" role="alert">No se encontró &quot;Xqzwvlk&quot; en el mapa\.</);
    assert.match(html, /<input type="number" id="kilometrosEstimados" aria-invalid="true"[^>]*name="kilometrosEstimados"/);
    assert.doesNotMatch(botonCalcular(html), /disabled=""/, 'se puede volver a intentar');
  });

  test('el error de validación al guardar tiene prioridad sobre el del cálculo', () => {
    const html = renderCampo({ errorValidacion: 'Obligatorio para un viaje Programado.', errorCalculo: 'No se encontró…' });
    assert.match(html, /Obligatorio para un viaje Programado\./);
    assert.doesNotMatch(html, /No se encontró/);
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

  test('total, duración, cada punto interpretado, la indicación de Google Maps y la atribución', () => {
    const html = render({ resultado: RESULTADO });
    const texto = sinEtiquetas(html);
    assert.match(texto, /≈ 38 km · 41 min aprox\./);
    assert.match(html, /<details class="estimacion-km-puntos"><summary>Cómo se interpretó cada punto<\/summary>/);
    assert.match(texto, /Córdoba → Córdoba, Argentina/);
    assert.match(texto, /Villa Carlos Paz → Villa Carlos Paz, CD, Argentina/);
    assert.match(texto, /Ver recorrido en Google Maps/);
    assert.ok(texto.includes(ATRIBUCION), 'falta la atribución de ORS/OpenStreetMap');
    assert.doesNotMatch(texto, /volvé a calcular/);
  });

  test('desactualizado: avisa que hay que volver a calcular y tacha el total, sin sacar la atribución', () => {
    const html = render({ resultado: RESULTADO, desactualizado: true });
    assert.match(html, /role="status">El recorrido cambió después del cálculo: volvé a calcular los km\./);
    assert.match(html, /class="estimacion-km-total estimacion-km-total-viejo"/);
    assert.ok(sinEtiquetas(html).includes(ATRIBUCION));
  });

  test('CampoKmEstimados pasa el resultado y el estado desactualizado', () => {
    const html = renderToStaticMarkup(
      h(CampoKmEstimados, {
        valor: '38', onChange() {}, puedeCalcular: true, calculando: false, onCalcular() {},
        estimacion: { resultado: RESULTADO, desactualizado: true },
      })
    );
    assert.match(html, /volvé a calcular los km/);
    assert.match(sinEtiquetas(html), /≈ 38 km/);
  });
});
