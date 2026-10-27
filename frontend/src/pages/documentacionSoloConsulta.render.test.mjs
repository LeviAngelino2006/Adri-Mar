// Tests de la ficha de un chofer en Documentación (H8 de
// docs/auditoria-ux/personal-usuarios.md, tanda 2): el "solo consulta" sale de
// la persona (persona.activo, que el backend manda como `soloConsulta`), no del
// estado de su cuenta. Bloquearle el acceso a alguien que sigue manejando no le
// congela el legajo. Se corren con `npm test`.
//
// Se monta Documentación con react-dom/client sobre jsdom; la API se reemplaza
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

const ADRIANA = { id: 1, personaId: 1, nombre: 'Adriana', apellido: 'Martínez', nombreUsuario: 'amartinez', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false };

// La carpeta de Pablo Medina (G9 de la auditoría): persona activa y cuenta
// bloqueada. Cada test pisa lo que necesita.
let chofer;
const carpeta = () => ({
  chofer,
  documentos: [
    {
      tipo: { id: 4, descripcion: 'LICENCIA_CONDUCIR', requiereVencimiento: true, requiereArchivo: true },
      cargado: true,
      cantidadVersiones: 1,
      documento: { id: 9, tieneArchivo: true, estadoVigencia: 'VIGENTE', fechaVencimiento: '2099-12-22T12:00:00.000Z', creadoEn: '2026-03-12T15:00:00.000Z' },
    },
  ],
  resumen: { estadoDocumentacion: 'AL_DIA', totalCargados: 1, totalRequeridos: 1, totalVencidos: 0, totalPorVencer: 0 },
});

let vite;
let MemoryRouter;
let AuthProvider;
let Documentacion;
let contenedor;
let raiz;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  const api = (await vite.ssrLoadModule('/src/services/api.js')).default;
  api.get = async (endpoint) => {
    if (endpoint === '/auth/me') return { data: { usuario: ADRIANA } };
    if (endpoint === '/documentos/choferes/12') return { data: carpeta() };
    return { data: {} };
  };
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
  Documentacion = (await vite.ssrLoadModule('/src/pages/Documentacion.jsx')).default;
});

after(() => vite.close());

beforeEach(() => {
  chofer = {
    id: 12,
    nombre: 'Pablo',
    apellido: 'Medina',
    dni: '28111222',
    perfil: { descripcion: 'CHOFER' },
    habilitadoParaConducir: true,
    activo: true,
    estadoUsuario: { descripcion: 'INACTIVO' },
    soloConsulta: false,
  };
  localStorage.setItem('adrimar_token', 'token-de-prueba');
  localStorage.setItem('adrimar_usuario', JSON.stringify(ADRIANA));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  localStorage.clear();
});

async function abrirFicha() {
  await act(async () => {
    raiz.render(
      h(MemoryRouter, { initialEntries: ['/documentacion?tab=choferes&choferId=12'] }, h(AuthProvider, null, h(Documentacion)))
    );
  });
}

const botones = () => [...contenedor.querySelectorAll('button')].map((b) => b.textContent.trim());
const texto = () => contenedor.textContent;

describe('Documentación: solo consulta según la persona (H8)', () => {
  test('G9: un chofer activo con la cuenta bloqueada se puede actualizar', async () => {
    await abrirFicha();
    assert.ok(texto().includes('Pablo Medina'), 'está en la ficha');
    assert.ok(botones().includes('Actualizar'));
    assert.ok(!texto().includes('solo consulta'));
  });

  test('una persona dada de baja es de solo consulta, con el aviso', async () => {
    chofer = { ...chofer, activo: false, soloConsulta: true };
    await abrirFicha();
    assert.ok(!botones().includes('Actualizar'));
    assert.ok(botones().includes('Ver PDF'));
    assert.ok(texto().includes('Persona dada de baja: la documentación es de solo consulta'));
  });

  test('manda lo que dice el backend, aunque la cuenta esté activa', async () => {
    chofer = { ...chofer, estadoUsuario: { descripcion: 'ACTIVO' }, soloConsulta: true };
    await abrirFicha();
    assert.ok(!botones().includes('Actualizar'));
  });

  test('con el backend anterior (sin soloConsulta) decide por la persona', async () => {
    delete chofer.soloConsulta;
    await abrirFicha();
    assert.ok(botones().includes('Actualizar'), 'activa: se puede actualizar');

    act(() => raiz.unmount());
    raiz = createRoot(contenedor);
    chofer = { ...chofer, activo: false };
    delete chofer.soloConsulta;
    await abrirFicha();
    assert.ok(!botones().includes('Actualizar'), 'dada de baja: solo consulta');
  });
});
