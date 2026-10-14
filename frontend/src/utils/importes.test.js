// Tests de los importes de presupuestos (centavos enteros) y del formato de
// moneda. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aCentavos,
  calcularImportes,
  centavosAImporteIngresado,
  centavosAString,
  formatearAlicuota,
  importeIngresadoACentavos,
} from './importes.js';
import { formatearPesos } from './moneda.js';

// Intl separa "$" del número con un espacio duro (U+00A0).
const sinEspacioDuro = (texto) => texto.replace(/ /g, ' ');

describe('calcularImportes', () => {
  test('con factura: neto 420.000 da IVA 44.100 y total 464.100', () => {
    assert.deepEqual(calcularImportes({ importeNeto: '420000.00', conFactura: true, alicuotaIva: '10.50' }), {
      neto: 42000000,
      iva: 4410000,
      total: 46410000,
    });
  });

  test('con factura: neto 1.234,56 redondea el IVA al centavo (129,6288 → 129,63)', () => {
    assert.deepEqual(calcularImportes({ importeNeto: '1234.56', conFactura: true, alicuotaIva: '10.50' }), {
      neto: 123456,
      iva: 12963,
      total: 136419,
    });
  });

  test('el redondeo de medio centavo va para arriba (neto 0,10 → IVA 0,0105 → 0,01)', () => {
    // 10 centavos × 10,5% = 1,05 centavos → 1. Y 1.000 centavos × 10,5% = 105 exacto.
    assert.equal(calcularImportes({ importeNeto: '0.10', conFactura: true, alicuotaIva: '10.50' }).iva, 1);
    assert.equal(calcularImportes({ importeNeto: '0.20', conFactura: true, alicuotaIva: '10.50' }).iva, 2);
    // 0,30 × 10,5% = 3,15 centavos → 3; 0,70 → 7,35 → 7; 1,00 → 10,5 → 11 (mitad: para arriba).
    assert.equal(calcularImportes({ importeNeto: '1.00', conFactura: true, alicuotaIva: '10.50' }).iva, 11);
  });

  test('con recibo: IVA 0 y total = neto', () => {
    assert.deepEqual(calcularImportes({ importeNeto: '420000.00', conFactura: false, alicuotaIva: '10.50' }), {
      neto: 42000000,
      iva: 0,
      total: 42000000,
    });
  });

  test('usa la alícuota guardada en el presupuesto, no una fija', () => {
    assert.equal(calcularImportes({ importeNeto: '1000', conFactura: true, alicuotaIva: '21.00' }).iva, 21000);
  });

  test('acepta el importe como número además del string de la API', () => {
    assert.equal(calcularImportes({ importeNeto: 1234.56, conFactura: true, alicuotaIva: 10.5 }).total, 136419);
  });

  test('importe inválido o vacío: todo en null', () => {
    // Solo el formato de la API: lo que tipea el usuario pasa antes por
    // importeIngresadoACentavos.
    for (const importeNeto of ['', 'abc', '12.345', '-5', '1.234,56', '1234,56', null]) {
      assert.deepEqual(calcularImportes({ importeNeto, conFactura: true, alicuotaIva: '10.50' }), {
        neto: null,
        iva: null,
        total: null,
      });
    }
  });

  test('un importe máximo (Decimal 12,2) no pierde precisión', () => {
    const { neto, iva, total } = calcularImportes({ importeNeto: '9999999999.99', conFactura: true, alicuotaIva: '10.50' });
    assert.equal(neto, 999999999999);
    assert.equal(iva, 105000000000); // 104.999.999.999,895 centavos → redondea a 105.000.000.000
    assert.equal(total, 1104999999999);
  });
});

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

describe('formatearAlicuota', () => {
  test('"10.50" → "10,5%"', () => {
    assert.equal(formatearAlicuota('10.50'), '10,5%');
    assert.equal(formatearAlicuota('21.00'), '21%');
  });
});
