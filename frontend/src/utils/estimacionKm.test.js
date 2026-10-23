// Tests de utils/estimacionKm. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarEstimacion,
  firmaRecorrido,
  formatearDuracion,
  idsDelRecorrido,
  mensajeErrorEstimacion,
  mensajeSinCoordenadas,
  puedeCalcularKm,
  quitarFaltante,
  ubicacionesSinCoordenadas,
} from './estimacionKm.js';

describe('idsDelRecorrido y puedeCalcularKm', () => {
  test('sin origen o sin destino no se puede calcular', () => {
    assert.equal(puedeCalcularKm(idsDelRecorrido({ origenId: '', destinoId: '', paradas: [] })), false);
    assert.equal(puedeCalcularKm(idsDelRecorrido({ origenId: 1, destinoId: '', paradas: [] })), false);
    assert.equal(puedeCalcularKm(idsDelRecorrido({ origenId: '', destinoId: 2, paradas: [] })), false);
  });

  test('con origen y destino sí, aunque no haya paradas', () => {
    assert.equal(puedeCalcularKm(idsDelRecorrido({ origenId: 1, destinoId: 2, paradas: [] })), true);
  });

  test('las paradas van en orden y las filas sin ubicación se ignoran', () => {
    const ids = idsDelRecorrido({
      origenId: 1,
      destinoId: 4,
      paradas: [{ clave: 'a', id: 3 }, { clave: 'b', id: '' }, { clave: 'c', id: 2 }],
    });
    assert.deepEqual(ids, { origenId: 1, paradaIds: [3, 2], destinoId: 4 });
  });
});

describe('firmaRecorrido (cálculo desactualizado)', () => {
  const base = { origenId: 1, paradaIds: [3, 2], destinoId: 4 };

  test('el mismo recorrido da la misma firma', () => {
    assert.equal(firmaRecorrido(base), firmaRecorrido({ ...base, paradaIds: [3, 2] }));
  });

  test('cambia si cambia el origen, el destino, una parada o el orden de las paradas', () => {
    const firma = firmaRecorrido(base);
    assert.notEqual(firmaRecorrido({ ...base, origenId: 5 }), firma);
    assert.notEqual(firmaRecorrido({ ...base, destinoId: 5 }), firma);
    assert.notEqual(firmaRecorrido({ ...base, paradaIds: [3] }), firma);
    assert.notEqual(firmaRecorrido({ ...base, paradaIds: [2, 3] }), firma);
    assert.notEqual(firmaRecorrido({ ...base, paradaIds: [3, 2, 6] }), firma);
  });

  test('una fila de parada vacía no cambia la firma (no cambia el recorrido)', () => {
    const conFilaVacia = idsDelRecorrido({ origenId: 1, destinoId: 4, paradas: [{ id: 3 }, { id: '' }, { id: 2 }] });
    assert.equal(firmaRecorrido(conFilaVacia), firmaRecorrido(base));
  });
});

describe('mensajeErrorEstimacion', () => {
  test('usa el mensaje del backend ({ error })', () => {
    const err = { response: { status: 422, data: { error: 'Falta ubicar "Hotel Sierras" en el mapa.' } } };
    assert.equal(mensajeErrorEstimacion(err), 'Falta ubicar "Hotel Sierras" en el mapa.');
  });

  test('junta los errores por campo ({ errores })', () => {
    const err = { response: { status: 400, data: { errores: { paradas: 'La parada 2 es igual al punto anterior' } } } };
    assert.equal(mensajeErrorEstimacion(err), 'La parada 2 es igual al punto anterior');
  });

  test('sin respuesta (red caída): mensaje de conexión', () => {
    assert.match(mensajeErrorEstimacion(new Error('Network Error')), /No se pudo conectar/);
  });

  test('respuesta sin mensaje: genérico que invita a cargarlos a mano', () => {
    assert.match(mensajeErrorEstimacion({ response: { status: 500, data: {} } }), /Cargalos a mano/);
  });
});

describe('formatearDuracion', () => {
  test('menos de una hora en minutos, más de una hora en horas y minutos', () => {
    assert.equal(formatearDuracion(45), '45 min');
    assert.equal(formatearDuracion(91), '1 h 31 min');
    assert.equal(formatearDuracion(120), '2 h');
    assert.equal(formatearDuracion(0), '0 min');
  });
});

describe('aplicarEstimacion (el campo se completa)', () => {
  test('pone el total redondeado en kilometrosEstimados y no toca el resto', () => {
    const form = { kilometrosEstimados: '', origenId: 1, destinoId: 2, cantidadPasajeros: '30' };
    const nuevo = aplicarEstimacion(form, { kilometros: 38, duracionMinutos: 41 });
    assert.deepEqual(nuevo, { ...form, kilometrosEstimados: '38' });
  });

  test('pisa un valor cargado a mano (el usuario apretó Calcular)', () => {
    assert.equal(aplicarEstimacion({ kilometrosEstimados: '100' }, { kilometros: 215 }).kilometrosEstimados, '215');
  });
});

describe('ubicaciones sin coordenadas (422)', () => {
  const HOTEL = { ubicacionId: 21, nombre: 'Hotel Sierras' };
  const COLEGIO = { ubicacionId: 20, nombre: 'Colegio Nacional de Monserrat' };
  const error422 = (lista) => ({ response: { status: 422, data: { error: '…', ubicacionesSinCoordenadas: lista } } });

  test('ubicacionesSinCoordenadas: la lista del 422, vacía para cualquier otro error', () => {
    assert.deepEqual(ubicacionesSinCoordenadas(error422([HOTEL])), [HOTEL]);
    assert.deepEqual(ubicacionesSinCoordenadas({ response: { status: 429, data: { error: 'cuota' } } }), []);
    assert.deepEqual(ubicacionesSinCoordenadas({ response: { status: 422, data: { error: 'ruta imposible' } } }), []);
    assert.deepEqual(ubicacionesSinCoordenadas(new Error('Network Error')), []);
  });

  test('mensajeSinCoordenadas: mismo texto que el backend, en singular y en plural', () => {
    assert.equal(mensajeSinCoordenadas([HOTEL]), 'Falta ubicar "Hotel Sierras" en el mapa.');
    assert.equal(
      mensajeSinCoordenadas([HOTEL, COLEGIO]),
      'Faltan ubicar en el mapa: "Hotel Sierras", "Colegio Nacional de Monserrat".'
    );
  });

  test('quitarFaltante: saca la ubicada y rehace el mensaje; null cuando no queda ninguna', () => {
    const errorKm = { mensaje: mensajeSinCoordenadas([HOTEL, COLEGIO]), firma: '21>20', faltantes: [HOTEL, COLEGIO] };
    const restante = quitarFaltante(errorKm, 21);
    assert.deepEqual(restante, { mensaje: 'Falta ubicar "Colegio Nacional de Monserrat" en el mapa.', firma: '21>20', faltantes: [COLEGIO] });
    assert.equal(quitarFaltante(restante, 20), null);
  });
});
