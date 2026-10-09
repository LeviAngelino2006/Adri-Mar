// Tests del panel "Viajes de hoy" del Dashboard. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { consultasViajesDeHoy, resumenViajesDeHoy, unirViajesDeHoy } from './viajesDeHoy.js';

const viaje = (id, estado, fechaInicio = '2026-10-09T12:00:00Z') => ({ id, estado, fechaInicio });

describe('consultasViajesDeHoy', () => {
  test('pide el día de hoy de Córdoba y aparte todos los En viaje', () => {
    const ahora = Date.parse('2026-10-10T02:00:00Z'); // 23:00 del 9 en Córdoba
    assert.deepEqual(consultasViajesDeHoy(ahora), [
      { fechaDesde: '2026-10-09', fechaHasta: '2026-10-09' },
      { estado: 'EN_VIAJE' },
    ]);
  });
});

describe('unirViajesDeHoy', () => {
  test('une sin duplicados, saca A confirmar y Cancelados y ordena por salida', () => {
    const delDia = [
      viaje(1, 'PROGRAMADO', '2026-10-09T20:00:00Z'),
      viaje(2, 'EN_VIAJE', '2026-10-09T10:30:00Z'),
      viaje(3, 'A_CONFIRMAR'),
      viaje(4, 'CANCELADO'),
      viaje(5, 'FINALIZADO', '2026-10-09T09:00:00Z'),
    ];
    const enViaje = [viaje(2, 'EN_VIAJE', '2026-10-09T10:30:00Z'), viaje(6, 'EN_VIAJE', '2026-10-09T01:00:00Z')];

    assert.deepEqual(
      unirViajesDeHoy(delDia, enViaje).map((v) => v.id),
      [6, 5, 2, 1]
    );
  });
});

describe('resumenViajesDeHoy', () => {
  test('total, en viaje y finalizados, sin las partes en cero salvo el total', () => {
    assert.equal(
      resumenViajesDeHoy([
        viaje(1, 'PROGRAMADO'),
        viaje(2, 'PROGRAMADO'),
        viaje(3, 'EN_VIAJE'),
        viaje(4, 'FINALIZADO'),
        viaje(5, 'FINALIZADO'),
      ]),
      '5 viajes · 1 en viaje · 2 finalizados'
    );
    assert.equal(resumenViajesDeHoy([viaje(1, 'PROGRAMADO'), viaje(2, 'PROGRAMADO')]), '2 viajes');
    assert.equal(resumenViajesDeHoy([]), '0 viajes');
  });

  test('singular bien escrito', () => {
    assert.equal(resumenViajesDeHoy([viaje(1, 'FINALIZADO')]), '1 viaje · 1 finalizado');
  });
});
