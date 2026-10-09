// Smoke test de render de ControlSegmentado y de la tarjeta de un documento de la
// ficha de Documentación. Se corre con `npm test` (node:test).
//
// Mismo método que confirmarViaje.render.test.mjs: Vite en modo SSR carga los
// .jsx y se renderiza a HTML con react-dom/server. Verifica la estructura (qué
// botones aparecen en cada caso), NO los clicks ni los estilos.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

let vite;
let ControlSegmentado;
let TarjetaDocumento;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  ControlSegmentado = (await vite.ssrLoadModule('/src/components/ui/ControlSegmentado.jsx')).default;
  TarjetaDocumento = (await vite.ssrLoadModule('/src/components/documentacion/TarjetaDocumento.jsx')).default;
});

after(() => vite.close());

describe('ControlSegmentado', () => {
  const opciones = [
    { valor: 'vehiculos', etiqueta: 'Vehículos' },
    { valor: 'choferes', etiqueta: 'Choferes' },
  ];
  const render = (valor) =>
    renderToStaticMarkup(h(ControlSegmentado, { opciones, valor, onChange: () => {}, ariaLabel: 'Vista de documentación' }));

  test('es un grupo con nombre y un botón por opción, con la activa marcada', () => {
    const html = render('choferes');
    assert.match(html, /role="group"/);
    assert.match(html, /aria-label="Vista de documentación"/);
    assert.equal((html.match(/<button/g) || []).length, 2);
    assert.equal((html.match(/type="button"/g) || []).length, 2);
    assert.match(html, /aria-pressed="false"[^>]*>Vehículos</);
    assert.match(html, /aria-pressed="true"[^>]*>Choferes</);
  });

  test('solo la opción activa lleva la clase de activa', () => {
    assert.equal((render('vehiculos').match(/is-activa/g) || []).length, 1);
  });
});

describe('TarjetaDocumento', () => {
  const tipoConVencimiento = { id: 1, descripcion: 'POLIZA_SEGURO', requiereVencimiento: true, requiereArchivo: true };
  const documento = {
    id: 9,
    tieneArchivo: true,
    estadoVigencia: 'VIGENTE',
    fechaVencimiento: '2099-12-22T12:00:00.000Z',
    creadoEn: '2026-03-12T15:00:00.000Z',
  };
  const render = (props) =>
    renderToStaticMarkup(
      h(TarjetaDocumento, { onVerPdf() {}, onActualizar() {}, onHistorial() {}, soloConsulta: false, ...props })
    );

  test('cargado con PDF y una sola versión: Ver PDF y Actualizar, sin Historial', () => {
    const html = render({ item: { tipo: tipoConVencimiento, cargado: true, cantidadVersiones: 1, documento } });
    assert.match(html, /Póliza de seguro/);
    assert.match(html, />Vigente</);
    assert.match(html, /Ver PDF/);
    assert.match(html, /Actualizar/);
    assert.doesNotMatch(html, /Historial/);
    assert.doesNotMatch(html, /Cargar documento/);
  });

  test('con más de una versión aparece Historial', () => {
    const html = render({ item: { tipo: tipoConVencimiento, cargado: true, cantidadVersiones: 3, documento } });
    assert.match(html, /Historial/);
  });

  test('sin archivo no hay Ver PDF', () => {
    const html = render({
      item: { tipo: tipoConVencimiento, cargado: true, cantidadVersiones: 1, documento: { ...documento, tieneArchivo: false } },
    });
    assert.doesNotMatch(html, /Ver PDF/);
  });

  test('pendiente: un solo botón primario "Cargar documento" y el estado Pendiente', () => {
    const html = render({ item: { tipo: tipoConVencimiento, cargado: false, cantidadVersiones: 0, documento: null } });
    assert.match(html, />Pendiente</);
    assert.match(html, /Todavía no se cargó/);
    assert.equal((html.match(/<button/g) || []).length, 1);
    assert.match(html, /btn-primary[^>]*>.*Cargar documento/);
  });

  test('de solo consulta no se puede cargar ni actualizar, pero sí ver y consultar el historial', () => {
    const cargado = render({
      soloConsulta: true,
      item: { tipo: tipoConVencimiento, cargado: true, cantidadVersiones: 2, documento },
    });
    assert.doesNotMatch(cargado, /Actualizar/);
    assert.match(cargado, /Ver PDF/);
    assert.match(cargado, /Historial/);

    const pendiente = render({
      soloConsulta: true,
      item: { tipo: tipoConVencimiento, cargado: false, cantidadVersiones: 0, documento: null },
    });
    assert.doesNotMatch(pendiente, /Cargar documento/);
  });

  test('un vencido se marca y explica hace cuántos días', () => {
    const html = render({
      item: {
        tipo: tipoConVencimiento,
        cargado: true,
        cantidadVersiones: 1,
        documento: { ...documento, estadoVigencia: 'VENCIDO', fechaVencimiento: '2020-01-02T12:00:00.000Z' },
      },
    });
    assert.match(html, />Vencido</);
    assert.match(html, /is-vencido/);
    assert.match(html, /Venció el 02 ene 2020, hace [\d]+ días/);
  });
});
