// Smoke test de render de Mantenimiento: lista de vehículos (tarjetas y
// resumen de alertas), panel del vehículo (resumen, acciones y formularios),
// filas del historial y detalle del registro. Se corre con `npm test`
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
let ListaService;
let ItemHistorial;
let DetalleRegistro;
let FormularioService;
let FormularioArreglo;
let FormularioAsignarPlan;
let PanelVehiculoMantenimiento;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const cargar = async (archivo) => vite.ssrLoadModule(`/src/components/mantenimiento/${archivo}.jsx`);
  ({ TarjetaService, default: ListaService } = await cargar('ListaService'));
  ({ ItemHistorial } = await cargar('HistorialVehiculo'));
  DetalleRegistro = (await cargar('DetalleRegistro')).default;
  FormularioService = (await cargar('FormularioService')).default;
  FormularioArreglo = (await cargar('FormularioArreglo')).default;
  FormularioAsignarPlan = (await cargar('FormularioAsignarPlan')).default;
  PanelVehiculoMantenimiento = (await cargar('PanelVehiculoMantenimiento')).default;
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

const itemSinPlan = { ...itemProximo, plan: null, estado: 'SIN_PLAN', kmProximoService: null, porcentajeConsumido: null };

const texto = (html) => html.replace(/<[^>]+>/g, '');
const nada = () => {};

describe('TarjetaService', () => {
  test('título, badge, detalle y pie con el intervalo y el último service', () => {
    const html = renderToStaticMarkup(h(TarjetaService, { item: itemProximo, onClick: nada }));
    assert.match(html, /^<button type="button" class="listado-card"/);
    assert.match(html, /12 - <span class="patente">AB123CD<\/span>/);
    assert.match(html, /Próximo/);
    assert.match(texto(html), /Próximo service a los 340\.000 km · faltan 800 km/);
    assert.match(texto(html), /Colectivo · service cada 20\.000 km/);
    assert.match(texto(html), /Último: 320\.000 km/);
  });

  test('sin plan: badge "Sin plan" y el odómetro en el pie', () => {
    const html = texto(renderToStaticMarkup(h(TarjetaService, { item: itemSinPlan, onClick: nada })));
    assert.match(html, /Sin plan/);
    assert.match(html, /Odómetro: 339\.200 km/);
  });

  test('con plan: barra de avance con el porcentaje del intervalo recorrido', () => {
    const html = renderToStaticMarkup(h(TarjetaService, { item: itemProximo, onClick: nada }));
    assert.match(html, /class="service-barra" role="progressbar"/);
    assert.match(html, /aria-valuenow="96"/);
    assert.match(html, /width:96%/);
  });

  test('vencido: la barra queda llena; sin plan no hay barra', () => {
    const vencido = { ...itemProximo, estado: 'VENCIDO', porcentajeConsumido: 1.2 };
    assert.match(renderToStaticMarkup(h(TarjetaService, { item: vencido, onClick: nada })), /aria-valuenow="100"/);
    assert.doesNotMatch(renderToStaticMarkup(h(TarjetaService, { item: itemSinPlan, onClick: nada })), /progressbar/);
  });
});

describe('ListaService', () => {
  const carga = (datos) => ({ cargando: false, error: null, datos, recargar: nada });

  test('barra con buscador y Filtros, sin pestañas ni acción', () => {
    const html = renderToStaticMarkup(h(ListaService, { carga: carga([itemProximo]), tiposVehiculo: [], onAbrir: nada }));
    const barra = html.slice(html.indexOf('class="listado-toolbar"'), html.indexOf('class="listado-cards"'));
    assert.ok(barra.indexOf('class="listado-buscar') > 0);
    assert.ok(barra.indexOf('class="filtros-toggle-btn') > 0);
    assert.doesNotMatch(html, /control-segmentado/);
    assert.doesNotMatch(texto(html), /Arreglos|Historial/);
  });

  test('resumen de alertas de toda la flota arriba de la lista; sin alertas no se muestra', () => {
    const vencido = { ...itemProximo, vehiculo: { ...vehiculo, id: 8 }, estado: 'VENCIDO' };
    const html = renderToStaticMarkup(
      h(ListaService, { carga: carga([itemProximo, vencido, itemSinPlan]), tiposVehiculo: [], onAbrir: nada })
    );
    assert.match(html, /<p class="mantenimiento-resumen">1 vencido · 1 próximo<\/p>/);
    const sinAlertas = renderToStaticMarkup(h(ListaService, { carga: carga([itemSinPlan]), tiposVehiculo: [], onAbrir: nada }));
    assert.doesNotMatch(sinAlertas, /mantenimiento-resumen/);
  });
});

const registroBase = {
  id: 1,
  fecha: '2026-03-12T15:00:00.000Z',
  kilometraje: 57345,
  vehiculo,
  usuario: 'Ana Pérez',
  creadoEn: '2026-03-14T13:00:00.000Z',
  observaciones: null,
  descripcion: null,
  repuestos: null,
  responsable: null,
};

const arregloCompleto = {
  ...registroBase,
  tipo: 'ARREGLO',
  tiposArreglo: [
    { id: 1, nombre: 'Engrase', detalle: null },
    { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' },
  ],
  descripcion: 'Pastillas delanteras',
  repuestos: 'Pastillas Bosch',
  observaciones: 'Revisar a los 60.000 km',
  responsable: 'Taller Gómez',
};

describe('ItemHistorial (fila del historial del vehículo)', () => {
  test('cerrado: fecha, badge de trabajos, km y la descripción, sin el detalle', () => {
    const html = renderToStaticMarkup(h(ItemHistorial, { registro: arregloCompleto, abierto: false, onAlternar: nada }));
    assert.match(html, /<button type="button" class="historial-item-fila" aria-expanded="false" aria-controls="[^"]+"/);
    assert.match(texto(html), /12 mar 2026/);
    assert.match(html, /estado-badge[^>]*>.*2 trabajos/);
    assert.match(html, /title="Engrase, Cambio de espejo"/);
    assert.match(texto(html), /57\.345 km/);
    assert.match(texto(html), /Pastillas delanteras/);
    assert.doesNotMatch(html, /detalle-grid/);
  });

  test('abierto: aria-expanded y el detalle completo debajo, con el id que nombra aria-controls', () => {
    const html = renderToStaticMarkup(h(ItemHistorial, { registro: arregloCompleto, abierto: true, onAlternar: nada }));
    assert.match(html, /aria-expanded="true"/);
    const [, controla] = html.match(/aria-controls="([^"]+)"/);
    assert.match(html, new RegExp(`<dl id="${controla}" class="detalle-grid">`));
    assert.match(texto(html), /Taller Gómez/);
  });

  test('un service lleva el badge de marca "Service" y "Service completo"', () => {
    const html = renderToStaticMarkup(
      h(ItemHistorial, { registro: { ...registroBase, tipo: 'SERVICE', tiposArreglo: [] }, abierto: false, onAlternar: nada })
    );
    assert.match(html, /estado-badge-brand[^>]*>.*Service/);
    assert.match(texto(html), /Service completo/);
  });
});

describe('DetalleRegistro', () => {
  // Pares de la grilla, en orden: [["Fecha del trabajo", "12 mar 2026"], …].
  const pares = (html) =>
    [...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(([, dt, dd]) => [texto(dt), texto(dd)]);

  test('un arreglo completo: todos los datos de a pares, en orden', () => {
    const html = renderToStaticMarkup(h(DetalleRegistro, { registro: arregloCompleto }));
    assert.deepEqual(pares(html), [
      ['Fecha del trabajo', '12 mar 2026'],
      ['Km del odómetro', '57.345 km'],
      ['Trabajos realizados', 'Engrase, Cambio de espejo'],
      ['Descripción', 'Pastillas delanteras'],
      ['Repuestos', 'Pastillas Bosch'],
      ['Hizo', 'Taller Gómez'],
      ['Registró', 'Ana Pérez'],
      ['Cargado el', '14 mar 2026'],
    ]);
  });

  test('un service: lo que incluye, sin "Hizo", y los vacíos en "No registrado"', () => {
    const html = renderToStaticMarkup(
      h(DetalleRegistro, { registro: { ...registroBase, tipo: 'SERVICE', tiposArreglo: [], usuario: null } })
    );
    const datos = Object.fromEntries(pares(html));
    assert.match(datos.Incluye, /^Incluye: Cambio de aceite \+ /);
    assert.equal(datos.Observaciones, 'No registrado');
    assert.equal(datos['Registró'], 'No registrado');
    assert.ok(!('Hizo' in datos));
    assert.ok(!('Repuestos' in datos));
    assert.doesNotMatch(html, /detalle-hueco/);
  });

  test('un arreglo no muestra observaciones; si uno viejo solo tiene eso, va como descripción', () => {
    const arreglo = { ...registroBase, tipo: 'ARREGLO', tiposArreglo: [], observaciones: 'Revisar a los 60.000 km' };
    const datos = Object.fromEntries(pares(renderToStaticMarkup(h(DetalleRegistro, { registro: arreglo }))));
    assert.ok(!('Observaciones' in datos));
    assert.equal(datos['Descripción'], 'Revisar a los 60.000 km');
  });
});

describe('PanelVehiculoMantenimiento', () => {
  const panel = (item) =>
    renderToStaticMarkup(h(MemoryRouter, null, h(PanelVehiculoMantenimiento, { item, onClose: nada, onGuardado: nada })));

  test('con plan: el vehículo de título, su estado y barra, "Registrar service", "Registrar arreglo" e historial', () => {
    const html = panel(itemProximo);
    assert.match(html, /<aside class="panel-lateral" role="dialog" aria-modal="true"/);
    assert.match(html, /<h2[^>]*>12 - <span class="patente">AB123CD<\/span><\/h2>/);
    assert.match(texto(html), /Mercedes-Benz O500/);
    assert.match(texto(html), /Próximo service a los 340\.000 km · faltan 800 km/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /class="btn btn-primary[^"]*"[^>]*><span>Registrar service</);
    assert.match(html, /class="btn btn-secondary[^"]*"[^>]*><span>Registrar arreglo</);
    assert.doesNotMatch(texto(html), /Asignar plan/);
    assert.match(html, /<h3[^>]*>Historial<\/h3>/);
    // En el resumen no hay "← Volver": es el primer nivel del panel.
    assert.doesNotMatch(html, /← Volver/);
  });

  test('sin plan: "Asignar plan de service" en lugar de "Registrar service", y sin barra', () => {
    const html = panel(itemSinPlan);
    assert.match(html, /class="btn btn-primary[^"]*"[^>]*><span>Asignar plan de service</);
    assert.doesNotMatch(texto(html), /Registrar service/);
    assert.match(texto(html), /Registrar arreglo/);
    assert.doesNotMatch(html, /progressbar/);
  });
});

describe('FormularioService', () => {
  test('fecha, km con el odómetro actual y observación, con "Incluye…" de ayuda; sin vehículo para elegir', () => {
    const html = renderToStaticMarkup(h(FormularioService, { item: itemProximo, onCancel: nada, onSuccess: nada }));
    assert.doesNotMatch(html, /<select/);
    assert.match(html, /id="service-fecha"/);
    assert.match(html, /Odómetro actual: 339\.200 km/);
    // "Incluye" es la ayuda de la observación: un tooltip junto al label, con el
    // texto enlazado al textarea; en una oración, no una caja celeste con viñetas.
    assert.match(
      html,
      /<span id="service-observaciones-ayuda" class="sr-only">Incluye: Cambio de aceite \+ Filtros de gasoil, aceite y habitáculo \(aire acondicionado\) \+ Alineado y balanceado \+ Revisión general del motor\.<\/span>/
    );
    assert.match(html, /<textarea[^>]*aria-describedby="service-observaciones-ayuda"/);
    assert.doesNotMatch(html, /class="alert alert-info/);
    assert.doesNotMatch(html, /<ul/);
    // El service no tiene costo ni responsable, ni casillas para tildar.
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.doesNotMatch(html, /[Cc]osto/);
    assert.match(html, /type="submit"[^>]*><span>Registrar service</);
    assert.match(texto(html), /Cancelar/);
  });
});

describe('FormularioArreglo', () => {
  test('sin select de vehículo, con el odómetro del vehículo, tipos en casillas, responsable y sin costo', () => {
    const html = renderToStaticMarkup(h(FormularioArreglo, { vehiculo, onCancel: nada, onSuccess: nada }));
    assert.equal(html.match(/<select/g), null);
    assert.doesNotMatch(html, /Elegí el vehículo/);
    assert.match(html, /Odómetro actual: 339\.200 km/);
    // Los tipos se eligen con casillas (GrupoCasillas). En SSR la lista todavía
    // no cargó, así que solo se ve el grupo con "Cargando…".
    assert.match(html, /<fieldset[^>]*id="arreglo-tipos"/);
    assert.match(html, /<legend[^>]*>Trabajos realizados/);
    assert.match(html, /<p id="arreglo-tipos-hint" class="form-field-hint">Cargando…<\/p>/);
    // Responsable: catálogo "buscar o crear", no texto libre.
    assert.match(html, /class="selector-buscar-crear"[^]*id="arreglo-responsable"[^>]*placeholder="Buscar o crear responsable…"/);
    assert.match(html, /type="submit"[^>]*><span>Registrar arreglo</);
    assert.doesNotMatch(html, /[Cc]osto/);
  });
});

describe('FormularioAsignarPlan', () => {
  test('el intervalo de la plantilla y el km del último service con el odómetro por defecto', () => {
    const html = renderToStaticMarkup(h(FormularioAsignarPlan, { item: itemSinPlan, onCancel: nada, onSuccess: nada }));
    assert.match(texto(html), /Colectivo: service cada 20\.000 km\./);
    assert.match(html, /id="plan-km-ultimo"[^>]*value="339200"|value="339200"[^>]*id="plan-km-ultimo"/);
    assert.match(html, /type="submit"[^>]*><span>Asignar plan</);
  });
});
