// Smoke test de render de Mantenimiento: tarjetas de Service y del historial,
// modal de service y formulario de arreglos. Se corre con `npm test`
// (node:test).
//
// Mismo método que documentacion.render.test.mjs: Vite en modo SSR carga los
// .jsx y se renderiza a HTML con react-dom/server. Verifica la estructura y los
// textos, NO los clicks ni los estilos.

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
const { MemoryRouter } = require('react-router-dom');
const h = React.createElement;

let vite;
let TarjetaService;
let PestanaService;
let TarjetaRegistro;
let ModalRegistrarService;
let PestanaArreglos;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ TarjetaService, default: PestanaService } = await vite.ssrLoadModule('/src/components/mantenimiento/PestanaService.jsx'));
  ({ TarjetaRegistro } = await vite.ssrLoadModule('/src/components/mantenimiento/PestanaHistorial.jsx'));
  ModalRegistrarService = (await vite.ssrLoadModule('/src/components/mantenimiento/ModalRegistrarService.jsx')).default;
  PestanaArreglos = (await vite.ssrLoadModule('/src/components/mantenimiento/PestanaArreglos.jsx')).default;
});

after(() => vite.close());

const vehiculo = {
  id: 7,
  numeroInterno: '12',
  dominio: 'AB123CD',
  marca: 'Mercedes-Benz',
  modelo: 'O500',
  kilometraje: 339200,
  tipoVehiculoId: 1,
  tipoVehiculo: 'Colectivo',
};

const itemProximo = {
  vehiculo,
  plantilla: { id: 1, intervaloKm: 20000, porcentajeAviso: 95 },
  plan: { id: 3, kmUltimoService: 320000 },
  estado: 'PROXIMO',
  kmProximoService: 340000,
  kmRestantes: 800,
  kmExcedidos: 0,
  kmDesdeService: 19200,
  porcentajeConsumido: 0.96,
};

const texto = (html) => html.replace(/<[^>]+>/g, '');

describe('TarjetaService', () => {
  test('título, badge, detalle y pie con el intervalo y el último service', () => {
    const html = renderToStaticMarkup(h(TarjetaService, { item: itemProximo, onClick: () => {} }));
    assert.match(html, /^<button type="button" class="listado-card"/);
    assert.match(html, /12 - <span class="patente">AB123CD<\/span>/);
    assert.match(html, /Próximo/);
    assert.match(texto(html), /Próximo service a los 340\.000 km · faltan 800 km/);
    assert.match(texto(html), /Colectivo · service cada 20\.000 km/);
    assert.match(texto(html), /Último: 320\.000 km/);
  });

  test('sin plan: badge "Sin plan" y el odómetro en el pie', () => {
    const sinPlan = { ...itemProximo, plan: null, estado: 'SIN_PLAN', kmProximoService: null };
    const html = texto(renderToStaticMarkup(h(TarjetaService, { item: sinPlan, onClick: () => {} })));
    assert.match(html, /Sin plan/);
    assert.match(html, /Odómetro: 339\.200 km/);
  });
});

describe('PestanaService', () => {
  test('la barra va como en Documentación: buscador y Filtros, y a la derecha Service | Arreglos | Historial', () => {
    const vistas = {
      opciones: [
        { valor: 'service', etiqueta: 'Service' },
        { valor: 'arreglos', etiqueta: 'Arreglos' },
        { valor: 'historial', etiqueta: 'Historial' },
      ],
      valor: 'service',
      onChange() {},
      ariaLabel: 'Vista de mantenimiento',
    };
    const carga = { cargando: false, error: null, datos: [itemProximo], recargar() {} };
    const html = renderToStaticMarkup(
      h(PestanaService, { carga, tiposVehiculo: [], vistas, onRegistrar() {}, onAsignar() {} })
    );
    const barra = html.slice(html.indexOf('class="listado-toolbar"'), html.indexOf('class="listado-cards"'));
    const orden = ['listado-buscar', 'filtros-toggle-btn', 'control-segmentado'].map((clase) => barra.indexOf(`class="${clase}`));
    assert.ok(orden.every((posicion) => posicion > 0));
    assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  });
});

describe('TarjetaRegistro (historial)', () => {
  const base = {
    id: 1,
    fecha: '2026-03-12T15:00:00.000Z',
    kilometraje: 57345,
    vehiculo,
    usuario: 'Ana Pérez',
    observaciones: null,
    descripcion: null,
    repuestos: null,
    responsable: null,
  };

  test('un arreglo: tarjeta de solo lectura, con el tipo, quién lo hizo y quién lo registró', () => {
    const html = renderToStaticMarkup(
      h(TarjetaRegistro, {
        registro: { ...base, tipo: 'ARREGLO', tipoArreglo: { id: 3, nombre: 'Frenos' }, descripcion: 'Pastillas', responsable: 'Taller Gómez' },
      })
    );
    assert.match(html, /^<div class="listado-card"/);
    assert.doesNotMatch(html, /<button/);
    assert.match(html, /class="listado-card-marca fecha-tile"/);
    assert.match(html, /<span class="sr-only">12 mar 2026: <\/span>/);
    assert.match(texto(html), /Frenos/);
    assert.match(texto(html), /57\.345 km · Hizo: Taller Gómez/);
    assert.match(texto(html), /Registró: Ana Pérez/);
  });

  test('un service lleva el badge de marca "Service"', () => {
    const html = renderToStaticMarkup(h(TarjetaRegistro, { registro: { ...base, tipo: 'SERVICE', tipoArreglo: null } }));
    assert.match(html, /estado-badge-brand[^>]*>.*Service/);
    assert.match(texto(html), /Service completo/);
  });
});

describe('ModalRegistrarService', () => {
  test('con el vehículo elegido: fecha, km con el odómetro actual y observación, con "Incluye…" de ayuda', () => {
    const html = renderToStaticMarkup(
      h(ModalRegistrarService, { vehiculos: [itemProximo], vehiculo: itemProximo, onClose: () => {}, onSuccess: () => {} })
    );
    assert.match(html, /Registrar service/);
    assert.doesNotMatch(html, /id="service-vehiculo"/);
    assert.match(html, /id="service-fecha"/);
    assert.match(html, /Odómetro actual: 339\.200 km/);
    // "Incluye" es el hint de la observación (texto gris de ayuda, enlazado al
    // textarea), en una oración: no una caja celeste con viñetas.
    assert.match(
      html,
      /<p id="service-observaciones-hint" class="form-field-hint">Incluye cambio de aceite, filtros de gasoil, aceite y habitáculo \(aire acondicionado\), alineado y balanceado y revisión general del motor\.<\/p>/
    );
    assert.match(html, /<textarea[^>]*aria-describedby="service-observaciones-hint"/);
    assert.doesNotMatch(html, /class="alert alert-info/);
    assert.doesNotMatch(html, /<ul/);
    // El service no tiene costo ni responsable, ni casillas para tildar.
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.doesNotMatch(html, /[Cc]osto/);
  });

  test('sin vehículo elegido pide el vehículo', () => {
    const html = renderToStaticMarkup(
      h(ModalRegistrarService, { vehiculos: [itemProximo], vehiculo: null, onClose: () => {}, onSuccess: () => {} })
    );
    assert.match(html, /id="service-vehiculo"/);
    assert.match(html, /12 - AB123CD · Mercedes-Benz O500/);
  });
});

describe('PestanaArreglos', () => {
  test('formulario con tipo de trabajo, quién lo hizo y sin costo', () => {
    const html = renderToStaticMarkup(
      h(
        MemoryRouter,
        null,
        h(PestanaArreglos, {
          cargaVehiculos: { datos: [itemProximo], cargando: false, error: null, recargar: () => {} },
          vistas: { opciones: [{ valor: 'arreglos', etiqueta: 'Arreglos' }], valor: 'arreglos', onChange: () => {}, ariaLabel: 'Vista' },
          onSuccess: () => {},
        })
      )
    );
    assert.match(html, /class="card form-card"|form-card/);
    assert.match(html, /Tipo de trabajo/);
    assert.match(html, /Quién hizo el trabajo/);
    assert.match(html, /Mecánico, chapista o taller/);
    assert.match(html, /Registrar arreglo/);
    // Vehículo y Tipo de trabajo son obligatorios: "Elegí…" (o "Cargando…") se ve,
    // pero no se puede elegir (no es una opción más de la lista). Con los tipos
    // cargados, ver arreglosSelect.render.test.mjs.
    assert.match(html, /<option value="" disabled="" hidden="" selected="">Elegí el vehículo<\/option>/);
    assert.match(html, /<option value="" disabled="" hidden="" selected="">Cargando…<\/option>/);
    assert.doesNotMatch(html, /[Cc]osto/);
  });
});
