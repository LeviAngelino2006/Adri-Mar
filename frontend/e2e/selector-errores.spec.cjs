// Casos 4 y 5: respuesta mal formada (page.route) y red caída
// (context.setOffline) — en ambos tiene que verse un error claro y la
// búsqueda no debe quedar "cargando" para siempre.
const { test, expect } = require('@playwright/test');
const { autenticarComo } = require('./helpers/auth.cjs');
const { ADMIN } = require('./helpers/fixtures.cjs');

async function abrirFormularioNuevoViaje(page) {
  await autenticarComo(page, ADMIN);
  await page.goto('/viajes');
  await page.getByRole('button', { name: '+ Programar viaje' }).click();
}

test('respuesta mal formada (dos claves) muestra error y loguea en consola', async ({ page }) => {
  const mensajesConsola = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') mensajesConsola.push(msg.text());
  });

  await abrirFormularioNuevoViaje(page);

  await page.route('**/api/ubicaciones**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ubicaciones: [], otraClave: true }),
      });
      return;
    }
    await route.continue();
  });

  await page.locator('#origenId').click();
  await page.locator('#origenId').fill('cualquier cosa');

  await expect(page.locator('.selector-buscar-crear-error')).toBeVisible();
  await expect(page.locator('.selector-buscar-crear-error')).toHaveText(
    'Respuesta inesperada del servidor al buscar. Probá de nuevo.'
  );

  console.log('[caso 4] Mensajes de console.error capturados:', mensajesConsola);
  expect(mensajesConsola.some((m) => m.includes('SelectorBuscarOCrear') && m.includes('Respuesta inesperada'))).toBe(
    true
  );

  await page.screenshot({ path: 'e2e/capturas/11-selector-respuesta-malformada.png', fullPage: true });
});

test('red caída: error claro y no queda cargando para siempre', async ({ page }) => {
  await abrirFormularioNuevoViaje(page);

  await page.context().setOffline(true);

  try {
    await page.locator('#destinoId').click();
    await page.locator('#destinoId').fill('sin red');

    await expect(page.locator('.selector-buscar-crear-error')).toBeVisible();
    await expect(page.locator('.selector-buscar-crear-error')).toHaveText('No se pudo buscar. Probá de nuevo.');

    // No debe quedar "Buscando…" colgado: una vez resuelto el error, ese
    // estado tiene que desaparecer (se limpia siempre en el finally).
    await expect(page.getByText('Buscando…')).toHaveCount(0);

    await page.screenshot({ path: 'e2e/capturas/12-selector-red-caida.png', fullPage: true });
  } finally {
    await page.context().setOffline(false);
  }
});
