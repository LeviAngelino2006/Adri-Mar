// Smoke test de render del cálculo de km del formulario de viaje: el botón
// "Calcular km" (deshabilitado sin origen/destino), la franja fija debajo del
// campo con la atribución de Google (logo) mientras el valor sea el calculado
// y el aviso de desactualizado, el error en el
// campo (con la acción para ubicar una ubicación sin coordenadas), el modal de
// Google que abre esa acción y el link al recorrido con el placeId.
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
let AtribucionGoogle;
let ATRIBUCION_GOOGLE;
let UbicarConGoogle;
let EditorRecorrido;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  CampoKmEstimados = (await vite.ssrLoadModule('/src/components/CampoKmEstimados.jsx')).default;
  ({ default: AtribucionGoogle, ATRIBUCION_GOOGLE } = await vite.ssrLoadModule('/src/components/AtribucionGoogle.jsx'));
  UbicarConGoogle = (await vite.ssrLoadModule('/src/components/UbicarConGoogle.jsx')).default;
  EditorRecorrido = (await vite.ssrLoadModule('/src/components/EditorRecorrido.jsx')).default;
});

after(() => vite.close());

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
    const html = renderCampo({ errorCalculo: { mensaje: 'Se agotó la cuota de Google Maps. Intentá más tarde.', faltantes: [] } });
    assert.match(html, /id="kilometrosEstimados-error" class="form-field-error" role="alert">Se agotó la cuota de Google Maps\. Intentá más tarde\.</);
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

describe('AtribucionGoogle', () => {
  test('el logo oficial como <img> con alt "Google Maps"', () => {
    const html = renderToStaticMarkup(h(AtribucionGoogle));
    assert.equal(ATRIBUCION_GOOGLE, 'Google Maps');
    // React 19 en SSR antepone un <link rel="preload"> para la imagen; no es
    // parte del componente.
    assert.match(html, /<span class="atribucion-google"><img class="atribucion-google-logo" src="[^"]*google-maps-logo\.svg" alt="Google Maps"\/><\/span>$/);
  });
});

describe('CampoKmEstimados: franja de la atribución de Google', () => {
  const renderCampo = (props) =>
    renderToStaticMarkup(
      h(CampoKmEstimados, { valor: '', onChange() {}, puedeCalcular: true, calculando: false, onCalcular() {}, ...props })
    );
  const hint = (html) => html.match(/<p id="kilometrosEstimados-hint" class="form-field-hint">(.*?)<\/p>/s)?.[1];
  // Contenido de la franja (va después de la fila input + botón, y siempre está).
  const franja = (html) => html.match(/<div class="campo-km-atribucion">(.*?)<\/div><\/div>$/s)?.[1];
  const logo = /<img class="atribucion-google-logo"[^>]*alt="Google Maps"/;
  const AVISO = '<span class="campo-km-desactualizado" role="status">Cambió el recorrido: recalculá</span>';

  test('sin origen/destino: el hint con la indicación y la franja vacía (pero presente)', () => {
    const html = renderCampo({ puedeCalcular: false });
    assert.equal(hint(html), 'Elegí origen y destino para calcularlos');
    assert.equal(franja(html), '');
  });

  test('sin estimación: la franja está igual, vacía, y no hay hint', () => {
    const html = renderCampo({ valor: '38' });
    assert.equal(franja(html), '');
    assert.equal(hint(html), undefined);
  });

  test('estimación vigente y el input con el valor calculado: el logo en la franja, no en el hint, sin repetir los km', () => {
    const html = renderCampo({ valor: '38', estimacion: { resultado: RESULTADO, desactualizado: false } });
    assert.match(franja(html), new RegExp(`^<span class="atribucion-google">${logo.source}[^>]*/></span>$`));
    assert.equal(hint(html), undefined);
    assert.doesNotMatch(html, /recalculá|≈|41 min/);
  });

  test('desactualizada y el valor calculado: el logo y, a su derecha, el aviso', () => {
    const html = renderCampo({ valor: '38', estimacion: { resultado: RESULTADO, desactualizado: true } });
    assert.match(franja(html), new RegExp(`^<span class="atribucion-google">${logo.source}[^>]*/></span>${AVISO}$`));
    assert.equal(hint(html), undefined);
  });

  test('km editados a mano: franja vacía, sin atribución ni aviso (el dato ya no es de Google)', () => {
    for (const desactualizado of [false, true]) {
      const html = renderCampo({ valor: '40', estimacion: { resultado: RESULTADO, desactualizado } });
      assert.equal(franja(html), '');
      assert.doesNotMatch(html, logo);
    }
  });

  test('input vacío: no cuenta como el valor calculado (ni siquiera si el cálculo dio 0)', () => {
    for (const kilometros of [38, 0]) {
      const html = renderCampo({ valor: '', estimacion: { resultado: { kilometros, duracionMinutos: 0 }, desactualizado: false } });
      assert.equal(franja(html), '');
    }
  });

  test('el logo sigue con un error en el campo: el error va en el FormField, la franja aparte', () => {
    const html = renderCampo({
      valor: '38',
      estimacion: { resultado: RESULTADO, desactualizado: false },
      errorValidacion: 'Obligatorio para un viaje Programado.',
    });
    assert.match(html, /role="alert">Obligatorio para un viaje Programado\.</);
    assert.match(franja(html), logo);
  });
});

describe('UbicarConGoogle (la acción "Ubicarla" del error)', () => {
  const render = (props) =>
    renderToStaticMarkup(h(UbicarConGoogle, { nombre: 'Colegio Nacional de Monserrat', onUbicar() {}, onCancelar() {}, ...props }));

  test('título con el nombre y el buscador de Google precargado con él; ya no hay coordenadas para pegar', () => {
    const html = render();
    assert.match(html, /role="alertdialog" aria-modal="true" aria-label="Ubicar &quot;Colegio Nacional de Monserrat&quot; en el mapa"/);
    assert.match(html, /<label[^>]*>Buscar en Google Maps<\/label><input type="text"[^>]*value="Colegio Nacional de Monserrat"/);
    assert.doesNotMatch(html, /Coordenadas|Pegar/);
    assert.match(sinEtiquetas(html), /Guardar ubicación/);
  });

  test('todos sus botones son type="button" (vive dentro del <form> del viaje)', () => {
    const botones = [...render().matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.ok(botones.length >= 2);
    for (const b of botones) assert.match(b, /type="button"/, b);
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
    assert.equal([...html.matchAll(/placeholder="Buscar ubicación o dirección…"/g)].length, 3);
  });

  test('"Ver recorrido en Google Maps" usa el placeId de la casa elegida en Google y las coordenadas de la localidad', () => {
    const html = renderToStaticMarkup(
      h(EditorRecorrido, {
        origen: { id: 10, nombre: 'Av. Colón 1234, X5000 Córdoba', placeId: 'ChIJ_casa', latitud: null, longitud: null },
        destino: { id: 9, nombre: 'Cosquín', placeId: null, latitud: -31.2437, longitud: -64.4653 },
        paradas: [],
        onCambiarOrigen() {}, onCambiarDestino() {}, onCambiarParadas() {},
      })
    );
    const href = html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
    const params = new URL(href).searchParams;
    assert.equal(params.get('origin_place_id'), 'ChIJ_casa');
    assert.equal(params.get('destination'), '-31.2437,-64.4653');
  });
});
