// Smoke test de render de la tarjeta de viaje del listado (agrupado por día) y
// del panel "Viajes de hoy" del Dashboard. Se corre con `npm test` (node:test).
//
// Mismo método que confirmarViaje.render.test.mjs: Vite en modo SSR carga los
// .jsx y se renderiza a HTML con react-dom/server. Verifica la estructura, NO los
// clicks ni los estilos.

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
let TarjetaViaje;
let ContenidoViajesDeHoy;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  TarjetaViaje = (await vite.ssrLoadModule('/src/components/TarjetaViaje.jsx')).default;
  ({ ContenidoViajesDeHoy } = await vite.ssrLoadModule('/src/components/PanelViajesDeHoy.jsx'));
});

after(() => vite.close());

// Hora de Córdoba = UTC - 3. "Ahora" = viernes 9/10/2026 12:00 en Córdoba.
const AHORA = Date.parse('2026-10-09T15:00:00Z');

const viaje = (extra = {}) => ({
  id: 1,
  estado: 'PROGRAMADO',
  origen: { nombre: 'Río Tercero' },
  destino: { nombre: 'Córdoba' },
  paradas: [],
  fechaInicio: '2026-10-09T10:30:00Z',
  fechaFin: '2026-10-09T13:00:00Z',
  kilometrosEstimados: 110,
  chofer: { nombre: 'Martín', apellido: 'Gómez' },
  vehiculo: { numeroInterno: 12, dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500' },
  ...extra,
});

const sinEtiquetas = (html) => html.replace(/<[^>]+>/g, '');

describe('TarjetaViaje', () => {
  const render = (props) => renderToStaticMarkup(h(TarjetaViaje, { onClick() {}, ...props }));

  test('bloque de fecha, ruta como título, horario y chofer, vehículo y km en el pie', () => {
    const html = render({ viaje: viaje() });
    assert.match(html, /class="listado-card-marca fecha-tile" aria-hidden="true"/);
    assert.match(html, /<span class="fecha-tile-dia">09<\/span><span class="fecha-tile-mes">oct<\/span>/);
    assert.match(html, /class="listado-card-titulo"><span class="ruta-viaje">/);
    assert.match(sinEtiquetas(html), /07:30 – 10:00 · Martín Gómez/);
    assert.match(html, /12 - <span class="patente">AE452KD<\/span> · Mercedes-Benz O500/);
    assert.match(html, /110 km estimados/);
    assert.ok(!html.includes('listado-card-detalle'));
  });

  test('sin chofer, vehículo ni km, los pendientes', () => {
    const texto = sinEtiquetas(render({ viaje: viaje({ chofer: null, vehiculo: null, kilometrosEstimados: null }) }));
    assert.match(texto, /07:30 – 10:00 · Chofer pendiente/);
    assert.match(texto, /Vehículo pendiente/);
    assert.match(texto, /Km pendientes/);
  });

  test('la variante chofer muestra solo el horario en el sub', () => {
    const html = render({ viaje: viaje(), variante: 'chofer' });
    assert.match(html, /class="listado-card-sub">07:30 – 10:00<\/div>/);
    assert.ok(!html.includes('Martín'));
  });
});

describe('ContenidoViajesDeHoy', () => {
  const render = (props) =>
    renderToStaticMarkup(
      h(ContenidoViajesDeHoy, { cargando: false, error: false, viajes: [], ahora: AHORA, onAbrir() {}, ...props })
    );

  test('una fila (botón) por viaje con horas, ruta, chofer, vehículo y estado', () => {
    const html = render({ viajes: [viaje()] });
    assert.match(html, /<ul class="dashboard-lista"><li><button type="button" class="dashboard-fila">/);
    assert.match(html, /<span class="hora-col">07:30<small>10:00<\/small><\/span>/);
    assert.match(html, /Martín Gómez · 12 - <span class="patente">AE452KD<\/span>/);
    assert.match(html, /estado-badge-sm/);
    assert.ok(!html.includes('progressbar'));
  });

  test('un En viaje que salió ayer muestra "ayer" y la barra de avance', () => {
    const html = render({
      viajes: [viaje({ estado: 'EN_VIAJE', fechaInicio: '2026-10-09T01:00:00Z', fechaFin: '2026-10-09T21:00:00Z' })],
    });
    assert.match(html, /<span class="hora-col">ayer 22:00<small>18:00<\/small><\/span>/);
    assert.match(html, /role="progressbar"[^>]*aria-valuenow="70"/);
    assert.match(html, /class="viajes-hoy-barra-fill" style="width:70%"/);
  });

  test('estados de carga, error y vacío', () => {
    assert.match(render({ cargando: true }), /loading-state/);
    assert.match(render({ error: true }), /No se pudieron cargar los viajes de hoy\./);
    assert.match(render({}), /class="dashboard-empty">No hay viajes para hoy</);
  });
});
