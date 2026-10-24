// Tests del panel "Viajes de hoy" del Dashboard. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { consultasViajesDeHoy, resumenViajesDeHoy, unirViajesDeHoy } from './viajesDeHoy.js';

const viaje = (id, estado, fechaInicio = '2026-10-09T12:00:00Z', extra = {}) => ({ id, estado, fechaInicio, ...extra });

describe('consultasViajesDeHoy', () => {
  test('pide el día de hoy de Córdoba y, aparte, todos los En viaje con vista=proximos (marcados por el backend)', () => {
    const ahora = Date.parse('2026-10-10T02:00:00Z'); // 23:00 del 9 en Córdoba
    assert.deepEqual(consultasViajesDeHoy(ahora), [
      { fechaDesde: '2026-10-09', fechaHasta: '2026-10-09' },
      { vista: 'proximos', estado: 'EN_VIAJE' },
    ]);
  });

  test('ya no pide los abiertos de días anteriores: esos van en el panel Sin cerrar', () => {
    assert.ok(!consultasViajesDeHoy().some((params) => params.vista === 'proximos' && params.fechaHasta && !params.estado));
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
    // Un En viaje que se comenzó antes de su día (sale mañana) sigue entrando.
    const enViaje = [viaje(2, 'EN_VIAJE', '2026-10-09T10:30:00Z', { sinCerrar: false }), viaje(6, 'EN_VIAJE', '2026-10-10T12:00:00Z', { sinCerrar: false })];

    assert.deepEqual(
      unirViajesDeHoy(delDia, enViaje).map((v) => v.id),
      [5, 2, 1, 6]
    );
  });

  test('solo lo de hoy: el En viaje que empezó ayer (sin cerrar) no entra', () => {
    const delDia = [viaje(4, 'EN_VIAJE', '2026-10-09T10:00:00Z'), viaje(5, 'PROGRAMADO', '2026-10-09T20:00:00Z')];
    const enViaje = [
      viaje(3, 'EN_VIAJE', '2026-10-09T01:00:00Z', { sinCerrar: true }),
      viaje(4, 'EN_VIAJE', '2026-10-09T10:00:00Z', { sinCerrar: false }),
    ];
    assert.deepEqual(
      unirViajesDeHoy(delDia, enViaje).map((v) => v.id),
      [4, 5]
    );
  });

  test('si una copia de un viaje viene marcada sin cerrar, no entra aunque otra no tenga la marca', () => {
    const sinMarca = viaje(7, 'EN_VIAJE', '2026-10-08T23:00:00Z');
    const marcado = { ...sinMarca, sinCerrar: true };
    assert.deepEqual(unirViajesDeHoy([sinMarca], [marcado]), []);
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
