// Caso 6: viewport mobile (375x667) — la lista del selector no se corta ni
// tapa los botones del form, probado también con un nombre muy largo.
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const { ADMIN, crearUbicacionDirecta, borrarUbicaciones } = require('./helpers/fixtures.cjs');

test.use({ viewport: { width: 375, height: 667 } });

const NOMBRE_LARGO =
  'Terminal de Ómnibus Internacional de la Provincia de Córdoba Capital - Andén Principal Norte E2E';

let ubicacionId;

test.beforeAll(async () => {
  const ub = await crearUbicacionDirecta(NOMBRE_LARGO);
  ubicacionId = ub.id;
});

test.afterAll(async () => {
  await borrarUbicaciones([ubicacionId]);
});

test('el selector con nombre largo no rompe el layout mobile', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');
  await page.getByRole('button', { name: '+ Programar viaje' }).click();

  await page.screenshot({ path: 'e2e/capturas/13-mobile-form-cerrado.png', fullPage: true });

  await page.locator('#origenId').fill('Andén Principal');
  await expect(page.getByRole('button', { name: NOMBRE_LARGO, exact: true })).toBeVisible();

  const viewport = page.viewportSize();
  const listaBox = await page.locator('.selector-buscar-crear-lista').boundingBox();
  console.log('[caso 6] viewport:', viewport, '| bounding box de la lista:', listaBox);

  // La lista no debe desbordar el ancho de la pantalla (scroll horizontal).
  expect(listaBox.x).toBeGreaterThanOrEqual(0);
  expect(listaBox.x + listaBox.width).toBeLessThanOrEqual(viewport.width + 1);

  await page.screenshot({ path: 'e2e/capturas/14-mobile-selector-nombre-largo.png', fullPage: true });

  // La lista no debe tapar los botones de acción del formulario (Guardar /
  // Cancelar) — comparo contra el botón "Cancelar", que siempre está
  // presente y debajo de todos los campos.
  const botonCancelar = page.getByRole('button', { name: 'Cancelar' });
  const cancelarBox = await botonCancelar.boundingBox();
  const seSuperponen =
    listaBox.y < cancelarBox.y + cancelarBox.height &&
    listaBox.y + listaBox.height > cancelarBox.y &&
    listaBox.x < cancelarBox.x + cancelarBox.width &&
    listaBox.x + listaBox.width > cancelarBox.x;
  console.log('[caso 6] ¿la lista tapa el botón Cancelar?', seSuperponen);
  expect(seSuperponen).toBe(false);

  await page.getByRole('button', { name: NOMBRE_LARGO, exact: true }).click();
  await expect(page.locator('#origenId')).toHaveValue(NOMBRE_LARGO);

  await page.screenshot({ path: 'e2e/capturas/15-mobile-nombre-largo-seleccionado.png', fullPage: true });
});
