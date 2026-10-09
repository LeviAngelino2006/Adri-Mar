// Smoke test de render de ControlSegmentado, de la tarjeta de un documento de la
// ficha de Documentación y del marco del visor de PDF. Se corre con `npm test` (node:test).
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
let ModalVisorPdf;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ControlSegmentado = (await vite.ssrLoadModule('/src/components/ui/ControlSegmentado.jsx')).default;
  TarjetaDocumento = (await vite.ssrLoadModule('/src/components/documentacion/TarjetaDocumento.jsx')).default;
  ModalVisorPdf = (await vite.ssrLoadModule('/src/components/documentacion/ModalVisorPdf.jsx')).default;
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

  test('ícono y cantidad opcionales; sin cantidad no hay span vacío', () => {
    const html = renderToStaticMarkup(
      h(ControlSegmentado, {
        opciones: [
          { valor: 'vehiculos', etiqueta: 'Vehículos', icono: h('svg', { 'aria-hidden': 'true' }), cantidad: 14 },
          { valor: 'choferes', etiqueta: 'Choferes', cantidad: 0 },
          { valor: 'otros', etiqueta: 'Otros' },
        ],
        valor: 'vehiculos',
        onChange: () => {},
        ariaLabel: 'Vista',
      })
    );
    assert.match(html, /<svg aria-hidden="true"><\/svg>Vehículos<span class="control-segmentado-cantidad">14<\/span>/);
    assert.match(html, /Choferes<span class="control-segmentado-cantidad">0<\/span>/);
    assert.equal((html.match(/control-segmentado-cantidad/g) || []).length, 2);
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

describe('ModalVisorPdf', () => {
  const documento = {
    nombreArchivo: 'poliza-2026.pdf',
    creadoEn: '2026-03-12T15:00:00.000Z',
    tipoDocumento: { descripcion: 'POLIZA_SEGURO' },
    usuario: { nombre: 'Ana', apellido: 'Pérez' },
  };
  let html;
  before(() => {
    html = renderToStaticMarkup(
      h(ModalVisorPdf, { documento, url: 'https://storage.test/poliza.pdf?token=1', subtitulo: 'Interno 12', onClose() {} })
    );
  });

  test('mientras baja el visor muestra un Spinner y ya no usa iframe', () => {
    assert.match(html, /doc-visor-cargando/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /<iframe/);
  });

  test('el encabezado y el pie están desde el principio, con las dos acciones', () => {
    assert.match(html, /Póliza de seguro/);
    assert.match(html, /Interno 12/);
    assert.match(html, /poliza-2026\.pdf · Subido el 12 mar 2026 por Ana Pérez/);
    assert.match(html, /<a class="btn btn-secondary" href="https:\/\/storage\.test\/poliza\.pdf\?token=1"[^>]*target="_blank"[^>]*>Abrir en otra pestaña/);
    assert.match(html, /btn-primary[^>]*>.*Descargar PDF/);
  });

  test('es un diálogo modal con la variante visor', () => {
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /doc-modal doc-modal-visor/);
  });
});
