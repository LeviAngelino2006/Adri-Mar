// Smoke test de render del estado de carga (Cargando): el marcado de cada
// etapa y de cada forma. Se corre con `npm test` (node:test).
//
// Mismo método que viajes.render.test.mjs: Vite en modo SSR carga los .jsx y se
// renderiza a HTML con react-dom/server. Los timers no corren en SSR, así que
// Cargando sale en 'oculto'; las etapas se prueban con ContenidoCarga.

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
let Cargando;
let ContenidoCarga;
let CargaColectivo;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ default: Cargando, ContenidoCarga, CargaColectivo } = await vite.ssrLoadModule('/src/components/ui/Cargando.jsx'));
});

after(() => vite.close());

const contar = (html, texto) => html.split(texto).length - 1;

describe('Cargando', () => {
  test('al montarse no muestra nada: el contenedor va vacío', () => {
    assert.equal(
      renderToStaticMarkup(h(Cargando, { forma: 'tarjetas' })),
      '<div class="carga" role="status" aria-live="polite"></div>'
    );
  });

  test('esqueleto de tarjetas: las clases de ListadoCard con barras, 3 por defecto', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'tarjetas' }));
    assert.match(html, /<span class="sr-only">Cargando…<\/span>/);
    assert.match(html, /<div class="listado-cards" aria-hidden="true"><div class="listado-card esqueleto-tarjeta">/);
    assert.equal(contar(html, 'class="listado-card esqueleto-tarjeta"'), 3);
    assert.equal(contar(html, 'class="listado-card-marca"'), 3);
    assert.match(html, /<span class="listado-card-titulo"><span class="esqueleto-barra" style="width:55%"><\/span><\/span><span class="esqueleto-barra esqueleto-badge"><\/span>/);
    assert.match(html, /<div class="listado-card-sub"><span class="esqueleto-barra" style="width:35%"><\/span><\/div>/);
    // Las barras del pie van envueltas en <span> para conservar el alto de línea.
    assert.match(
      html,
      /<div class="listado-card-pie"><span style="width:40%"><span class="esqueleto-barra" style="width:100%"><\/span><\/span><span style="width:20%"><span class="esqueleto-barra" style="width:100%"><\/span><\/span><\/div>/
    );
    assert.ok(!html.includes('fecha-tile') && !html.includes('listado-grupo'));
    assert.ok(!html.includes('carga-colectivo'));
  });

  test('documentos con encabezado "resumen": resumen y título de sección antes de las tarjetas', () => {
    const html = renderToStaticMarkup(
      h(ContenidoCarga, { etapa: 'esqueleto', forma: 'documentos', cantidad: 4, encabezado: 'resumen' })
    );
    assert.match(
      html,
      /^<div class="carga" role="status" aria-live="polite"><span class="sr-only">Cargando…<\/span><div aria-hidden="true"><p class="doc-ficha-resumen"><span class="esqueleto-barra" style="width:240px"><\/span><\/p><section class="doc-seccion"><h2 class="detalle-seccion-titulo doc-seccion-titulo"><span class="esqueleto-barra" style="width:120px"><\/span><\/h2><div class="doc-tarjetas"/
    );
    assert.equal(contar(html, '<article class="doc-tarjeta esqueleto-documento">'), 4);
    assert.ok(!html.includes('doc-ficha-header'));
  });

  test('documentos con encabezado "completo": también título y subtítulo de la ficha', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'documentos', encabezado: 'completo' }));
    assert.match(
      html,
      /<div aria-hidden="true"><div class="doc-ficha-header"><h1><span class="esqueleto-barra" style="width:200px"><\/span><\/h1><\/div><p class="doc-ficha-subtitulo"><span class="esqueleto-barra" style="width:260px"><\/span><\/p><p class="doc-ficha-resumen">/
    );
  });

  test('documentos sin encabezado: solo las tarjetas', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'documentos' }));
    assert.ok(!html.includes('doc-ficha-resumen') && !html.includes('doc-seccion'));
  });

  test('esqueleto de viajes: grupo con título de día y bloque de fecha', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'viajes' }));
    assert.match(
      html,
      /<section class="listado-grupo" aria-hidden="true"><h2 class="listado-dia"><span class="esqueleto-barra" style="width:110px"><\/span><\/h2><div class="listado-cards" aria-hidden="true">/
    );
    assert.equal(contar(html, 'class="listado-card-marca fecha-tile"'), 3);
  });

  test('esqueleto de documentacion: la tarjeta con la línea de detalle entre sub y pie', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'documentacion' }));
    assert.equal(contar(html, 'class="listado-card esqueleto-tarjeta"'), 3);
    assert.match(
      html,
      /<div class="listado-card-sub"><span class="esqueleto-barra" style="width:35%"><\/span><\/div><div class="listado-card-detalle"><span class="esqueleto-barra" style="width:50%"><\/span><\/div><div class="listado-card-pie">/
    );
    assert.equal(contar(renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'tarjetas' })), 'listado-card-detalle'), 0);
  });

  test('esqueleto de documentos: las clases de TarjetaDocumento, con nombre, badge, fechas y dos botones', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'documentos', cantidad: 4 }));
    assert.match(html, /<div class="doc-tarjetas" aria-hidden="true"><article class="doc-tarjeta esqueleto-documento">/);
    assert.equal(contar(html, '<article class="doc-tarjeta esqueleto-documento">'), 4);
    assert.match(
      html,
      /<div class="doc-tarjeta-titulo"><h3 class="doc-tarjeta-nombre"><span class="esqueleto-barra" style="width:45%"><\/span><\/h3><span class="esqueleto-barra esqueleto-badge"><\/span><\/div><p class="doc-tarjeta-fechas"><span class="esqueleto-barra" style="width:35%"><\/span><\/p>/
    );
    assert.match(
      html,
      /<div class="doc-tarjeta-acciones"><span class="esqueleto-barra esqueleto-boton"><\/span><span class="esqueleto-barra esqueleto-boton"><\/span><\/div>/
    );
    assert.ok(!html.includes('listado-card'));
  });

  test('esqueleto de viajes: barra solo-mobile en el título', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'viajes', cantidad: 1 }));
    assert.match(html, /class="listado-card esqueleto-tarjeta esqueleto-viaje"/);
    assert.match(
      html,
      /<span class="listado-card-titulo"><span class="esqueleto-barra" style="width:55%"><\/span><span class="esqueleto-barra esqueleto-solo-mobile" style="width:40%"><\/span><\/span>/
    );
    // El pie no suma barras: en el celular, el CSS deja el primer dato al 100% y el
    // segundo baja a otra línea, como en la tarjeta real.
    assert.equal(contar(html, 'esqueleto-solo-mobile'), 1);
    const tarjetas = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'tarjetas' }));
    assert.ok(!tarjetas.includes('esqueleto-solo-mobile') && !tarjetas.includes('esqueleto-viaje'));
  });

  test('esqueleto de filas: las clases de las filas del Dashboard, con la cantidad pedida', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma: 'filas', cantidad: 2 }));
    assert.match(html, /<ul class="dashboard-lista" aria-hidden="true"><li><div class="dashboard-fila esqueleto-fila">/);
    assert.equal(contar(html, 'class="dashboard-fila esqueleto-fila"'), 2);
    assert.match(
      html,
      /<span class="hora-col"><span><span class="esqueleto-barra" style="width:40px"><\/span><\/span><small><span class="esqueleto-barra" style="width:32px"><\/span><\/small><\/span>/
    );
    assert.match(html, /<span class="dashboard-fila-titulo"><span class="esqueleto-barra" style="width:60%"><\/span><\/span>/);
    assert.match(html, /<span class="dashboard-fila-meta"><span class="esqueleto-barra" style="width:40%"><\/span><\/span>/);
    assert.equal(contar(html, 'esqueleto-badge'), 2);
    assert.ok(!html.includes('listado-card'));
  });

  test('ningún esqueleto usa alturas fijas en línea', () => {
    for (const forma of ['tarjetas', 'documentacion', 'documentos', 'viajes', 'filas']) {
      const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'esqueleto', forma }));
      assert.ok(!/height/.test(html), forma);
    }
  });

  test('lento: el colectivo reemplaza al esqueleto', () => {
    const html = renderToStaticMarkup(h(ContenidoCarga, { etapa: 'lento', forma: 'tarjetas' }));
    assert.match(html, /<span class="sr-only">Cargando…<\/span>/);
    assert.ok(!html.includes('esqueleto'));
    assert.match(html, /<div class="carga-colectivo"><div class="carga-colectivo-ruta"><span class="carga-colectivo-bus"><svg width="56" height="56"/);
    assert.match(html, /<span class="carga-colectivo-texto">Conectando con el servidor…<\/span>/);
    assert.match(html, /<span class="carga-colectivo-hint">Puede tardar unos segundos más\.<\/span>/);
  });

  test('variante chica del login: clase propia e ícono de 40px', () => {
    const html = renderToStaticMarkup(h(CargaColectivo, { chica: true }));
    assert.match(html, /^<div class="carga-colectivo carga-colectivo-chica">/);
    assert.match(html, /<svg width="40" height="40" aria-hidden="true"/);
  });

  test('CargaColectivo suma las clases que recibe (el colectivo único del Layout)', () => {
    const html = renderToStaticMarkup(h(CargaColectivo, { className: 'carga-colectivo-pagina' }));
    assert.match(html, /^<div class="carga-colectivo carga-colectivo-pagina">/);
    assert.match(html, /<svg width="56" height="56"/);
  });

  test('fuera de Layout y con aislado también arranca vacío', () => {
    assert.equal(
      renderToStaticMarkup(h(Cargando, { forma: 'filas', cantidad: 2, aislado: true })),
      '<div class="carga" role="status" aria-live="polite"></div>'
    );
  });
});
