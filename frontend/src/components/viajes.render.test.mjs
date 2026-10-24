// Smoke test de render de la tarjeta de viaje del listado (agrupado por día,
// con el badge de pendiente administrativo), del formulario de alta (sin datos
// administrativos, y precargado al duplicar), del botón "Duplicar viaje" y de los
// paneles del Dashboard (Viajes de hoy y estados vacíos). Se corre con `npm test` (node:test).
//
// Mismo método que confirmarViaje.render.test.mjs: Vite en modo SSR carga los
// .jsx y se renderiza a HTML con react-dom/server. Verifica la estructura, NO los
// clicks ni los estilos.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
let ListadoViajesPorDia;
let ViajeForm;
let DuplicarViaje;
let valoresParaDuplicar;
let ContenidoViajesDeHoy;
let ContenidoPorConfirmar;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const moduloTarjeta = await vite.ssrLoadModule('/src/components/TarjetaViaje.jsx');
  TarjetaViaje = moduloTarjeta.default;
  ListadoViajesPorDia = moduloTarjeta.ListadoViajesPorDia;
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  DuplicarViaje = (await vite.ssrLoadModule('/src/components/DuplicarViaje.jsx')).default;
  ({ valoresParaDuplicar } = await vite.ssrLoadModule('/src/utils/valoresFormViaje.js'));
  ({ ContenidoViajesDeHoy } = await vite.ssrLoadModule('/src/components/PanelViajesDeHoy.jsx'));
  ({ ContenidoPorConfirmar } = await vite.ssrLoadModule('/src/components/PanelViajesPorConfirmar.jsx'));
});

after(() => vite.close());

// Hora de Córdoba = UTC - 3. "Ahora" = viernes 9/10/2026 12:00 en Córdoba.
const AHORA = Date.parse('2026-10-09T15:00:00Z');
// Lo que devuelve useCarga con los datos ya cargados.
const CARGA_LISTA = { cargando: false, error: null, recargar() {} };

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

describe('RutaViaje resumen: corte prolijo en pantallas chicas', () => {
  let RutaViaje;
  before(async () => {
    RutaViaje = (await vite.ssrLoadModule('/src/components/RutaViaje.jsx')).default;
  });
  const NBSP = String.fromCharCode(0xa0);
  const ruta = (props) => sinEtiquetas(renderToStaticMarkup(h(RutaViaje, props)));
  const lugar = (nombre) => ({ nombre });

  test('la flecha va pegada al destino: no puede quedar al final de una línea', () => {
    const texto = ruta({ origen: lugar('Río Tercero'), destino: lugar('Aeropuerto Internacional Ingeniero Taravella') });
    assert.equal(texto, `Río Tercero →${NBSP}Aeropuerto Internacional Ingeniero Taravella`);
  });

  test('"· 1 parada" va pegada a la última palabra del destino: no puede quedar sola', () => {
    const texto = ruta({
      origen: lugar('Río Tercero'),
      destino: lugar('Villa General Belgrano'),
      paradas: [{ orden: 1, ubicacion: lugar('Embalse') }],
    });
    assert.equal(texto, `Río Tercero →${NBSP}Villa General Belgrano${NBSP}·${NBSP}1 parada`);
  });

  test('la tarjeta de viaje lleva listado-card-viaje (badge arriba de la ruta si es angosta); las demás no', async () => {
    assert.match(renderToStaticMarkup(h(TarjetaViaje, { viaje: viaje(), onClick() {} })), /class="listado-card listado-card-viaje"/);
    const { ListadoCard } = await vite.ssrLoadModule('/src/components/Listado.jsx');
    const html = renderToStaticMarkup(h(ListadoCard, { titulo: '2 - AB123CD', sub: 'Mercedes-Benz O500', pie: [], onClick() {} }));
    assert.match(html, /^<button type="button" class="listado-card">/);
  });
});

describe('TarjetaViaje: cliente', () => {
  const render = (props) => renderToStaticMarkup(h(TarjetaViaje, { onClick() {}, ...props }));
  const CLIENTE = { id: 3, nombre: 'Colegio Nacional de Monserrat' };

  test('con mostrarCliente, el cliente va en gris debajo de la ruta (antes del horario), sin badge', () => {
    const html = render({ viaje: viaje({ cliente: CLIENTE }), mostrarCliente: true });
    assert.match(
      html,
      /<\/div><div class="listado-card-bajada">Colegio Nacional de Monserrat<\/div><div class="listado-card-sub">/
    );
    assert.equal(html.match(/estado-badge /g).length, 1, 'solo el badge de estado');
  });

  test('sin mostrarCliente (Mis viajes) no se muestra aunque el dato venga', () => {
    const html = render({ viaje: viaje({ cliente: CLIENTE }) });
    assert.ok(!html.includes('listado-card-bajada'));
    assert.ok(!html.includes('Monserrat'));
  });

  test('un viaje sin cliente no agrega la línea', () => {
    assert.ok(!render({ viaje: viaje({ cliente: null }), mostrarCliente: true }).includes('listado-card-bajada'));
  });

  test('ListadoViajesPorDia pasa mostrarCliente a cada tarjeta, también a las de En curso y Sin cerrar', () => {
    const props = {
      viajes: [viaje({ id: 1, cliente: CLIENTE })],
      enCurso: [viaje({ id: 2, estado: 'EN_VIAJE', cliente: { id: 4, nombre: 'Turismo Sierras SRL' } })],
      sinCerrar: [viaje({ id: 3, cliente: { id: 5, nombre: 'Club Atlético Talleres' } })],
      onSeleccionar() {},
    };
    const con = sinEtiquetas(renderToStaticMarkup(h(ListadoViajesPorDia, { ...props, mostrarCliente: true })));
    assert.match(con, /Club Atlético Talleres[\s\S]*Turismo Sierras SRL[\s\S]*Colegio Nacional de Monserrat/);
    assert.ok(!renderToStaticMarkup(h(ListadoViajesPorDia, props)).includes('listado-card-bajada'));
  });
});

describe('TarjetaViaje: pendiente administrativo', () => {
  const render = (props) => renderToStaticMarkup(h(TarjetaViaje, { onClick() {}, ...props }));

  test('con mostrarPendientes, SIN_PRECIO da el badge "Sin precio" en el detalle', () => {
    const html = render({ viaje: viaje({ pendienteAdministrativo: 'SIN_PRECIO' }), mostrarPendientes: true });
    assert.match(
      html,
      /class="listado-card-detalle"><span class="estado-badge estado-badge-warning estado-badge-sm">.*Sin precio<\/span><\/div>/
    );
  });

  test('con mostrarPendientes, COBRO_PENDIENTE da el badge "Cobro pendiente"', () => {
    const html = render({ viaje: viaje({ pendienteAdministrativo: 'COBRO_PENDIENTE' }), mostrarPendientes: true });
    assert.match(sinEtiquetas(html), /Cobro pendiente/);
    assert.ok(!html.includes('Sin precio'));
  });

  test('sin pendiente (null) no hay detalle', () => {
    const html = render({ viaje: viaje({ pendienteAdministrativo: null }), mostrarPendientes: true });
    assert.ok(!html.includes('listado-card-detalle'));
  });

  test('perfil sin permiso: el backend no manda la clave y no se muestra nada aunque la prop venga en true', () => {
    const html = render({ viaje: viaje(), mostrarPendientes: true });
    assert.ok(!html.includes('listado-card-detalle'));
  });

  test('sin mostrarPendientes (Mis viajes) no se muestra aunque el dato venga', () => {
    const html = render({ viaje: viaje({ pendienteAdministrativo: 'SIN_PRECIO' }) });
    assert.ok(!html.includes('Sin precio'));
    assert.ok(!html.includes('listado-card-detalle'));
  });

  test('ListadoViajesPorDia pasa mostrarPendientes a cada tarjeta', () => {
    const viajes = [viaje({ id: 1, pendienteAdministrativo: 'SIN_PRECIO' }), viaje({ id: 2, pendienteAdministrativo: 'COBRO_PENDIENTE' })];
    const con = renderToStaticMarkup(h(ListadoViajesPorDia, { viajes, mostrarPendientes: true, onSeleccionar() {} }));
    const sin = renderToStaticMarkup(h(ListadoViajesPorDia, { viajes, onSeleccionar() {} }));
    assert.match(sinEtiquetas(con), /Sin precio[\s\S]*Cobro pendiente/);
    assert.ok(!sin.includes('estado-badge-warning'));
  });
});

describe('ViajeForm de alta', () => {
  test('solo datos operativos: cliente sí, ningún campo ni sección administrativa', () => {
    const html = renderToStaticMarkup(
      // conDatosAdministrativos es la prop con la que Viajes.jsx pedía la sección
      // antes: si alguien la vuelve a pasar, el alta igual queda sin ella.
      h(ViajeForm, { onSubmit() {}, textoBoton: 'Crear viaje', textoEnviando: 'Creando…', onCancelar() {}, conDatosAdministrativos: true })
    );
    assert.match(html, /id="clienteId"/);
    assert.match(html, /id="fechaInicio"/);
    for (const campo of ['precio', 'pagoChofer', 'estadoPagoClienteId', 'metodoPagoClienteId', 'fechaPagoCliente']) {
      assert.ok(!html.includes(`name="${campo}"`), `no debería estar el campo ${campo}`);
    }
    assert.ok(!/Datos administrativos/i.test(html));
    assert.ok(!html.includes('form-seccion'));
  });
});

describe('Duplicar viaje', () => {
  const ESTADOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
  const render = (perfil, estado) =>
    renderToStaticMarkup(h(DuplicarViaje, { viaje: viaje({ estado }), perfil, onDuplicar() {} }));

  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil} ve el botón en todos los estados, en su propia fila`, () => {
      for (const estado of ESTADOS) {
        assert.equal(
          render(perfil, estado),
          '<div class="viajes-detalle-actions"><button type="button" class="btn btn-secondary"><span>Duplicar viaje</span></button></div>',
          estado
        );
      }
    });
  }

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil} no lo ve en ningún estado`, () => {
      for (const estado of ESTADOS) assert.equal(render(perfil, estado), '', estado);
    });
  }

  const original = () =>
    viaje({
      estado: 'FINALIZADO',
      clienteId: 3,
      cliente: { id: 3, nombre: 'Colegio San José' },
      origenId: 10,
      origen: { id: 10, nombre: 'Río Tercero' },
      destinoId: 20,
      destino: { id: 20, nombre: 'Córdoba' },
      paradas: [
        { orden: 1, ubicacion: { id: 31, nombre: 'Almafuerte' } },
        { orden: 2, ubicacion: { id: 32, nombre: 'Despeñaderos' } },
      ],
      cantidadPasajeros: 45,
      choferId: 115,
      vehiculoId: 4,
      choferesCandidatos: [{ id: 115, nombre: 'Martín', apellido: 'Gómez' }],
      vehiculosCandidatos: [{ id: 4, numeroInterno: 12, dominio: 'AE452KD' }],
      precio: '420000.00',
    });

  // Las mismas props que arma Viajes.jsx al duplicar: sin estadoActual ni
  // candidatosActuales, como un alta.
  const renderDuplicado = (ahora) =>
    renderToStaticMarkup(
      h(ViajeForm, {
        valoresIniciales: valoresParaDuplicar(original(), ahora),
        onSubmit() {},
        textoBoton: 'Crear viaje',
        textoEnviando: 'Creando…',
        onCancelar() {},
      })
    );

  test('el formulario abre en modo alta, precargado con el recorrido y sin pasajeros ni unidad', () => {
    // Mismo día, antes de la salida (06:00 en Córdoba): las fechas se copian.
    const html = renderDuplicado(Date.parse('2026-10-09T09:00:00Z'));
    // Modo alta: choferes y vehículos POSIBLES (vacíos), no el select de un chofer.
    assert.match(html, /id="choferesCandidatos"/);
    assert.match(html, /id="vehiculosCandidatos"/);
    assert.ok(!html.includes('name="choferId"'));
    assert.ok(!html.includes('name="vehiculoId"'));
    assert.ok(!html.includes('Martín'));
    assert.ok(!html.includes('AE452KD'));
    // Copiado: cliente, recorrido en orden, fechas y km.
    assert.match(html, /value="Colegio San José"/);
    assert.match(html, /value="Río Tercero"[\s\S]*value="Almafuerte"[\s\S]*value="Despeñaderos"[\s\S]*value="Córdoba"/);
    assert.match(html, /name="fechaInicio" value="2026-10-09T07:30"/);
    assert.match(html, /name="fechaFin" value="2026-10-09T10:00"/);
    assert.match(html, /name="kilometrosEstimados"[^>]*value="110"/);
    // Vacío: pasajeros y nada administrativo.
    assert.match(html, /name="cantidadPasajeros"[^>]*value=""/);
    assert.ok(!html.includes('420000'));
    assert.match(html, /<span>Crear viaje<\/span>/);
  });

  test('si el original ya salió, las fechas aparecen vacías y lo demás igual', () => {
    const html = renderDuplicado(AHORA);
    assert.match(html, /name="fechaInicio" value=""/);
    assert.match(html, /name="fechaFin" value=""/);
    assert.match(html, /value="Río Tercero"[\s\S]*value="Almafuerte"[\s\S]*value="Despeñaderos"[\s\S]*value="Córdoba"/);
    assert.match(html, /name="kilometrosEstimados"[^>]*value="110"/);
  });
});

describe('ContenidoViajesDeHoy', () => {
  const render = (props) =>
    renderToStaticMarkup(
      h(ContenidoViajesDeHoy, { carga: CARGA_LISTA, viajes: [], ahora: AHORA, onAbrir() {}, ...props })
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
    assert.match(render({ carga: { ...CARGA_LISTA, cargando: true } }), /<div class="carga" role="status" aria-live="polite"><\/div>/);
    const conError = render({ carga: { ...CARGA_LISTA, error: new Error('Network Error') } });
    assert.match(conError, /No pudimos cargar los viajes de hoy\. Revisá tu conexión\./);
    assert.match(conError, />Reintentar</);
    assert.ok(!conError.includes('No hay viajes para hoy'), 'un error no se muestra como vacío');
    assert.match(render({}), /class="dashboard-empty">No hay viajes para hoy</);
  });
});

describe('estados vacíos del Dashboard', () => {
  test('Viajes por confirmar: solo texto, igual que Viajes de hoy', () => {
    const html = renderToStaticMarkup(
      h(ContenidoPorConfirmar, { carga: CARGA_LISTA, hoy: [], manana: [], onConfirmar() {} })
    );
    assert.equal(html, '<div class="dashboard-empty">Nada pendiente para hoy ni mañana</div>');
  });

  // Tus viajes pendientes y Documentación viven dentro de Dashboard.jsx y no se
  // exportan: se revisa el fuente de cada bloque .dashboard-empty.
  test('Tus viajes pendientes y Documentación no llevan ícono', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'src/pages/Dashboard.jsx'), 'utf8');
    const bloques = fuente.match(/<div className="dashboard-empty">[\s\S]*?<\/div>/g) || [];
    assert.equal(bloques.length, 2);
    assert.match(bloques[0], />No tenés viajes pendientes</);
    assert.match(bloques[1], /Sin alertas por ahora[\s\S]*dashboard-empty-hint/);
    for (const bloque of bloques) assert.ok(!/<svg|ICONO_/.test(bloque), bloque);
  });
});
