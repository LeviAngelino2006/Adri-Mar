// Tests de los importes de presupuestos (centavos enteros) y del formato de
// moneda. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aCentavos, calcularImportes, centavosAString, formatearAlicuota } from './importes.js';
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

  test('acepta el importe como número o con coma decimal (lo que tipea el usuario)', () => {
    assert.equal(calcularImportes({ importeNeto: 1234.56, conFactura: true, alicuotaIva: 10.5 }).total, 136419);
    assert.equal(calcularImportes({ importeNeto: '1234,56', conFactura: true, alicuotaIva: '10.50' }).total, 136419);
  });

  test('importe inválido o vacío: todo en null', () => {
    for (const importeNeto of ['', 'abc', '12.345', '-5', '1.234,56', null]) {
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
    assert.equal(aCentavos('1234,5'), 123450);
    assert.equal(aCentavos(0.29), 29);
  });

  test('ida y vuelta', () => {
    assert.equal(centavosAString(123456), '1234.56');
    assert.equal(centavosAString(5), '0.05');
    assert.equal(centavosAString(42000000), '420000.00');
  });
});

describe('formatearPesos', () => {
  test('sin decimales si es redondo, con separador de miles', () => {
    assert.equal(sinEspacioDuro(formatearPesos(46410000)), '$ 464.100');
  });

  test('con hasta dos decimales si los tiene', () => {
    assert.equal(sinEspacioDuro(formatearPesos(136419)), '$ 1.364,19');
    assert.equal(sinEspacioDuro(formatearPesos(123450)), '$ 1.234,5');
  });
});

describe('formatearAlicuota', () => {
  test('"10.50" → "10,5%"', () => {
    assert.equal(formatearAlicuota('10.50'), '10,5%');
    assert.equal(formatearAlicuota('21.00'), '21%');
  });
});
