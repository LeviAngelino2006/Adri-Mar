// Caso 2: alta de viaje — sin origen ni destino tiene que mostrar los dos
// errores a la vez; origen igual a destino tiene que mostrar el error que
// devuelve el backend.
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const { ADMIN, borrarUbicaciones } = require('./helpers/fixtures.cjs');

const NOMBRE_UBICACION = 'Origen Alta E2E';

let ubicacionId = null;

test.afterAll(async () => {
  await borrarUbicaciones([ubicacionId]);
});

test('alta sin origen ni destino muestra ambos errores', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');

  await page.getByRole('button', { name: '+ Programar viaje' }).click();

  await page.locator('#choferId').selectOption({ index: 1 });
  await page.locator('#vehiculoId').selectOption({ index: 1 });
  await page.locator('#fechaInicio').fill('2035-06-01T08:00');
  await page.locator('#fechaFin').fill('2035-06-01T18:00');
  await page.locator('#kilometrosEstimados').fill('100');

  await page.getByRole('button', { name: 'Programar viaje' }).click();

  await expect(page.getByText('El origen es obligatorio')).toBeVisible();
  await expect(page.getByText('El destino es obligatorio')).toBeVisible();

  await page.screenshot({ path: 'e2e/capturas/02-alta-sin-origen-destino.png', fullPage: true });
});

test('alta con origen igual a destino muestra el error del backend', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');

  await page.getByRole('button', { name: '+ Programar viaje' }).click();

  await page.locator('#choferId').selectOption({ index: 1 });
  await page.locator('#vehiculoId').selectOption({ index: 1 });
  await page.locator('#fechaInicio').fill('2035-06-02T08:00');
  await page.locator('#fechaFin').fill('2035-06-02T18:00');
  await page.locator('#kilometrosEstimados').fill('100');

  // Origen: crear una ubicación nueva desde el selector.
  await page.locator('#origenId').fill(NOMBRE_UBICACION);
  const respuestaCreacion = page.waitForResponse(
    (r) => r.url().includes('/api/ubicaciones') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: `+ Crear "${NOMBRE_UBICACION}"` }).click();
  const dataCreacion = await (await respuestaCreacion).json();
  ubicacionId = dataCreacion.ubicacion.id;

  // Destino: escribir el MISMO nombre y elegir el resultado existente (no
  // "+ Crear") para que resuelva al mismo id.
  await page.locator('#destinoId').fill(NOMBRE_UBICACION);
  await page.getByRole('button', { name: NOMBRE_UBICACION, exact: true }).click();

  await page.getByRole('button', { name: 'Programar viaje' }).click();

  await expect(page.getByText('El destino no puede ser el mismo que el origen')).toBeVisible();

  await page.screenshot({ path: 'e2e/capturas/03-alta-origen-igual-destino.png', fullPage: true });
});
