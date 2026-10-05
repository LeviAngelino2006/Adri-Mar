// Caso 7: fichas de detalle (Viajes.jsx y MisViajes.jsx) — "No registrado"
// en un viaje histórico, y ambos nombres resueltos en uno nuevo.
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const {
  ADMIN,
  CHOFER,
  crearUbicacionDirecta,
  crearViajeHistorico,
  crearViajeConOrigenDestino,
  borrarViajes,
  borrarUbicaciones,
} = require('./helpers/fixtures.cjs');

const FECHA_HISTORICO = '2037-01-01';
const FECHA_NUEVO = '2037-02-01';
const NOMBRE_ORIGEN = 'Origen Ficha E2E';
const NOMBRE_DESTINO = 'Destino Ficha E2E';

let viajeHistoricoId;
let viajeNuevoId;
let origenId;
let destinoId;

test.beforeAll(async () => {
  const historico = await crearViajeHistorico({
    fechaInicio: new Date(`${FECHA_HISTORICO}T08:00:00-03:00`),
    fechaFin: new Date(`${FECHA_HISTORICO}T18:00:00-03:00`),
  });
  viajeHistoricoId = historico.id;

  const origen = await crearUbicacionDirecta(NOMBRE_ORIGEN);
  const destino = await crearUbicacionDirecta(NOMBRE_DESTINO);
  origenId = origen.id;
  destinoId = destino.id;

  const nuevo = await crearViajeConOrigenDestino({
    fechaInicio: new Date(`${FECHA_NUEVO}T08:00:00-03:00`),
    fechaFin: new Date(`${FECHA_NUEVO}T18:00:00-03:00`),
    origenId,
    destinoId,
  });
  viajeNuevoId = nuevo.id;
});

test.afterAll(async () => {
  await borrarViajes([viajeHistoricoId, viajeNuevoId]);
  await borrarUbicaciones([origenId, destinoId]);
});

async function filtrarYAbrirFicha(page, ruta, fecha) {
  await page.goto(ruta);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.locator('#fechaDesde').fill(fecha);
  await page.locator('#fechaHasta').fill(fecha);

  const tarjetas = page.locator('.viajes-listado-card');
  await expect(tarjetas).toHaveCount(1);
  await tarjetas.first().click();
}

test('Viajes.jsx — histórico muestra "No registrado"', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await filtrarYAbrirFicha(page, '/viajes', FECHA_HISTORICO);

  await expect(page.getByText('No registrado')).toHaveCount(2);
  await page.screenshot({ path: 'e2e/capturas/16-ficha-viajes-historico.png', fullPage: true });
});

test('Viajes.jsx — viaje nuevo muestra origen y destino resueltos', async ({ page }) => {
  await autenticarComo(page, ADMIN);
  await filtrarYAbrirFicha(page, '/viajes', FECHA_NUEVO);

  await expect(page.getByText(NOMBRE_ORIGEN)).toBeVisible();
  await expect(page.getByText(NOMBRE_DESTINO)).toBeVisible();
  await expect(page.getByText('No registrado')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/capturas/17-ficha-viajes-nuevo.png', fullPage: true });
});

test('MisViajes.jsx — histórico muestra "No registrado"', async ({ page }) => {
  await autenticarComo(page, CHOFER);
  await filtrarYAbrirFicha(page, '/mis-viajes', FECHA_HISTORICO);

  await expect(page.getByText('No registrado')).toHaveCount(2);
  await page.screenshot({ path: 'e2e/capturas/18-ficha-misviajes-historico.png', fullPage: true });
});

test('MisViajes.jsx — viaje nuevo muestra origen y destino resueltos', async ({ page }) => {
  await autenticarComo(page, CHOFER);
  await filtrarYAbrirFicha(page, '/mis-viajes', FECHA_NUEVO);

  await expect(page.getByText(NOMBRE_ORIGEN)).toBeVisible();
  await expect(page.getByText(NOMBRE_DESTINO)).toBeVisible();
  await expect(page.getByText('No registrado')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/capturas/19-ficha-misviajes-nuevo.png', fullPage: true });
});
