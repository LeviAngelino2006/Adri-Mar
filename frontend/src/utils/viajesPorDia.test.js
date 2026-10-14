// Tests del agrupado por día (de Córdoba) del listado de Viajes y Mis viajes. Se
// corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agruparViajesPorDia } from './viajesPorDia.js';

// Hora de Córdoba = UTC - 3. "Ahora" = viernes 9/10/2026 12:00 en Córdoba.
const AHORA = Date.parse('2026-10-09T15:00:00Z');
const viaje = (id, fechaInicio) => ({ id, fechaInicio });
const resumen = (grupos) => grupos.map((g) => [g.titulo, g.viajes.map((v) => v.id)]);

describe('agruparViajesPorDia', () => {
  test('hoy, mañana, ayer, otro día y otro año, en el orden del listado', () => {
    const grupos = agruparViajesPorDia(
      [
        viaje('mañana', '2026-10-10T11:00:00Z'),
        viaje('hoy tarde', '2026-10-09T20:00:00Z'),
        viaje('hoy temprano', '2026-10-09T10:30:00Z'),
        viaje('ayer', '2026-10-08T12:00:00Z'),
        viaje('miércoles', '2026-10-07T12:00:00Z'),
        viaje('año pasado', '2025-12-29T12:00:00Z'),
      ],
      AHORA
    );

    assert.deepEqual(resumen(grupos), [
      ['Mañana · sáb 10 oct', ['mañana']],
      ['Hoy · vie 9 oct', ['hoy tarde', 'hoy temprano']],
      ['Ayer · jue 8 oct', ['ayer']],
      ['mié 7 oct', ['miércoles']],
      ['lun 29 dic 2025', ['año pasado']],
    ]);
  });

  test('un viaje cerca de la medianoche va al día de Córdoba, no al de UTC', () => {
    const grupos = agruparViajesPorDia(
      [
        viaje('00:15 del 10', '2026-10-10T03:15:00Z'),
        viaje('23:30 del 9', '2026-10-10T02:30:00Z'), // en UTC ya es el 10
        viaje('00:10 del 9', '2026-10-09T03:10:00Z'),
      ],
      AHORA
    );

    assert.deepEqual(resumen(grupos), [
      ['Mañana · sáb 10 oct', ['00:15 del 10']],
      ['Hoy · vie 9 oct', ['23:30 del 9', '00:10 del 9']],
    ]);
  });

  test('sin viajes, sin grupos', () => {
    assert.deepEqual(agruparViajesPorDia([], AHORA), []);
  });
});
