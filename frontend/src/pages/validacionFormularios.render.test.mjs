// Tests de la validación en una sola vuelta de "Crear viaje" y "Crear vehículo":
// todos los errores juntos, sin pedir nada al backend, y el foco en el primer
// campo con error. Se corren con `npm test` (node:test).
//
// Se montan ViajeForm y FlotaVehiculos con react-dom/client sobre jsdom; la API
// se reemplaza por un doble que registra lo que se manda.

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
// jsdom no implementa scrollIntoView: se registra a qué elemento se scrolleó.
let scrolleadoA = null;
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  scrolleadoA = this;
};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;

let vite;
let api;
let MemoryRouter;
let AuthProvider;
let ViajeForm;
let FlotaVehiculos;
let contenedor;
let raiz;

const enviados = [];

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/vehiculos') return { data: { vehiculos: [] } };
    if (endpoint === '/usuarios/disponibles-chofer') return { data: { usuarios: [] } };
    if (endpoint === '/tipos-vehiculo') return { data: { tiposVehiculo: [{ id: 1, descripcion: 'Colectivo' }] } };
    return { data: { items: [] } };
  };
  api.post = async (endpoint, datos) => {
    enviados.push({ endpoint, datos });
    return { data: {} };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  ViajeForm = (await vite.ssrLoadModule('/src/components/ViajeForm.jsx')).default;
  FlotaVehiculos = (await vite.ssrLoadModule('/src/pages/FlotaVehiculos.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  enviados.length = 0;
  scrolleadoA = null;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);
const clic = (elemento) => act(async () => elemento.click());
const errorDe = (id) => contenedor.querySelector(`#${id}-error`)?.textContent;

function escribir(input, texto) {
  const asignarValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    asignarValue.call(input, texto);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

describe('Crear viaje: validación en una sola vuelta', () => {
  let llamadasOnSubmit;

  beforeEach(async () => {
    llamadasOnSubmit = 0;
    await act(async () => {
      raiz.render(
        h(ViajeForm, {
          onSubmit: async () => {
            llamadasOnSubmit += 1;
          },
          textoBoton: 'Crear viaje',
          textoEnviando: 'Creando…',
          onCancelar() {},
        })
      );
    });
  });

  test('vacío: cliente, origen, destino y fecha de inicio a la vez, y no se envía', async () => {
    await clic(boton('Crear viaje'));
    assert.equal(errorDe('clienteId'), 'El cliente es obligatorio');
    assert.equal(errorDe('origenId'), 'El origen es obligatorio');
    assert.equal(errorDe('destinoId'), 'El destino es obligatorio');
    assert.equal(errorDe('fechaInicio'), 'La fecha y hora de inicio es obligatoria');
    assert.equal(llamadasOnSubmit, 0);
  });

  test('el foco y el scroll van al primer campo con error (Cliente)', async () => {
    await clic(boton('Crear viaje'));
    assert.equal(document.activeElement?.id, 'clienteId');
    assert.equal(scrolleadoA?.id, 'clienteId');
  });

  test('el foco en Cliente no abre su lista (taparía los errores de abajo); un clic sí', async () => {
    await clic(boton('Crear viaje'));
    assert.equal(document.activeElement?.id, 'clienteId');
    assert.equal(contenedor.querySelector('.selector-buscar-crear-lista'), null);
    await clic(document.activeElement);
    assert.ok(contenedor.querySelector('.selector-buscar-crear-lista'), 'con un clic la lista se abre');
  });

  test('con la fecha cargada siguen los otros tres; el foco sigue en el primero', async () => {
    escribir(contenedor.querySelector('input[name="fechaInicio"]'), '2026-10-21T08:00');
    await clic(boton('Crear viaje'));
    assert.equal(errorDe('fechaInicio'), undefined);
    assert.equal(errorDe('clienteId'), 'El cliente es obligatorio');
    assert.equal(errorDe('destinoId'), 'El destino es obligatorio');
    assert.equal(document.activeElement?.id, 'clienteId');
  });
});

describe('Crear vehículo: validación en una sola vuelta', () => {
  beforeEach(async () => {
    localStorage.setItem('adrimar_token', 'token-de-prueba');
    localStorage.setItem(
      'adrimar_usuario',
      JSON.stringify({ id: 1, nombre: 'Adriana', apellido: 'Marín', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false })
    );
    await act(async () => {
      raiz.render(h(MemoryRouter, { initialEntries: ['/vehiculos'] }, h(AuthProvider, null, h(FlotaVehiculos))));
    });
    await clic(contenedor.querySelector('.listado-accion'));
  });

  test('vacío: todos los errores juntos (la marca en Marca, el kilometraje incluido) y no se envía', async () => {
    await clic(boton('Crear vehículo'));
    assert.equal(errorDe('numeroInterno'), 'El número de interno es obligatorio');
    assert.equal(errorDe('dominio'), 'El dominio es obligatorio');
    assert.equal(errorDe('marcaId'), 'Elegí la marca');
    assert.equal(errorDe('modeloId'), undefined, 'sin marca, el error no va en Modelo');
    assert.equal(errorDe('tipoVehiculoId'), 'El tipo de vehículo es obligatorio');
    assert.equal(errorDe('anio'), 'El año es obligatorio');
    assert.equal(errorDe('asientos'), 'La cantidad de asientos es obligatoria');
    assert.equal(errorDe('kilometraje'), 'El kilometraje es obligatorio');
    assert.equal(enviados.length, 0);
  });

  test('año 1890 y 0 asientos se marcan fuera de rango', async () => {
    escribir(contenedor.querySelector('input[name="anio"]'), '1890');
    escribir(contenedor.querySelector('input[name="asientos"]'), '0');
    await clic(boton('Crear vehículo'));
    assert.match(errorDe('anio'), /^El año tiene que estar entre 1970 y \d{4}$/);
    assert.equal(errorDe('asientos'), 'La cantidad de asientos tiene que estar entre 1 y 100');
  });

  test('el foco y el scroll van al primer campo con error', async () => {
    escribir(contenedor.querySelector('input[name="numeroInterno"]'), '30');
    escribir(contenedor.querySelector('input[name="dominio"]'), 'AB123CD');
    await clic(boton('Crear vehículo'));
    assert.equal(document.activeElement?.id, 'marcaId');
    assert.equal(scrolleadoA?.id, 'marcaId');
  });
});
