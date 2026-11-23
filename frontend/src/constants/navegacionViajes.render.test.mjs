// Menú lateral por perfil respecto de los viajes (regla de Personal de Taller).
// navegacion.js importa sin extensión (lo resuelve Vite), así que se carga con
// el servidor de Vite en modo middleware, como los demás tests de pantallas.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let vite;
let getNavItemsHabilitados;
before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  ({ getNavItemsHabilitados } = await vite.ssrLoadModule('/src/constants/navegacion.js'));
});
after(() => vite.close());

const usuario = (perfil, habilitadoParaConducir) => ({ perfil, habilitadoParaConducir });
const etiquetasDelMenu = (u) => getNavItemsHabilitados(u).map((item) => item.label);

describe('menú lateral', () => {
  test('Taller sin habilitación no tiene ninguna entrada de viajes', () => {
    const menu = etiquetasDelMenu(usuario('PERSONAL_TALLER', false));
    assert.ok(!menu.includes('Viajes'));
    assert.ok(!menu.includes('Mis viajes'));
  });

  test('Taller con habilitación solo tiene "Mis viajes"', () => {
    const menu = etiquetasDelMenu(usuario('PERSONAL_TALLER', true));
    assert.ok(menu.includes('Mis viajes'));
    assert.ok(!menu.includes('Viajes'));
  });

  test('Encargado conserva "Viajes" y Chofer "Mis viajes"', () => {
    assert.ok(etiquetasDelMenu(usuario('ENCARGADO', false)).includes('Viajes'));
    assert.ok(etiquetasDelMenu(usuario('CHOFER', true)).includes('Mis viajes'));
  });
});
