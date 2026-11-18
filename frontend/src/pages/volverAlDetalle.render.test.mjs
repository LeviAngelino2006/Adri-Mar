// Tests de a dónde vuelve el formulario de alta / edición (SCRUM-263). Se corren
// con `npm test` (node:test).
//
// Flota, Viajes, Personal y Usuarios alternan listado / ficha / formulario en una
// sola ruta. Antes, "Editar" desde una ficha cerraba la ficha y al cancelar o
// guardar se volvía al listado. La regla ahora (useOrigenEdicion):
//  - editar desde la ficha → cancelar o guardar vuelve a ESA ficha (al guardar,
//    con los datos que devolvió el PUT);
//  - alta → cancelar vuelve al listado; guardar abre la ficha del registro nuevo;
//  - el link de arriba del formulario dice a dónde vuelve.
// Se monta cada página con react-dom/client sobre jsdom y la API se reemplaza
// por un doble.

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
let MemoryRouter;
let AuthProvider;
const paginas = {};
let contenedor;
let raiz;

// --- Datos con la forma que devuelve el backend ------------------------------------

const VEHICULO = {
  id: 4, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500', marcaId: 1, modeloId: 1,
  adquiridoUsado: false, anio: 2021, asientos: 50, kilometraje: 157345, estado: 'OPERATIVO', tipoVehiculoId: 1,
  tipoVehiculo: { id: 1, descripcion: 'Colectivo' }, creadoEn: '2026-03-01T12:00:00.000Z',
};
const VEHICULO_NUEVO = { ...VEHICULO, id: 9, numeroInterno: '30', dominio: 'AB123CD', anio: 2020, asientos: 45 };

const PERSONA = {
  id: 7, nombre: 'Martín', apellido: 'Gómez', dni: '30111222', email: '', telefono: '3571 111111',
  perfil: 'CHOFER', habilitadoParaConducir: true, activo: true, usuario: null, creadoEn: '2026-03-01T12:00:00.000Z',
};
const PERSONA_NUEVA = {
  ...PERSONA, id: 8, nombre: 'Lucía', apellido: 'Ramos', dni: '40222333', telefono: '', perfil: 'PERSONAL_TALLER',
  habilitadoParaConducir: false,
};

const USUARIO = {
  id: 3, personaId: 7, nombreUsuario: 'mgomez', nombre: 'Martín', apellido: 'Gómez', dni: '30111222', email: '',
  telefono: '', perfil: 'CHOFER', habilitadoParaConducir: true, activo: true, creadoEn: '2026-03-01T12:00:00.000Z',
};

const EN_DOS_DIAS = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const VIAJE = {
  id: 40, estado: 'A_CONFIRMAR', choferId: null, chofer: null, vehiculoId: null, vehiculo: null,
  origenId: 1, origen: { id: 1, nombre: 'Río Tercero' }, destinoId: 2, destino: { id: 2, nombre: 'Córdoba' },
  paradas: [], clienteId: 1, cliente: { id: 1, nombre: 'Colegio San José' }, fechaInicio: EN_DOS_DIAS, fechaFin: null,
  kilometrosEstimados: null, cantidadPasajeros: null, choferesCandidatos: [], vehiculosCandidatos: [],
  pendienteAdministrativo: null,
};
const VIAJE_NUEVO = { ...VIAJE, id: 41 };

// --- Doble de la API ------------------------------------------------------------------

// Lo que se manda al guardar y lo que responde el backend, por suite.
const enviados = [];
let respuestas;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    switch (endpoint) {
      case '/vehiculos':
        return { data: { vehiculos: [VEHICULO] } };
      case '/tipos-vehiculo':
        return { data: { tiposVehiculo: [{ id: 1, descripcion: 'Colectivo' }] } };
      case '/marcas':
        return { data: { marcas: [{ id: 1, nombre: 'Mercedes-Benz' }] } };
      case '/marcas/1/modelos':
        return { data: { modelos: [{ id: 1, nombre: 'O500' }] } };
      case '/personas':
        return { data: { personas: [PERSONA] } };
      case '/usuarios':
        return { data: { usuarios: [USUARIO] } };
      case '/viajes':
        return { data: { viajes: [VIAJE] } };
      case '/usuarios/disponibles-chofer':
        return { data: { usuarios: [] } };
      case '/documentos/alertas':
        return { data: { totalAlertas: 0, vencidos: 0, porVencer: 0, documentos: [] } };
      default:
        return { data: {} };
    }
  };
  api.put = async (endpoint, datos) => {
    enviados.push({ metodo: 'PUT', endpoint, datos });
    return { data: respuestas.put };
  };
  api.post = async (endpoint, datos) => {
    enviados.push({ metodo: 'POST', endpoint, datos });
    return { data: respuestas.post };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  for (const nombre of ['FlotaVehiculos', 'Viajes', 'Personal', 'Usuarios']) {
    paginas[nombre] = (await vite.ssrLoadModule(`/src/pages/${nombre}.jsx`)).default;
  }
});

after(() => vite.close());

async function montar(nombre, ruta) {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  await act(async () => {
    raiz.render(h(MemoryRouter, { initialEntries: [ruta] }, h(AuthProvider, null, h(paginas[nombre]))));
  });
}

beforeEach(() => {
  enviados.length = 0;
  respuestas = {};
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem(
    'adrimar_usuario',
    JSON.stringify({ id: 1, personaId: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false })
  );
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

// --- Helpers --------------------------------------------------------------------------

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);
const clic = (elemento) => act(async () => elemento.click());
const linkVolver = () => contenedor.querySelector('.back-link')?.textContent;
const titulo = () => contenedor.querySelector('h1')?.textContent;
const enFicha = () => Boolean(contenedor.querySelector('[role="region"][aria-label^="Ficha"]'));
const enListado = () => Boolean(contenedor.querySelector('.listado-cards'));
const enFormulario = () => Boolean(contenedor.querySelector('form.form-card, .form-card form'));

function escribir(input, texto) {
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    asignarValue.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

function elegir(nombre, valor) {
  const select = contenedor.querySelector(`select[name="${nombre}"]`);
  act(() => {
    select.value = valor;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

const esperar = (ms) => act(() => new Promise((resolver) => setTimeout(resolver, ms)));

async function elegirEnSelector(id, texto, opcion) {
  escribir(contenedor.querySelector(`#${id}`), texto);
  await esperar(400);
  await clic(boton(opcion));
}

// --- Flota ----------------------------------------------------------------------------

describe('Flota: volver de "Editar vehículo"', () => {
  beforeEach(() => montar('FlotaVehiculos', '/vehiculos'));

  async function editarDesdeLaFicha() {
    await clic(contenedor.querySelector('button.listado-card'));
    await clic(boton('Editar vehículo'));
  }

  test('editar desde la ficha y cancelar vuelve a esa ficha', async () => {
    await editarDesdeLaFicha();
    assert.ok(enFormulario());
    assert.equal(linkVolver(), '← Volver a la ficha');
    await clic(boton('Cancelar'));
    assert.ok(enFicha());
    assert.match(titulo(), /Vehículo 12 - AE452KD/);
  });

  test('el link "← Volver a la ficha" también vuelve a la ficha', async () => {
    await editarDesdeLaFicha();
    await clic(contenedor.querySelector('.back-link'));
    assert.ok(enFicha());
  });

  test('editar desde la ficha y guardar vuelve a la ficha con los datos del PUT', async () => {
    respuestas.put = { vehiculo: { ...VEHICULO, anio: 2022, asientos: 48 } };
    await editarDesdeLaFicha();
    await clic(boton('Guardar cambios'));
    assert.equal(enviados[0].metodo, 'PUT');
    assert.ok(enFicha());
    const ficha = contenedor.querySelector('[aria-label="Ficha del vehículo"]').textContent;
    assert.ok(ficha.includes('2022'), 'la ficha tiene que mostrar el año actualizado');
    assert.ok(ficha.includes('48'), 'la ficha tiene que mostrar los asientos actualizados');
    assert.ok(contenedor.textContent.includes('Cambios guardados correctamente.'));
  });

  test('el alta dice "Volver al listado" y cancelar vuelve al listado', async () => {
    await clic(contenedor.querySelector('.listado-accion'));
    assert.equal(linkVolver(), '← Volver al listado');
    await clic(boton('Cancelar'));
    assert.ok(enListado());
    assert.ok(!enFicha());
  });

  test('el alta exitosa abre la ficha del vehículo creado', async () => {
    respuestas.post = { vehiculo: VEHICULO_NUEVO };
    await clic(contenedor.querySelector('.listado-accion'));
    escribir(contenedor.querySelector('input[name="numeroInterno"]'), '30');
    escribir(contenedor.querySelector('input[name="dominio"]'), 'AB123CD');
    await elegirEnSelector('marcaId', 'Merc', 'Mercedes-Benz');
    await elegirEnSelector('modeloId', 'O5', 'O500');
    elegir('tipoVehiculoId', '1');
    escribir(contenedor.querySelector('input[name="anio"]'), '2020');
    escribir(contenedor.querySelector('input[name="asientos"]'), '45');
    escribir(contenedor.querySelector('input[name="kilometraje"]'), '1200');
    await clic(boton('Crear vehículo'));
    assert.equal(enviados[0].metodo, 'POST');
    assert.ok(enFicha());
    assert.match(titulo(), /Vehículo 30 - AB123CD/);
  });
});

// --- Personal -------------------------------------------------------------------------

describe('Personal: volver de "Editar datos"', () => {
  beforeEach(() => montar('Personal', '/personal'));

  async function editarDesdeLaFicha() {
    await clic(contenedor.querySelector('button.listado-card'));
    await clic(boton('Editar datos'));
  }

  test('editar desde la ficha y cancelar vuelve a esa ficha', async () => {
    await editarDesdeLaFicha();
    assert.equal(linkVolver(), '← Volver a la ficha');
    await clic(boton('Cancelar'));
    assert.ok(enFicha());
    assert.equal(titulo(), 'Martín Gómez');
  });

  test('editar desde la ficha y guardar vuelve a la ficha con los datos del PUT', async () => {
    respuestas.put = { persona: { ...PERSONA, telefono: '3571 999999' }, candidaturasQuitadas: [] };
    await editarDesdeLaFicha();
    await clic(boton('Guardar cambios'));
    assert.equal(enviados[0].metodo, 'PUT');
    assert.equal(enviados[0].endpoint, '/personas/7');
    assert.ok(enFicha());
    assert.ok(contenedor.textContent.includes('3571 999999'), 'la ficha tiene que mostrar el teléfono actualizado');
    assert.ok(contenedor.textContent.includes('Datos actualizados correctamente.'));
  });

  test('el alta dice "Volver al listado" y cancelar vuelve al listado', async () => {
    await clic(contenedor.querySelector('.listado-accion'));
    assert.equal(linkVolver(), '← Volver al listado');
    await clic(boton('Cancelar'));
    assert.ok(enListado());
  });

  test('el alta exitosa abre la ficha de la persona registrada', async () => {
    respuestas.post = { persona: PERSONA_NUEVA };
    await clic(contenedor.querySelector('.listado-accion'));
    escribir(contenedor.querySelector('input[name="nombre"]'), 'Lucía');
    escribir(contenedor.querySelector('input[name="apellido"]'), 'Ramos');
    escribir(contenedor.querySelector('input[name="dni"]'), '40222333');
    elegir('perfil', 'PERSONAL_TALLER');
    await clic(boton('Registrar personal'));
    assert.equal(enviados[0].metodo, 'POST');
    assert.ok(enFicha());
    assert.equal(titulo(), 'Lucía Ramos');
  });
});

// --- Usuarios -------------------------------------------------------------------------

describe('Usuarios: volver de "Modificar credenciales"', () => {
  beforeEach(() => montar('Usuarios', '/usuarios'));

  test('editar desde la ficha y cancelar vuelve a esa ficha', async () => {
    await clic(contenedor.querySelector('button.listado-card'));
    await clic(boton('Modificar credenciales'));
    assert.equal(linkVolver(), '← Volver a la ficha');
    await clic(boton('Cancelar'));
    assert.ok(enFicha());
  });

  test('editar desde la ficha y guardar vuelve a la ficha con los datos del PUT', async () => {
    respuestas.put = { usuario: { ...USUARIO, nombreUsuario: 'martin.gomez' } };
    await clic(contenedor.querySelector('button.listado-card'));
    await clic(boton('Modificar credenciales'));
    await clic(boton('Guardar cambios'));
    assert.ok(enFicha());
    assert.ok(contenedor.textContent.includes('@martin.gomez'));
  });
});

// --- Viajes ---------------------------------------------------------------------------

describe('Viajes: volver de "Editar viaje"', () => {
  beforeEach(() => montar('Viajes', '/viajes'));

  async function abrirFicha() {
    await clic(contenedor.querySelector('.listado-card'));
    assert.equal(titulo(), 'Viaje a confirmar');
  }

  test('editar desde la ficha y cancelar vuelve a esa ficha', async () => {
    await abrirFicha();
    await clic(boton('Editar viaje'));
    assert.equal(titulo(), 'Editar viaje');
    assert.equal(linkVolver(), '← Volver a la ficha');
    await clic(boton('Cancelar'));
    assert.equal(titulo(), 'Viaje a confirmar');
    assert.ok(boton('Editar viaje'), 'tiene que estar de nuevo en la ficha, con sus acciones');
  });

  test('editar desde la ficha y guardar vuelve a la ficha con los datos del PUT', async () => {
    respuestas.put = { viaje: { ...VIAJE, cliente: { id: 1, nombre: 'Club Atlético Talleres' } } };
    await abrirFicha();
    await clic(boton('Editar viaje'));
    await clic(boton('Guardar cambios'));
    assert.equal(enviados[0].metodo, 'PUT');
    assert.equal(enviados[0].endpoint, '/viajes/40');
    assert.equal(titulo(), 'Viaje a confirmar');
    assert.ok(boton('Editar viaje'));
    assert.ok(contenedor.textContent.includes('Club Atlético Talleres'), 'la ficha tiene que mostrar el cliente actualizado');
    assert.ok(contenedor.textContent.includes('Cambios guardados correctamente.'));
  });

  test('"Crear viaje" dice "Volver al listado" y cancelar vuelve al listado', async () => {
    await clic(contenedor.querySelector('.listado-accion'));
    assert.equal(titulo(), 'Crear viaje');
    assert.equal(linkVolver(), '← Volver al listado');
    await clic(boton('Cancelar'));
    assert.ok(contenedor.querySelector('.listado-card'), 'tiene que estar de nuevo en el listado');
  });

  // Duplicar es un alta precargada (los datos obligatorios vienen del original):
  // guardar abre la ficha del viaje nuevo, cancelar vuelve a la del original.
  test('el alta (duplicado) exitosa abre la ficha del viaje creado', async () => {
    respuestas.post = { viaje: VIAJE_NUEVO };
    await abrirFicha();
    await clic(boton('Duplicar viaje'));
    assert.equal(linkVolver(), '← Volver al viaje');
    await clic(boton('Crear viaje'));
    assert.equal(enviados[0].metodo, 'POST');
    assert.equal(titulo(), 'Viaje a confirmar');
    assert.ok(contenedor.textContent.includes('Viaje creado como A confirmar'));
  });

  test('cancelar un duplicado vuelve a la ficha del original', async () => {
    await abrirFicha();
    await clic(boton('Duplicar viaje'));
    await clic(boton('Cancelar'));
    assert.equal(titulo(), 'Viaje a confirmar');
    assert.ok(boton('Duplicar viaje'));
  });
});
