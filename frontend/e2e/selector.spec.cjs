// Caso 3: mecánica del SelectorBuscarOCrear — debounce, elegir existente,
// crear nuevo, crear con nombre existente (no debe duplicar), limpiar
// selección, Escape, click afuera.
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const { ADMIN, crearUbicacionDirecta, borrarUbicaciones, prisma } = require('./helpers/fixtures.cjs');

const NOMBRE_PREEXISTENTE = 'Terminal Selector E2E';

const idsCreados = [];

test.beforeAll(async () => {
  const ub = await crearUbicacionDirecta(NOMBRE_PREEXISTENTE);
  idsCreados.push(ub.id);
});

test.afterAll(async () => {
  await borrarUbicaciones(idsCreados);
});

async function abrirFormularioNuevoViaje(page) {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');
  await page.getByRole('button', { name: '+ Programar viaje' }).click();
}

test('debounce: escribir rápido no dispara una request por letra', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  const requestsABusqueda = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/api/ubicaciones')) {
      requestsABusqueda.push(req.url());
    }
  });

  // Foco dispara una búsqueda inicial (busqueda='') — se la deja asentar
  // antes de contar, porque esa sí es esperada (poblar el selector al
  // abrirlo), no parte del debounce de tipeo.
  await page.locator('#origenId').click();
  await page.waitForTimeout(500);
  requestsABusqueda.length = 0;

  await page.locator('#origenId').pressSequentially('terminal', { delay: 20 });
  await page.waitForTimeout(600);

  console.log('[caso 3] Requests a /api/ubicaciones durante el tipeo rápido:', requestsABusqueda.length, requestsABusqueda);
  expect(requestsABusqueda.length).toBeLessThanOrEqual(2);
  expect(requestsABusqueda.length).toBeGreaterThan(0);

  await page.screenshot({ path: 'e2e/capturas/04-selector-debounce.png', fullPage: true });
});

test('elegir un resultado existente de la lista', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.locator('#origenId').fill('Terminal Selector');
  await page.getByRole('button', { name: NOMBRE_PREEXISTENTE, exact: true }).click();

  await expect(page.locator('#origenId')).toHaveValue(NOMBRE_PREEXISTENTE);
  await expect(page.locator('.selector-buscar-crear-lista')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/capturas/05-selector-elegir-existente.png', fullPage: true });
});

test('"+ Crear" con nombre nuevo lo crea', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  const nombreNuevo = 'Depósito Selector Nuevo E2E';
  await page.locator('#destinoId').fill(nombreNuevo);

  const respuesta = page.waitForResponse(
    (r) => r.url().includes('/api/ubicaciones') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: `+ Crear "${nombreNuevo}"` }).click();
  const data = await (await respuesta).json();
  idsCreados.push(data.ubicacion.id);

  await expect(page.locator('#destinoId')).toHaveValue(nombreNuevo);

  await page.screenshot({ path: 'e2e/capturas/06-selector-crear-nuevo.png', fullPage: true });
});

test('"+ Crear" con un nombre ya existente no duplica', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.locator('#destinoId').fill(NOMBRE_PREEXISTENTE);
  await page.getByRole('button', { name: `+ Crear "${NOMBRE_PREEXISTENTE}"` }).click();

  await expect(page.locator('#destinoId')).toHaveValue(NOMBRE_PREEXISTENTE);

  const coincidencias = await prisma.ubicacion.findMany({ where: { nombre: NOMBRE_PREEXISTENTE } });
  console.log('[caso 3] Filas con ese nombre después de "+ Crear" sobre uno existente:', coincidencias.length);
  expect(coincidencias).toHaveLength(1);

  await page.screenshot({ path: 'e2e/capturas/07-selector-crear-existente-no-duplica.png', fullPage: true });
});

test('limpiar la selección vigente', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.locator('#origenId').fill('Terminal Selector');
  await page.getByRole('button', { name: NOMBRE_PREEXISTENTE, exact: true }).click();
  await expect(page.locator('#origenId')).toHaveValue(NOMBRE_PREEXISTENTE);

  await page.locator('#origenId').click();
  await page.locator('#origenId').press('Control+A');
  await page.locator('#origenId').press('Delete');
  await expect(page.locator('#origenId')).toHaveValue('');

  // Probar que la limpieza fue real (no solo visual): intentar programar sin
  // elegir de nuevo tiene que volver a pedir el campo.
  await page.locator('#choferId').selectOption({ index: 1 });
  await page.locator('#vehiculoId').selectOption({ index: 1 });
  await page.locator('#destinoId').fill('Cualquier cosa');
  await page.getByRole('button', { name: `+ Crear "Cualquier cosa"` }).click();
  await page.locator('#fechaInicio').fill('2036-01-01T08:00');
  await page.locator('#fechaFin').fill('2036-01-01T18:00');
  await page.locator('#kilometrosEstimados').fill('50');
  await page.getByRole('button', { name: 'Programar viaje' }).click();

  await expect(page.getByText('El origen es obligatorio')).toBeVisible();

  await page.screenshot({ path: 'e2e/capturas/08-selector-limpiar-seleccion.png', fullPage: true });

  const creada = await prisma.ubicacion.findFirst({ where: { nombre: 'Cualquier cosa' } });
  if (creada) idsCreados.push(creada.id);
});

test('Escape cierra la lista', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.locator('#origenId').click();
  await expect(page.locator('.selector-buscar-crear-lista')).toBeVisible();

  await page.locator('#origenId').press('Escape');
  await expect(page.locator('.selector-buscar-crear-lista')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/capturas/09-selector-escape.png', fullPage: true });
});

test('click afuera cierra la lista', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.locator('#origenId').click();
  await expect(page.locator('.selector-buscar-crear-lista')).toBeVisible();

  await page.getByRole('heading', { name: 'Programar viaje' }).click();
  await expect(page.locator('.selector-buscar-crear-lista')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/capturas/10-selector-click-afuera.png', fullPage: true });
});
