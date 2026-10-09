// Tests de "hoy" y "mañana" en hora de Córdoba (UTC-3, sin horario de verano).
// Se corren con `npm test` (node:test, sin dependencias).
//
// Los instantes se escriben en UTC a propósito: la gracia es que el resultado NO
// dependa de la zona horaria de quien corre el test ni del día que ya sea en UTC.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fechaCordobaISO, hoyCordobaISO, mananaCordobaISO, sumarDiasFechaISO } from './fechaCordoba.js';

const utc = (iso) => new Date(iso).getTime();

describe('hoyCordobaISO y mananaCordobaISO', () => {
  test('a media mañana de Córdoba', () => {
    const ahora = utc('2026-10-20T14:00:00Z'); // 11:00 en Córdoba
    assert.equal(hoyCordobaISO(ahora), '2026-10-20');
    assert.equal(mananaCordobaISO(ahora), '2026-10-21');
  });

  test('de noche en Córdoba, cuando en UTC ya es el día siguiente: hoy sigue siendo el día de Córdoba', () => {
    const ahora = utc('2026-10-21T01:30:00Z'); // 22:30 del 20 en Córdoba
    assert.equal(hoyCordobaISO(ahora), '2026-10-20');
    // Con el día en UTC (error típico) daría 22: pasado mañana.
    assert.equal(mananaCordobaISO(ahora), '2026-10-21');
  });

  test('un segundo antes de medianoche de Córdoba todavía es el día anterior', () => {
    const ahora = utc('2026-10-20T02:59:59Z'); // 23:59:59 del 19
    assert.equal(hoyCordobaISO(ahora), '2026-10-19');
    assert.equal(mananaCordobaISO(ahora), '2026-10-20');
  });

  test('a medianoche exacta de Córdoba arranca el día nuevo', () => {
    const ahora = utc('2026-10-20T03:00:00Z'); // 00:00 del 20
    assert.equal(hoyCordobaISO(ahora), '2026-10-20');
    assert.equal(mananaCordobaISO(ahora), '2026-10-21');
  });

  test('fin de mes', () => {
    assert.equal(mananaCordobaISO(utc('2026-10-31T15:00:00Z')), '2026-11-01');
    assert.equal(mananaCordobaISO(utc('2026-11-30T15:00:00Z')), '2026-12-01');
  });

  test('fin de año', () => {
    assert.equal(mananaCordobaISO(utc('2026-12-31T15:00:00Z')), '2027-01-01');
    // 22:30 del 31/12 en Córdoba: en UTC ya es 2027.
    const ahora = utc('2027-01-01T01:30:00Z');
    assert.equal(hoyCordobaISO(ahora), '2026-12-31');
    assert.equal(mananaCordobaISO(ahora), '2027-01-01');
  });

  test('año bisiesto', () => {
    assert.equal(mananaCordobaISO(utc('2028-02-28T15:00:00Z')), '2028-02-29');
    assert.equal(mananaCordobaISO(utc('2028-02-29T15:00:00Z')), '2028-03-01');
    assert.equal(mananaCordobaISO(utc('2027-02-28T15:00:00Z')), '2027-03-01');
  });

  test('sin argumento usa el momento actual (formato YYYY-MM-DD)', () => {
    assert.match(hoyCordobaISO(), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(mananaCordobaISO(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(mananaCordobaISO(), sumarDiasFechaISO(hoyCordobaISO(), 1));
  });

  test('es coherente con fechaCordobaISO de cualquier instante', () => {
    const ahora = utc('2026-10-21T01:30:00Z');
    assert.equal(hoyCordobaISO(ahora), fechaCordobaISO('2026-10-21T01:30:00Z'));
  });
});

describe('sumarDiasFechaISO', () => {
  test('suma y resta días de calendario', () => {
    assert.equal(sumarDiasFechaISO('2026-10-20', 1), '2026-10-21');
    assert.equal(sumarDiasFechaISO('2026-10-20', 0), '2026-10-20');
    assert.equal(sumarDiasFechaISO('2026-03-01', -1), '2026-02-28');
    assert.equal(sumarDiasFechaISO('2026-12-31', 1), '2027-01-01');
    assert.equal(sumarDiasFechaISO('2026-01-31', 30), '2026-03-02');
  });
});
