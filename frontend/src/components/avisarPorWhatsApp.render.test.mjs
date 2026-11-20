// Botón "Avisar por WhatsApp" (SCRUM-250): el componente arma el link wa.me con
// encodeURIComponent sobre el texto de armarMensajeWhatsApp, y queda
// deshabilitado con el motivo visible si no se puede avisar. Se corre con
// `npm test` (node:test).

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
const { JSDOM } = require('jsdom');
const h = React.createElement;

let vite;
let AvisarPorWhatsApp;
let armarMensajeWhatsApp;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  AvisarPorWhatsApp = (await vite.ssrLoadModule('/src/components/AvisarPorWhatsApp.jsx')).default;
  ({ armarMensajeWhatsApp } = await vite.ssrLoadModule('/src/utils/whatsapp.js'));
});

after(() => vite.close());

const viajeBase = {
  id: 1,
  estado: 'PROGRAMADO',
  chofer: { id: 5, nombre: 'Ana', apellido: 'Pérez', telefono: '03571 15-612345' },
  vehiculo: { numeroInterno: '12', dominio: 'AE452KD' },
  cliente: { nombre: 'Pérez & Hijos #1' },
  origen: { id: 1, nombre: 'Río Tercero' },
  destino: { id: 2, nombre: 'Córdoba' },
  paradas: [{ orden: 1, ubicacion: { id: 3, nombre: 'Villa María / Bell Ville' } }],
  cantidadPasajeros: 45,
  fechaInicio: '2026-10-20T11:00:00.000Z',
  fechaFin: '2026-10-20T15:30:00.000Z',
};

function render(viaje, props = {}) {
  const html = renderToStaticMarkup(h(AvisarPorWhatsApp, { viaje, ...props }));
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('AvisarPorWhatsApp: el link', () => {
  test('va a wa.me con el teléfono normalizado y se abre en otra pestaña', () => {
    const enlace = render(viajeBase).querySelector('a');
    const url = new URL(enlace.getAttribute('href'));

    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/5493571612345');
    assert.equal(enlace.getAttribute('target'), '_blank');
    assert.equal(enlace.getAttribute('rel'), 'noopener noreferrer');
  });

  test('el texto viaja entero: acentos, &, #, / y saltos de línea quedan bien codificados', () => {
    const href = render(viajeBase).querySelector('a').getAttribute('href');
    const crudo = href.slice(href.indexOf('?text=') + '?text='.length);

    // Codificado con encodeURIComponent: nada de esto puede quedar suelto en el link
    // (el * de las negritas sí: es un carácter seguro en una URL).
    assert.ok(!/[\s&#/?=+áéíóúñ]/i.test(crudo), `quedaron caracteres sin codificar: ${crudo.slice(0, 80)}…`);
    assert.ok(crudo.includes('%0A'), 'los saltos de línea van como %0A');
    assert.ok(crudo.includes('%26'), 'el & va como %26');
    assert.ok(crudo.includes('%C3%B3'), 'la ó va en UTF-8');

    // Y se decodifica exactamente al mensaje armado.
    assert.equal(decodeURIComponent(crudo), armarMensajeWhatsApp(viajeBase));
    assert.equal(new URL(href).searchParams.get('text'), armarMensajeWhatsApp(viajeBase));
  });

  test('variante enlace (toast): el mismo link', () => {
    const doc = render(viajeBase, { variante: 'enlace' });
    assert.equal(
      doc.querySelector('a').getAttribute('href'),
      render(viajeBase).querySelector('a').getAttribute('href')
    );
  });
});

describe('AvisarPorWhatsApp: cuando no se puede avisar', () => {
  const CASOS = [
    ['sin chofer asignado', { ...viajeBase, chofer: null }, 'El viaje no tiene chofer asignado'],
    ['chofer sin teléfono', { ...viajeBase, chofer: { ...viajeBase.chofer, telefono: '' } }, 'El chofer no tiene teléfono cargado'],
    [
      'teléfono inválido',
      { ...viajeBase, chofer: { ...viajeBase.chofer, telefono: '612345' } },
      'El teléfono del chofer no tiene un formato válido. Corregilo en Usuarios.',
    ],
  ];

  for (const [nombre, viaje, motivo] of CASOS) {
    test(`${nombre}: botón deshabilitado, sin link y con el motivo visible`, () => {
      const doc = render(viaje);
      const boton = doc.querySelector('button');

      assert.equal(doc.querySelector('a'), null);
      assert.ok(boton.disabled);
      const idMotivo = boton.getAttribute('aria-describedby');
      assert.equal(doc.getElementById(idMotivo).textContent, motivo);
      assert.equal(boton.parentElement.getAttribute('title'), motivo);
    });

    test(`${nombre}: la variante enlace no muestra nada`, () => {
      assert.equal(renderToStaticMarkup(h(AvisarPorWhatsApp, { viaje, variante: 'enlace' })), '');
    });
  }
});
