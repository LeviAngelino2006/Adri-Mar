// SCRUM-249: un pago Pendiente no tiene fecha de pago. Se corre con `npm test`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { esPagoPendiente, limpiarFechasDePagosPendientes } from './pagoPendiente.js';

const ESTADOS_PAGO = [
  { id: 1, descripcion: 'PENDIENTE' },
  { id: 2, descripcion: 'PAGADO' },
  { id: 3, descripcion: 'PARCIAL' },
];

const valores = (extra = {}) => ({
  estadoPagoClienteId: '',
  fechaPagoCliente: '',
  estadoPagoChoferId: '',
  fechaPagoChofer: '',
  ...extra,
});

describe('esPagoPendiente', () => {
  test('reconoce Pendiente tanto con el id numérico (viaje) como string (<select>)', () => {
    assert.equal(esPagoPendiente(1, ESTADOS_PAGO), true);
    assert.equal(esPagoPendiente('1', ESTADOS_PAGO), true);
  });

  test('Pagado, Parcial, sin definir o sin catálogo cargado: no es Pendiente', () => {
    assert.equal(esPagoPendiente('2', ESTADOS_PAGO), false);
    assert.equal(esPagoPendiente(3, ESTADOS_PAGO), false);
    assert.equal(esPagoPendiente('', ESTADOS_PAGO), false);
    assert.equal(esPagoPendiente(1, []), false);
  });
});

describe('limpiarFechasDePagosPendientes', () => {
  test('vacía la fecha de cada pago Pendiente (cliente y chofer)', () => {
    const resultado = limpiarFechasDePagosPendientes(
      valores({ estadoPagoClienteId: '1', fechaPagoCliente: '2026-10-10', estadoPagoChoferId: 1, fechaPagoChofer: '2026-10-11' }),
      ESTADOS_PAGO
    );
    assert.equal(resultado.fechaPagoCliente, '');
    assert.equal(resultado.fechaPagoChofer, '');
  });

  test('no toca la fecha de un pago Pagado o Parcial', () => {
    const entrada = valores({ estadoPagoClienteId: '2', fechaPagoCliente: '2026-10-10', estadoPagoChoferId: '3', fechaPagoChofer: '2026-10-11' });
    assert.equal(limpiarFechasDePagosPendientes(entrada, ESTADOS_PAGO), entrada);
  });
});
