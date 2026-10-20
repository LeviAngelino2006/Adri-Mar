// Tests del mensaje de error al cargar datos. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeErrorCarga } from './errorCarga.js';

describe('mensajeErrorCarga', () => {
  test('sin respuesta del servidor (sin red o backend caído) pide revisar la conexión', () => {
    assert.equal(
      mensajeErrorCarga(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }), 'los viajes'),
      'No pudimos cargar los viajes. Revisá tu conexión.'
    );
  });

  test('con respuesta de error del servidor no culpa a la conexión', () => {
    assert.equal(
      mensajeErrorCarga({ response: { status: 500 } }, 'los vehículos'),
      'No pudimos cargar los vehículos. Intentá de nuevo en unos minutos.'
    );
  });

  test('sin error conocido (undefined) se toma como falta de conexión', () => {
    assert.equal(mensajeErrorCarga(undefined, 'tus viajes'), 'No pudimos cargar tus viajes. Revisá tu conexión.');
  });
});
