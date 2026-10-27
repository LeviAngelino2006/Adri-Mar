// Tests del precio con IVA de los presupuestos. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACLARACION_IVA, ALICUOTA_IVA, calcularPrecioConIva, textoPrecioConIva } from './ivaPresupuesto.js';
import { importeIngresadoACentavos } from './importes.js';

// Intl separa "$" del número con un espacio duro (U+00A0).
const sinEspacioDuro = (texto) => texto.replace(/ /g, ' ');

test('aclaración fija con la alícuota del 10,5%', () => {
  assert.equal(ALICUOTA_IVA, 10.5);
  assert.equal(ACLARACION_IVA, 'Si es con factura, el precio es más IVA del 10,5%.');
});

describe('calcularPrecioConIva (centavos enteros)', () => {
  test('redondo: 100.000 da exactamente 110.500 (sin error de punto flotante)', () => {
    assert.equal(calcularPrecioConIva(10000000), 11050000);
  });

  test('con decimales: 1.234,56 redondea el IVA al centavo (129,6288 → 129,63)', () => {
    assert.equal(calcularPrecioConIva(123456), 136419);
  });

  test('chicos: el medio centavo va para arriba', () => {
    // 0,10 × 10,5% = 1,05 centavos → 1; 1,00 × 10,5% = 10,5 centavos → 11.
    assert.equal(calcularPrecioConIva(10), 11);
    assert.equal(calcularPrecioConIva(100), 111);
    // 0,30 → 3,15 → 3; 0,70 → 7,35 → 7.
    assert.equal(calcularPrecioConIva(30), 33);
    assert.equal(calcularPrecioConIva(70), 77);
  });

  test('un importe máximo (Decimal 12,2) no pierde precisión', () => {
    // 104.999.999.999,895 centavos de IVA → 105.000.000.000.
    assert.equal(calcularPrecioConIva(999999999999), 1104999999999);
  });

  test('vacío, cero o inválido: null', () => {
    for (const centavos of [null, undefined, 0, -100, 12.5, NaN, '10000']) {
      assert.equal(calcularPrecioConIva(centavos), null, `centavos ${centavos}`);
    }
  });
});

describe('textoPrecioConIva', () => {
  for (const [ingresado, esperado] of [
    ['100.000', 'Con factura: $ 110.500,00 (IVA 10,5% incluido).'],
    ['1.234,56', 'Con factura: $ 1.364,19 (IVA 10,5% incluido).'],
    ['1', 'Con factura: $ 1,11 (IVA 10,5% incluido).'],
    ['0,10', 'Con factura: $ 0,11 (IVA 10,5% incluido).'],
    ['420000', 'Con factura: $ 464.100,00 (IVA 10,5% incluido).'],
  ]) {
    test(`${ingresado} → ${esperado}`, () => {
      assert.equal(sinEspacioDuro(textoPrecioConIva(importeIngresadoACentavos(ingresado))), esperado);
    });
  }

  test('importe vacío o inválido: no hay texto', () => {
    for (const ingresado of ['', '420.00', 'abc', '0']) {
      assert.equal(textoPrecioConIva(importeIngresadoACentavos(ingresado)), null, ingresado);
    }
  });
});
