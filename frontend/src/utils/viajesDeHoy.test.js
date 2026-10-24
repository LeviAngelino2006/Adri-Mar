// Tests del panel "Viajes de hoy" del Dashboard. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { consultasViajesDeHoy, resumenViajesDeHoy, separarSinCerrar, unirViajesDeHoy } from './viajesDeHoy.js';

const viaje = (id, estado, fechaInicio = '2026-10-09T12:00:00Z', extra = {}) => ({ id, estado, fechaInicio, ...extra });

describe('consultasViajesDeHoy', () => {
  test('pide los abiertos hasta hoy y todos los En viaje con vista=proximos, y aparte el día de hoy de Córdoba', () => {
    const ahora = Date.parse('2026-10-10T02:00:00Z'); // 23:00 del 9 en Córdoba
    assert.deepEqual(consultasViajesDeHoy(ahora), [
      { vista: 'proximos', fechaHasta: '2026-10-09' },
      { vista: 'proximos', estado: 'EN_VIAJE' },
      { fechaDesde: '2026-10-09', fechaHasta: '2026-10-09' },
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

describe('sin cerrar', () => {
  // Lo que devuelve el backend en cada consulta (ver consultasViajesDeHoy).
  const programadoAyer = viaje(1, 'PROGRAMADO', '2026-10-08T12:00:00Z', { sinCerrar: true });
  const aConfirmarAyer = viaje(2, 'A_CONFIRMAR', '2026-10-08T15:00:00Z', { sinCerrar: true });
  const enViajeDesdeAyer = viaje(3, 'EN_VIAJE', '2026-10-09T01:00:00Z', { sinCerrar: true });
  const enViajeHoy = viaje(4, 'EN_VIAJE', '2026-10-09T10:00:00Z', { sinCerrar: false });
  const programadoHoy = viaje(5, 'PROGRAMADO', '2026-10-09T20:00:00Z', { sinCerrar: false });
  const abiertosHastaHoy = [programadoAyer, aConfirmarAyer, enViajeDesdeAyer, enViajeHoy, programadoHoy];
  const enViaje = [enViajeDesdeAyer, enViajeHoy];
  // La consulta del día no trae sinCerrar.
  const delDia = [
    viaje(4, 'EN_VIAJE', '2026-10-09T10:00:00Z'),
    viaje(5, 'PROGRAMADO', '2026-10-09T20:00:00Z'),
    viaje(6, 'FINALIZADO', '2026-10-09T09:00:00Z'),
    viaje(7, 'A_CONFIRMAR'),
    viaje(8, 'CANCELADO'),
  ];

  test('el En viaje que empezó ayer queda una sola vez, en sin cerrar', () => {
    const { sinCerrar, deHoy } = separarSinCerrar(unirViajesDeHoy(abiertosHastaHoy, enViaje, delDia));
    assert.deepEqual(sinCerrar.map((v) => v.id), [1, 2, 3]);
    assert.deepEqual(deHoy.map((v) => v.id), [6, 4, 5]);
  });

  test('un A confirmar sin cerrar queda; los A confirmar y Cancelados de hoy, no', () => {
    const ids = unirViajesDeHoy(abiertosHastaHoy, enViaje, delDia).map((v) => v.id);
    assert.ok(ids.includes(2));
    assert.ok(!ids.includes(7) && !ids.includes(8));
  });

  test('sin la marca del backend nada es sin cerrar: el front no recalcula la regla', () => {
    const { sinCerrar } = separarSinCerrar(unirViajesDeHoy([viaje(1, 'PROGRAMADO', '2026-10-01T12:00:00Z')]));
    assert.deepEqual(sinCerrar, []);
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
