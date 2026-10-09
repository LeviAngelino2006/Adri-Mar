// Tests del agrupado de viajes A confirmar de hoy y de mañana (hora de Córdoba)
// para el panel del Dashboard. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorConfirmar, rangoHoyYManana } from './viajesPorConfirmar.js';

const utc = (iso) => new Date(iso).getTime();

// Hora de Córdoba = UTC - 3. "ahora" = 20/10/2026 11:00 en Córdoba.
const AHORA = utc('2026-10-20T14:00:00Z');

const viaje = (id, fechaInicio) => ({ id, fechaInicio });
const ids = (lista) => lista.map((v) => v.id);

describe('agruparPorConfirmar', () => {
  test('separa los viajes de hoy y de mañana', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [viaje(1, '2026-10-20T11:00:00Z'), viaje(2, '2026-10-21T11:00:00Z')],
      AHORA
    );

    assert.deepEqual(ids(hoy), [1]);
    assert.deepEqual(ids(manana), [2]);
  });

  test('los bordes del día se cuentan en hora de Córdoba, no en UTC', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [
        viaje('hoy 00:00', '2026-10-20T03:00:00Z'),
        viaje('hoy 23:59', '2026-10-21T02:59:00Z'),
        viaje('mañana 00:00', '2026-10-21T03:00:00Z'),
        viaje('mañana 23:59', '2026-10-22T02:59:00Z'),
      ],
      AHORA
    );

    assert.deepEqual(ids(hoy), ['hoy 00:00', 'hoy 23:59']);
    assert.deepEqual(ids(manana), ['mañana 00:00', 'mañana 23:59']);
  });

  test('los atrasados de días anteriores no entran', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [viaje('ayer 23:59', '2026-10-20T02:59:00Z'), viaje('hace una semana', '2026-10-13T11:00:00Z')],
      AHORA
    );

    assert.deepEqual(hoy, []);
    assert.deepEqual(manana, []);
  });

  test('los de pasado mañana en adelante no entran', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [viaje('pasado mañana 00:00', '2026-10-22T03:00:00Z'), viaje('dentro de un mes', '2026-11-20T11:00:00Z')],
      AHORA
    );

    assert.deepEqual(hoy, []);
    assert.deepEqual(manana, []);
  });

  test('un viaje de hoy más temprano que "ahora" igual entra: es del día, no "de lo que falta"', () => {
    const { hoy } = agruparPorConfirmar([viaje(1, '2026-10-20T10:00:00Z')], AHORA); // 07:00, ya pasó

    assert.deepEqual(ids(hoy), [1]);
  });

  test('cada grupo va ordenado del más temprano al más tarde, aunque lleguen al revés', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [
        viaje('h-tarde', '2026-10-20T22:00:00Z'),
        viaje('h-temprano', '2026-10-20T09:00:00Z'),
        viaje('m-tarde', '2026-10-21T20:00:00Z'),
        viaje('m-temprano', '2026-10-21T08:00:00Z'),
      ],
      AHORA
    );

    assert.deepEqual(ids(hoy), ['h-temprano', 'h-tarde']);
    assert.deepEqual(ids(manana), ['m-temprano', 'm-tarde']);
  });

  test('un viaje sin fecha de inicio (histórico) no entra ni rompe nada', () => {
    const { hoy, manana } = agruparPorConfirmar(
      [viaje(1, null), viaje(2, undefined), viaje(3, '2026-10-20T11:00:00Z')],
      AHORA
    );

    assert.deepEqual(ids(hoy), [3]);
    assert.deepEqual(manana, []);
  });

  test('sin viajes los dos grupos quedan vacíos', () => {
    assert.deepEqual(agruparPorConfirmar([], AHORA), { hoy: [], manana: [] });
  });

  test('de noche en Córdoba (en UTC ya es otro día) hoy sigue siendo el día de Córdoba', () => {
    const ahora = utc('2026-10-21T01:30:00Z'); // 22:30 del 20 en Córdoba

    const { hoy, manana } = agruparPorConfirmar(
      [
        viaje('hoy', '2026-10-20T20:00:00Z'),
        viaje('mañana', '2026-10-21T20:00:00Z'),
        viaje('pasado', '2026-10-22T20:00:00Z'),
      ],
      ahora
    );

    assert.deepEqual(ids(hoy), ['hoy']);
    assert.deepEqual(ids(manana), ['mañana']);
  });

  test('no modifica la lista original', () => {
    const original = [viaje(2, '2026-10-20T22:00:00Z'), viaje(1, '2026-10-20T09:00:00Z')];
    agruparPorConfirmar(original, AHORA);
    assert.deepEqual(ids(original), [2, 1]);
  });
});

describe('rangoHoyYManana', () => {
  test('es el día de hoy y el de mañana, en fecha de Córdoba', () => {
    assert.deepEqual(rangoHoyYManana(AHORA), { fechaDesde: '2026-10-20', fechaHasta: '2026-10-21' });
  });

  test('de noche en Córdoba no se adelanta un día', () => {
    assert.deepEqual(rangoHoyYManana(utc('2026-10-21T01:30:00Z')), {
      fechaDesde: '2026-10-20',
      fechaHasta: '2026-10-21',
    });
  });
});
