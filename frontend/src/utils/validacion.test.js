// Tests de la validación local del alta de viajes y de vehículos (todo en una
// sola vuelta). Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERRORES_VIAJE, erroresObligatoriosViaje } from './validacionViaje.js';
import { validarVehiculo } from './validacionVehiculo.js';

describe('erroresObligatoriosViaje', () => {
  test('vacío: cliente, origen, destino y fecha de inicio, juntos', () => {
    const errores = erroresObligatoriosViaje({ clienteId: '', origenId: '', destinoId: '', fechaInicio: '' });
    assert.deepEqual(errores, ERRORES_VIAJE);
  });

  test('completo: sin errores (ids numéricos o en texto)', () => {
    assert.deepEqual(erroresObligatoriosViaje({ clienteId: 3, origenId: '1', destinoId: 2, fechaInicio: '2026-10-21T08:00' }), {});
  });

  test('solo falta la fecha: solo ese error', () => {
    assert.deepEqual(erroresObligatoriosViaje({ clienteId: 3, origenId: 1, destinoId: 2, fechaInicio: '' }), {
      fechaInicio: ERRORES_VIAJE.fechaInicio,
    });
  });
});

const VEHICULO_VALIDO = {
  numeroInterno: '30',
  dominio: 'ab123cd',
  marcaId: 1,
  modeloId: 4,
  tipoVehiculoId: '1',
  anio: '2020',
  asientos: '45',
  kilometraje: '0',
};
const validar = (cambios, opciones = {}) =>
  validarVehiculo({ ...VEHICULO_VALIDO, ...cambios }, { conKilometraje: true, anioActual: 2026, ...opciones });

describe('validarVehiculo', () => {
  test('completo y válido: sin errores (dominio en minúsculas incluido)', () => {
    assert.deepEqual(validar({}), {});
  });

  test('vacío: todos los errores juntos, la marca en Marca y el kilometraje incluido', () => {
    const vacio = Object.fromEntries(Object.keys(VEHICULO_VALIDO).map((campo) => [campo, '']));
    assert.deepEqual(validarVehiculo(vacio, { conKilometraje: true, anioActual: 2026 }), {
      numeroInterno: 'El número de interno es obligatorio',
      dominio: 'El dominio es obligatorio',
      marcaId: 'Elegí la marca',
      tipoVehiculoId: 'El tipo de vehículo es obligatorio',
      anio: 'El año es obligatorio',
      asientos: 'La cantidad de asientos es obligatoria',
      kilometraje: 'El kilometraje es obligatorio',
    });
  });

  test('con marca y sin modelo: el error va en Modelo', () => {
    assert.deepEqual(validar({ modeloId: '' }), { modeloId: 'Elegí el modelo' });
  });

  test('dominio con formato inválido', () => {
    assert.match(validar({ dominio: 'A1' }).dominio, /formato de patente/);
  });

  test('año: 1890, futuro y decimal fuera de rango; los extremos valen', () => {
    for (const anio of ['1890', '2027', '2020.5', 'abc']) {
      assert.equal(validar({ anio }).anio, 'El año tiene que estar entre 1970 y 2026', anio);
    }
    assert.deepEqual(validar({ anio: '1970' }), {});
    assert.deepEqual(validar({ anio: 2026 }), {});
  });

  test('asientos: 0, negativo y 101 fuera de rango; 1 y 100 valen', () => {
    for (const asientos of ['0', '-3', '101']) {
      assert.equal(validar({ asientos }).asientos, 'La cantidad de asientos tiene que estar entre 1 y 100', asientos);
    }
    assert.deepEqual(validar({ asientos: '1' }), {});
    assert.deepEqual(validar({ asientos: 100 }), {});
  });

  test('kilometraje: negativo o decimal es error en el alta; al editar no se valida', () => {
    assert.match(validar({ kilometraje: '-5' }).kilometraje, /mayor o igual a 0/);
    assert.match(validar({ kilometraje: '10.5' }).kilometraje, /mayor o igual a 0/);
    assert.deepEqual(validar({ kilometraje: undefined }, { conKilometraje: false }), {});
  });
});
