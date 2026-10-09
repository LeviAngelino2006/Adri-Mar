// Tests de los formateadores de horario y de día de los viajes (hora de Córdoba).
// Se corren con `npm test` (node:test). "Ahora" es siempre un parámetro.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatearDni,
  formatearFechaCorta,
  formatearHoraRelativaHoy,
  formatearHorarioViaje,
  partesFechaTile,
  tituloDiaViajes,
} from './viajeFormato.js';

// Hora de Córdoba = UTC - 3. "Ahora" = viernes 9/10/2026 12:00 en Córdoba.
const AHORA = Date.parse('2026-10-09T15:00:00Z');

describe('formatearHorarioViaje', () => {
  test('mismo día: inicio – fin, con raya y espacios', () => {
    assert.equal(formatearHorarioViaje('2026-10-09T10:30:00Z', '2026-10-09T13:00:00Z'), '07:30 – 10:00');
  });

  test('si el fin cae otro día, el fin lleva el día', () => {
    assert.equal(formatearHorarioViaje('2026-10-11T01:00:00Z', '2026-10-11T05:00:00Z'), '22:00 – 11 oct 02:00');
  });

  test('sin fecha de fin, solo la hora de inicio', () => {
    assert.equal(formatearHorarioViaje('2026-10-09T10:30:00Z', null), '07:30');
  });
});

describe('partesFechaTile', () => {
  test('día con dos dígitos y mes abreviado, del día de Córdoba', () => {
    assert.deepEqual(partesFechaTile('2026-10-09T10:30:00Z'), { dia: '09', mes: 'oct' });
    // 23:30 del 9 en Córdoba = 02:30Z del 10.
    assert.deepEqual(partesFechaTile('2026-10-10T02:30:00Z'), { dia: '09', mes: 'oct' });
  });
});

describe('tituloDiaViajes', () => {
  test('hoy, mañana y ayer llevan la palabra adelante', () => {
    assert.equal(tituloDiaViajes('2026-10-09', AHORA), 'Hoy · vie 9 oct');
    assert.equal(tituloDiaViajes('2026-10-10', AHORA), 'Mañana · sáb 10 oct');
    assert.equal(tituloDiaViajes('2026-10-08', AHORA), 'Ayer · jue 8 oct');
  });

  test('cualquier otro día, solo el día', () => {
    assert.equal(tituloDiaViajes('2026-10-07', AHORA), 'mié 7 oct');
  });

  test('el año va solo si no es el año en curso', () => {
    assert.equal(tituloDiaViajes('2025-12-29', AHORA), 'lun 29 dic 2025');
  });

  test('"hoy" es el día de Córdoba aunque en UTC ya sea el siguiente', () => {
    const ahora = Date.parse('2026-10-10T02:00:00Z'); // 23:00 del 9 en Córdoba
    assert.equal(tituloDiaViajes('2026-10-09', ahora), 'Hoy · vie 9 oct');
  });
});

describe('formatearHoraRelativaHoy', () => {
  test('hoy solo la hora; ayer y mañana con la palabra; otro día con la fecha', () => {
    assert.equal(formatearHoraRelativaHoy('2026-10-09T10:30:00Z', AHORA), '07:30');
    assert.equal(formatearHoraRelativaHoy('2026-10-09T01:00:00Z', AHORA), 'ayer 22:00');
    assert.equal(formatearHoraRelativaHoy('2026-10-10T05:00:00Z', AHORA), 'mañana 02:00');
    assert.equal(formatearHoraRelativaHoy('2026-10-08T01:00:00Z', AHORA), '07 oct 22:00');
  });
});

describe('formatearFechaCorta', () => {
  test('día con dos dígitos, mes sin punto y año', () => {
    assert.equal(formatearFechaCorta('2026-03-12T15:00:00Z'), '12 mar 2026');
    assert.equal(formatearFechaCorta('2026-10-05T15:00:00Z'), '05 oct 2026');
  });

  test('usa el día de Córdoba, no el de UTC', () => {
    // 01:30 UTC del 1/1 = 22:30 del 31/12 en Córdoba.
    assert.equal(formatearFechaCorta('2026-01-01T01:30:00Z'), '31 dic 2025');
  });
});

describe('formatearDni', () => {
  test('agrega los puntos de miles', () => {
    assert.equal(formatearDni('38456789'), '38.456.789');
    assert.equal(formatearDni('7456789'), '7.456.789');
    assert.equal(formatearDni(38456789), '38.456.789');
  });

  test('un valor no numérico se muestra tal cual', () => {
    assert.equal(formatearDni('38.456.789'), '38.456.789');
    assert.equal(formatearDni('M1234567'), 'M1234567');
  });
});
