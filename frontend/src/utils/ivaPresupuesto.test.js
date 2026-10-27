// Tests de la aclaración del IVA de los presupuestos. Se corren con `npm test`
// (node:test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACLARACION_IVA, ALICUOTA_IVA } from './ivaPresupuesto.js';

test('aclaración fija con la alícuota del 10,5%', () => {
  assert.equal(ALICUOTA_IVA, 10.5);
  assert.equal(ACLARACION_IVA, 'Si es con factura, el precio es más IVA del 10,5%.');
});
