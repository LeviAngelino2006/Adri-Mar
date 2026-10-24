// Tests del panel "Sin cerrar" del Dashboard de gestión. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SIN_CERRAR,
  consultaSinCerrar,
  fechaFilaSinCerrar,
  textoCantidadSinCerrar,
  viajesSinCerrar,
} from './viajesSinCerrar.js';

// Hora de Córdoba = UTC - 3. "Ahora" = viernes 9/10/2026 12:00 en Córdoba.
const AHORA = Date.parse('2026-10-09T15:00:00Z');
const viaje = (id, fechaInicio, extra = {}) => ({ id, estado: 'PROGRAMADO', fechaInicio, ...extra });

describe('consultaSinCerrar', () => {
  test('pide la vista Próximos hasta hoy (día de Córdoba): el backend marca los sin cerrar', () => {
    const ahora = Date.parse('2026-10-10T02:00:00Z'); // 23:00 del 9 en Córdoba
    assert.deepEqual(consultaSinCerrar(ahora), { vista: 'proximos', fechaHasta: '2026-10-09' });
  });
});

describe('viajesSinCerrar', () => {
  test('solo los marcados por el backend, del más viejo al más nuevo', () => {
    const respuesta = [
      viaje(3, '2026-10-08T12:00:00Z', { sinCerrar: true }),
      viaje(1, '2026-10-02T12:00:00Z', { sinCerrar: true }),
      viaje(4, '2026-10-09T12:00:00Z', { sinCerrar: false }),
      viaje(2, '2026-10-05T12:00:00Z', { estado: 'EN_VIAJE', sinCerrar: true }),
    ];
    assert.deepEqual(
      viajesSinCerrar(respuesta).map((v) => v.id),
      [1, 2, 3]
    );
  });

  test('sin la marca, nada es sin cerrar: el front no recalcula la regla', () => {
    assert.deepEqual(viajesSinCerrar([viaje(1, '2026-10-01T12:00:00Z')]), []);
  });

  test('el panel muestra hasta 5', () => {
    assert.equal(MAX_SIN_CERRAR, 5);
  });
});

describe('textos', () => {
  test('la cantidad total del encabezado, con el singular bien escrito', () => {
    assert.equal(textoCantidadSinCerrar(1), '1 viaje');
    assert.equal(textoCantidadSinCerrar(7), '7 viajes');
  });

  test('la fecha de la fila: el día como en el listado de Viajes y la hora', () => {
    assert.equal(fechaFilaSinCerrar(viaje(1, '2026-10-08T11:00:00Z'), AHORA), 'Ayer · jue 8 oct · 08:00');
    assert.equal(fechaFilaSinCerrar(viaje(2, '2026-10-07T16:30:00Z'), AHORA), 'mié 7 oct · 13:30');
  });
});
