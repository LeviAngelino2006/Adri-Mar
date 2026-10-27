// Tests de los importes de presupuestos (centavos enteros) y del formato de
// moneda. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aCentavos, centavosAImporteIngresado, centavosAString, importeIngresadoACentavos } from './importes.js';
import { formatearPesos, formatearPesosConCentavos } from './moneda.js';

// Intl separa "$" del número con un espacio duro (U+00A0).
const sinEspacioDuro = (texto) => texto.replace(/ /g, ' ');

describe('aCentavos y centavosAString', () => {
  test('convierte sin floats', () => {
    assert.equal(aCentavos('0.1'), 10);
    assert.equal(aCentavos('0.29'), 29);
    assert.equal(aCentavos('420000.00'), 42000000);
    assert.equal(aCentavos('1234.5'), 123450);
    assert.equal(aCentavos('1234,5'), null, 'la API usa punto decimal');
    assert.equal(aCentavos(0.29), 29);
  });

  test('ida y vuelta', () => {
    assert.equal(centavosAString(123456), '1234.56');
    assert.equal(centavosAString(5), '0.05');
    assert.equal(centavosAString(42000000), '420000.00');
  });
});

describe('importeIngresadoACentavos (formato argentino)', () => {
  for (const [texto, centavos] of [
    ['420000', 42000000],
    ['420000,5', 42000050],
    ['420000,50', 42000050],
    ['420.000', 42000000],
    ['420.000,50', 42000050],
    ['1.234,56', 123456],
    ['1.234.567,5', 123456750],
    ['999', 99900],
    ['0,05', 5],
    ['  420.000  ', 42000000],
  ]) {
    test(`válido: ${JSON.stringify(texto)} → ${centavos}`, () => {
      assert.equal(importeIngresadoACentavos(texto), centavos);
    });
  }

  for (const texto of [
    '420.00', // punto que no separa miles
    '42.0000',
    '4200.000', // primer grupo de más de 3 dígitos
    '420.0000',
    '1.23',
    '1234.56', // punto decimal
    '420.000,123', // 3 decimales
    '420.000,',
    ',50',
    '.420',
    '420,000.50', // formato inglés
    '420 000',
    '-420',
    '',
    'abc',
  ]) {
    test(`inválido: ${JSON.stringify(texto)}`, () => {
      assert.equal(importeIngresadoACentavos(texto), null);
    });
  }

  test('ida y vuelta para precargar el campo al duplicar', () => {
    for (const [centavos, texto] of [
      [42000000, '420.000'],
      [123450, '1.234,50'],
      [123405, '1.234,05'],
      [99900, '999'],
      [5, '0,05'],
    ]) {
      assert.equal(centavosAImporteIngresado(centavos), texto);
      assert.equal(importeIngresadoACentavos(texto), centavos);
    }
  });
});

describe('formatearPesos', () => {
  test('sin decimales si es redondo, con separador de miles', () => {
    assert.equal(sinEspacioDuro(formatearPesos(46410000)), '$ 464.100');
  });

  test('con dos decimales si tiene centavos (nunca uno solo)', () => {
    assert.equal(sinEspacioDuro(formatearPesos(136419)), '$ 1.364,19');
    assert.equal(sinEspacioDuro(formatearPesos(123450)), '$ 1.234,50');
    assert.equal(sinEspacioDuro(formatearPesos(125000050)), '$ 1.250.000,50');
    assert.equal(sinEspacioDuro(formatearPesos(5)), '$ 0,05');
  });

  test('redondo: sin decimales', () => {
    assert.equal(sinEspacioDuro(formatearPesos(42000000)), '$ 420.000');
    assert.equal(sinEspacioDuro(formatearPesos(0)), '$ 0');
  });
});

describe('formatearPesosConCentavos', () => {
  test('siempre con dos decimales, también si es redondo', () => {
    assert.equal(sinEspacioDuro(formatearPesosConCentavos(11050000)), '$ 110.500,00');
    assert.equal(sinEspacioDuro(formatearPesosConCentavos(136419)), '$ 1.364,19');
    assert.equal(sinEspacioDuro(formatearPesosConCentavos(5)), '$ 0,05');
  });
});
