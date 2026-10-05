// Caso 1: editar un viaje histórico (origen/destino en null) cambiando solo
// los kilómetros estimados. Tiene que guardar sin pedir origen/destino, y se
// intercepta el PUT real para confirmar qué manda el form (omite la clave,
// null, o "").
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const { ADMIN, crearViajeHistorico, borrarViajes } = require('./helpers/fixtures.cjs');

const FECHA_DESDE = '2033-04-15';
const FECHA_HASTA = '2033-04-15';

let viajeId;

test.beforeAll(async () => {
  const viaje = await crearViajeHistorico({
    fechaInicio: new Date('2033-04-15T08:00:00-03:00'),
    fechaFin: new Date('2033-04-15T18:00:00-03:00'),
    kilometrosEstimados: 80,
  });
  viajeId = viaje.id;
});

test.afterAll(async () => {
  await borrarViajes([viajeId]);
});

test('editar viaje histórico sin origen/destino guarda correctamente', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');

  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.locator('#fechaDesde').fill(FECHA_DESDE);
  await page.locator('#fechaHasta').fill(FECHA_HASTA);

  const tarjetas = page.locator('.viajes-listado-card');
  await expect(tarjetas).toHaveCount(1);
  await tarjetas.first().click();

  await expect(page.getByText('No registrado')).toHaveCount(2); // Origen y Destino

  await page.getByRole('button', { name: 'Editar' }).click();

  await expect(page.locator('#origenId')).toHaveValue('');
  await expect(page.locator('#destinoId')).toHaveValue('');

  let cuerpoEnviado = null;
  await page.route('**/api/viajes/*', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      cuerpoEnviado = JSON.parse(request.postData());
    }
    await route.continue();
  });

  await page.locator('#kilometrosEstimados').fill('95');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('Viaje modificado correctamente.')).toBeVisible();
  await expect(page.getByText(/obligatorio/i)).toHaveCount(0);

  await page.screenshot({ path: 'e2e/capturas/01-historico-edicion-exito.png', fullPage: true });

  console.log('[caso 1] Body del PUT real interceptado:', JSON.stringify(cuerpoEnviado));
  expect(cuerpoEnviado).not.toBeNull();
  expect(cuerpoEnviado.kilometrosEstimados).toBe('95');
  // La forma real que manda ViajeForm para un campo vacío: string vacío, no
  // se omite la clave ni se manda null.
  expect(Object.prototype.hasOwnProperty.call(cuerpoEnviado, 'origenId')).toBe(true);
  expect(cuerpoEnviado.origenId).toBe('');
  expect(cuerpoEnviado.destinoId).toBe('');
});
