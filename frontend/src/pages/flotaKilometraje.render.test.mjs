// Tests del kilometraje en el formulario de vehículo y de los avisos del backend
// después de guardar. Se corren con `npm test` (node:test).
//
// El bug: "Editar vehículo" dejaba cambiar el kilometraje, el backend lo ignoraba
// a propósito (lo llevan las lecturas del odómetro) y devolvía un aviso que el
// front no mostraba: la pantalla decía "Cambios guardados correctamente.". Se
// monta FlotaVehiculos con react-dom/client sobre jsdom y la API se reemplaza
// por un doble que registra lo que se manda.

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let api;
let MemoryRouter;
let AuthProvider;
let FlotaVehiculos;
let avisosDeRespuesta;
let contenedor;
let raiz;

const VEHICULO = {
  id: 4, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500', marcaId: 1, modeloId: 1,
  adquiridoUsado: false, anio: 2021, asientos: 50, kilometraje: 157345, estado: 'OPERATIVO', tipoVehiculoId: 1,
  tipoVehiculo: { id: 1, descripcion: 'Colectivo' }, creadoEn: '2026-03-01T12:00:00.000Z',
};
const AVISO_KM =
  'El kilometraje no se modifica desde este formulario; se gestiona como historial de lecturas del odómetro.';

// Lo que se manda al guardar, y lo que responde el backend (con o sin avisos).
const enviados = [];
let respuestaGuardado;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/vehiculos') return { data: { vehiculos: [VEHICULO] } };
    if (endpoint === '/tipos-vehiculo') return { data: { tiposVehiculo: [{ id: 1, descripcion: 'Colectivo' }] } };
    if (endpoint === '/marcas') return { data: { marcas: [{ id: 1, nombre: 'Mercedes-Benz' }] } };
    if (endpoint === '/marcas/1/modelos') return { data: { modelos: [{ id: 1, nombre: 'O500' }] } };
    return { data: { marcas: [], modelos: [] } };
  };
  api.put = async (endpoint, datos) => {
    enviados.push({ metodo: 'PUT', endpoint, datos });
    return { data: respuestaGuardado };
  };
  api.post = async (endpoint, datos) => {
    enviados.push({ metodo: 'POST', endpoint, datos });
    return { data: respuestaGuardado };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  FlotaVehiculos = (await vite.ssrLoadModule('/src/pages/FlotaVehiculos.jsx')).default;
  ({ avisosDeRespuesta } = await vite.ssrLoadModule('/src/utils/avisosRespuesta.js'));
});

after(() => vite.close());

beforeEach(async () => {
  enviados.length = 0;
  respuestaGuardado = { vehiculo: VEHICULO };
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem(
    'adrimar_usuario',
    JSON.stringify({ id: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false })
  );
  await act(async () => {
    raiz.render(h(MemoryRouter, { initialEntries: ['/vehiculos'] }, h(AuthProvider, null, h(FlotaVehiculos))));
  });
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);
const clic = (elemento) => act(async () => elemento.click());

function escribir(input, texto) {
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    asignarValue.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

// Espera a que pase el debounce de la búsqueda del selector y lleguen los resultados.
const esperarBusqueda = () => act(() => new Promise((resolver) => setTimeout(resolver, 400)));

async function elegirEnSelector(id, texto, opcion) {
  escribir(contenedor.querySelector(`#${id}`), texto);
  await esperarBusqueda();
  await clic(boton(opcion));
}

function elegirTipo(valor) {
  const select = contenedor.querySelector('select[name="tipoVehiculoId"]');
  act(() => {
    select.value = valor;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

async function abrirEdicion() {
  await clic(contenedor.querySelector('button.listado-card'));
  await clic(boton('Editar vehículo'));
}

describe('Editar vehículo: kilometraje de solo lectura', () => {
  test('no hay campo de kilometraje: se ve el actual y que lo llevan las lecturas del odómetro', async () => {
    await abrirEdicion();
    assert.equal(contenedor.querySelector('input[name="kilometraje"]'), null);
    const dato = contenedor.querySelector('.flota-dato-solo-lectura');
    assert.equal(dato?.textContent, '157.345 km');
    assert.ok(contenedor.textContent.includes('Se actualiza con las lecturas del odómetro'));
  });

  test('al guardar no se manda kilometraje', async () => {
    await abrirEdicion();
    await clic(boton('Guardar cambios'));
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].metodo, 'PUT');
    assert.ok(!('kilometraje' in enviados[0].datos), 'el PUT no tiene que llevar kilometraje');
    assert.equal(enviados[0].datos.dominio, 'AE452KD');
  });

  test('si la respuesta trae avisos se muestran junto al "guardado correctamente"', async () => {
    respuestaGuardado = { vehiculo: VEHICULO, avisos: { kilometraje: AVISO_KM } };
    await abrirEdicion();
    await clic(boton('Guardar cambios'));
    assert.ok(contenedor.textContent.includes('Cambios guardados correctamente.'));
    const aviso = contenedor.querySelector('.alert-warning');
    assert.equal(aviso?.textContent, AVISO_KM);
  });

  test('sin avisos no aparece ningún Alert de aviso', async () => {
    await abrirEdicion();
    await clic(boton('Guardar cambios'));
    assert.equal(contenedor.querySelector('.alert-warning'), null);
  });
});

describe('Crear vehículo: el kilometraje inicial sigue siendo editable', () => {
  test('el alta tiene el campo y lo manda', async () => {
    await clic(contenedor.querySelector('.listado-accion'));
    const input = contenedor.querySelector('input[name="kilometraje"]');
    assert.ok(input, 'falta el campo de kilometraje en el alta');
    // El resto completo y válido: el front valida todo antes de enviar.
    escribir(contenedor.querySelector('input[name="numeroInterno"]'), '30');
    escribir(contenedor.querySelector('input[name="dominio"]'), 'AB123CD');
    await elegirEnSelector('marcaId', 'Merc', 'Mercedes-Benz');
    await elegirEnSelector('modeloId', 'O5', 'O500');
    elegirTipo('1');
    escribir(contenedor.querySelector('input[name="anio"]'), '2020');
    escribir(contenedor.querySelector('input[name="asientos"]'), '45');
    escribir(input, '1200');
    await clic(boton('Crear vehículo'));
    assert.equal(enviados[0].metodo, 'POST');
    assert.equal(enviados[0].datos.kilometraje, '1200');
    // Sin cargar el último service va vacío: el backend usa el km de alta.
    assert.equal(enviados[0].datos.kmUltimoService, '');
  });

  test('el alta manda el km del último service si se carga', async () => {
    await clic(contenedor.querySelector('.listado-accion'));
    escribir(contenedor.querySelector('input[name="numeroInterno"]'), '30');
    escribir(contenedor.querySelector('input[name="dominio"]'), 'AB123CD');
    await elegirEnSelector('marcaId', 'Merc', 'Mercedes-Benz');
    await elegirEnSelector('modeloId', 'O5', 'O500');
    elegirTipo('1');
    escribir(contenedor.querySelector('input[name="anio"]'), '2020');
    escribir(contenedor.querySelector('input[name="asientos"]'), '45');
    escribir(contenedor.querySelector('input[name="kilometraje"]'), '150000');
    escribir(contenedor.querySelector('input[name="kmUltimoService"]'), '142000');
    await clic(boton('Crear vehículo'));
    assert.equal(enviados[0].datos.kmUltimoService, '142000');
  });

  test('al editar no aparece el km del último service ni se manda', async () => {
    await abrirEdicion();
    assert.equal(contenedor.querySelector('input[name="kmUltimoService"]'), null);
    await clic(boton('Guardar cambios'));
    assert.ok(!('kmUltimoService' in enviados[0].datos));
  });
});

describe('avisosDeRespuesta', () => {
  test('objeto { campo: mensaje }, lista, vacíos y sin avisos', () => {
    assert.deepEqual(avisosDeRespuesta({ avisos: { kilometraje: AVISO_KM } }), [AVISO_KM]);
    assert.deepEqual(avisosDeRespuesta({ avisos: ['Uno', '', '  ', 'Dos'] }), ['Uno', 'Dos']);
    assert.deepEqual(avisosDeRespuesta({ vehiculo: {} }), []);
    assert.deepEqual(avisosDeRespuesta(undefined), []);
  });
});
