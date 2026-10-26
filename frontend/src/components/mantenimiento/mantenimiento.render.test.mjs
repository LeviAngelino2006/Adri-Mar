// Smoke test de render de Mantenimiento: tarjetas de Service y del historial,
// modales de service y de detalle del registro, y formulario de arreglos. Se corre con `npm test`
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
let ModalDetalleRegistro;
let PestanaArreglos;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ TarjetaService, default: PestanaService } = await vite.ssrLoadModule('/src/components/mantenimiento/PestanaService.jsx'));
  ({ TarjetaRegistro } = await vite.ssrLoadModule('/src/components/mantenimiento/PestanaHistorial.jsx'));
  ModalRegistrarService = (await vite.ssrLoadModule('/src/components/mantenimiento/ModalRegistrarService.jsx')).default;
  ModalDetalleRegistro = (await vite.ssrLoadModule('/src/components/mantenimiento/ModalDetalleRegistro.jsx')).default;
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

  test('con plan: barra de avance con el porcentaje del intervalo recorrido', () => {
    const html = renderToStaticMarkup(h(TarjetaService, { item: itemProximo, onClick: () => {} }));
    assert.match(html, /class="service-barra" role="progressbar"/);
    assert.match(html, /aria-valuenow="96"/);
    assert.match(html, /width:96%/);
  });

  test('vencido: la barra queda llena; sin plan no hay barra', () => {
    const vencido = { ...itemProximo, estado: 'VENCIDO', porcentajeConsumido: 1.2 };
    assert.match(renderToStaticMarkup(h(TarjetaService, { item: vencido, onClick: () => {} })), /aria-valuenow="100"/);
    const sinPlan = { ...itemProximo, plan: null, estado: 'SIN_PLAN', kmProximoService: null, porcentajeConsumido: null };
    assert.doesNotMatch(renderToStaticMarkup(h(TarjetaService, { item: sinPlan, onClick: () => {} })), /progressbar/);
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

describe('TarjetaRegistro (historial)', () => {
  const base = registroBase;

  test('un arreglo: resumen clickeable, sin la lista de trabajos ni quién lo hizo', () => {
    let abierto = null;
    const registro = {
      ...base,
      tipo: 'ARREGLO',
      tiposArreglo: [
        { id: 1, nombre: 'Engrase' },
        { id: 4, nombre: 'Frenos' },
      ],
      descripcion: 'Pastillas',
      repuestos: 'Pastillas Bosch',
      responsable: 'Taller Gómez',
    };
    const elemento = h(TarjetaRegistro, { registro, onAbrir: (r) => (abierto = r) });
    const html = renderToStaticMarkup(elemento);
    assert.match(html, /^<button type="button" class="listado-card"/);
    assert.match(html, /class="listado-card-marca fecha-tile"/);
    assert.match(html, /<span class="sr-only">12 mar 2026: <\/span>/);
    assert.match(html, /estado-badge[^>]*>.*2 trabajos/);
    assert.match(texto(html), /Pastillas/);
    assert.doesNotMatch(texto(html), /Trabajos:|Repuestos|Hizo|Taller Gómez/);
    assert.match(texto(html), /57\.345 km/);
    assert.match(texto(html), /Registró: Ana Pérez/);
    assert.doesNotMatch(texto(html), /14 mar 2026/);
    elemento.type(elemento.props).props.onClick();
    assert.equal(abierto, registro);
  });

  test('sin usuario, el pie lleva solo el km', () => {
    const html = renderToStaticMarkup(h(TarjetaRegistro, { registro: { ...base, tipo: 'SERVICE', usuario: null } }));
    assert.doesNotMatch(texto(html), /Registró/);
    assert.match(texto(html), /57\.345 km/);
  });

  test('con 1 tipo el badge dice "1 trabajo"', () => {
    const tiposArreglo = [{ id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' }];
    const html = renderToStaticMarkup(h(TarjetaRegistro, { registro: { ...base, tipo: 'ARREGLO', tiposArreglo } }));
    assert.match(html, /estado-badge[^>]*>.*1 trabajo</);
    assert.match(texto(html), /Sin descripción/);
  });

  test('con 3 tipos el badge dice "3 trabajos" y lleva la lista en title', () => {
    const tiposArreglo = [
      { id: 1, nombre: 'Engrase', detalle: null },
      { id: 4, nombre: 'Frenos', detalle: null },
      { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' },
    ];
    const html = renderToStaticMarkup(h(TarjetaRegistro, { registro: { ...base, tipo: 'ARREGLO', tiposArreglo } }));
    assert.match(html, /estado-badge[^>]*>.*3 trabajos/);
    assert.match(html, /title="Engrase, Frenos, Cambio de espejo"/);
    assert.match(html, /historial-badge-tipos/);
  });

  test('un service lleva el badge de marca "Service"', () => {
    const html = renderToStaticMarkup(h(TarjetaRegistro, { registro: { ...base, tipo: 'SERVICE', tiposArreglo: [] } }));
    assert.match(html, /estado-badge-brand[^>]*>.*Service/);
    assert.match(texto(html), /Service completo/);
  });
});

describe('ModalDetalleRegistro', () => {
  // Pares de la grilla, en orden: [["Fecha del trabajo", "12 mar 2026"], …].
  const pares = (html) =>
    [...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(([, dt, dd]) => [texto(dt), texto(dd)]);

  test('un arreglo completo: todos los datos de a pares, en orden', () => {
    const html = renderToStaticMarkup(
      h(ModalDetalleRegistro, {
        registro: {
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
        },
        onClose: () => {},
      })
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, /<h2[^>]*>Arreglo<\/h2>/);
    assert.match(html, /<span class="patente">/);
    assert.deepEqual(pares(html), [
      ['Fecha del trabajo', '12 mar 2026'],
      ['Km del odómetro', '57.345 km'],
      ['Trabajos realizados', 'Engrase, Cambio de espejo'],
      ['Descripción', 'Pastillas delanteras'],
      ['Repuestos', 'Pastillas Bosch'],
      ['Observaciones', 'Revisar a los 60.000 km'],
      ['Hizo', 'Taller Gómez'],
      ['Registró', 'Ana Pérez'],
      ['Cargado el', '14 mar 2026'],
    ]);
  });

  test('un service: lo que incluye, sin "Hizo", y los vacíos en "No registrado"', () => {
    const html = renderToStaticMarkup(
      h(ModalDetalleRegistro, { registro: { ...registroBase, tipo: 'SERVICE', tiposArreglo: [], usuario: null }, onClose: () => {} })
    );
    assert.match(html, /<h2[^>]*>Service<\/h2>/);
    const datos = Object.fromEntries(pares(html));
    assert.match(datos.Incluye, /^Incluye cambio de aceite/);
    assert.equal(datos.Observaciones, 'No registrado');
    assert.equal(datos['Registró'], 'No registrado');
    assert.ok(!('Hizo' in datos));
    assert.ok(!('Repuestos' in datos));
    assert.doesNotMatch(html, /detalle-hueco/);
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
    // Los tipos se eligen con casillas (GrupoCasillas), no con un select. En SSR
    // la lista todavía no cargó, así que solo se ve el grupo.
    assert.match(html, /<fieldset[^>]*id="arreglo-tipos"/);
    assert.match(html, /<legend[^>]*>Trabajos realizados/);
    assert.doesNotMatch(html, /Elegí el tipo de trabajo/);
    // Responsable: catálogo "buscar o crear", no texto libre.
    assert.match(html, /<label for="arreglo-responsable">Responsable/);
    assert.match(html, /class="selector-buscar-crear"[^]*id="arreglo-responsable"[^>]*placeholder="Buscar o crear responsable…"/);
    assert.doesNotMatch(html, /Quién hizo el trabajo/);
    assert.match(html, /Registrar arreglo/);
    // Vehículo es obligatorio: "Elegí el vehículo" se ve, pero no se puede elegir
    // (no es una opción más de la lista). Mientras cargan los tipos, el grupo
    // muestra "Cargando…" como hint. Con los tipos cargados, ver
    // arreglosSelect.render.test.mjs.
    assert.match(html, /<option value="" disabled="" hidden="" selected="">Elegí el vehículo<\/option>/);
    assert.match(html, /<p id="arreglo-tipos-hint" class="form-field-hint">Cargando…<\/p>/);
    assert.doesNotMatch(html, /[Cc]osto/);
  });
});
