// Contenido de las tarjetas de choferes y vehículos posibles (SCRUM-251).
// Se corre con `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXTO_HABILITADO,
  TEXTO_NO_HABILITADO,
  estadoHabilitacion,
  habilitadosPrimero,
  tarjetaChofer,
  tarjetaVehiculo,
  textoAsientos,
} from './tarjetasCandidatos.js';

describe('estadoHabilitacion', () => {
  test('sin la clave disponible, o en true: habilitado', () => {
    assert.deepEqual(estadoHabilitacion({ id: 1 }), { texto: TEXTO_HABILITADO, tono: 'ok' });
    assert.deepEqual(estadoHabilitacion({ id: 1, disponible: true, motivo: null }), { texto: 'Habilitado', tono: 'ok' });
  });

  test('disponible: false muestra el motivo tal como viene del backend', () => {
    assert.deepEqual(estadoHabilitacion({ disponible: false, motivo: 'Documentación vencida (Licencia de conducir)' }), {
      texto: 'Documentación vencida (Licencia de conducir)',
      tono: 'error',
    });
  });

  test('disponible: false sin motivo: un texto genérico, nunca vacío', () => {
    assert.deepEqual(estadoHabilitacion({ disponible: false, motivo: '' }), { texto: TEXTO_NO_HABILITADO, tono: 'error' });
  });
});

describe('tarjetaChofer', () => {
  test('nombre completo y habilitado', () => {
    assert.deepEqual(tarjetaChofer({ id: 5, nombre: 'Ana', apellido: 'Pérez' }), {
      id: 5,
      titulo: 'Ana Pérez',
      detalles: [],
      estado: { texto: 'Habilitado', tono: 'ok' },
      deshabilitada: false,
    });
  });

  test('con documentación vencida: deshabilitada y con el motivo', () => {
    const tarjeta = tarjetaChofer({ id: 6, nombre: 'Beto', apellido: 'Gómez', disponible: false, motivo: 'Licencia vencida' });
    assert.equal(tarjeta.deshabilitada, true);
    assert.deepEqual(tarjeta.estado, { texto: 'Licencia vencida', tono: 'error' });
  });
});

describe('tarjetaVehiculo', () => {
  test('interno, patente y asientos', () => {
    assert.deepEqual(tarjetaVehiculo({ id: 7, numeroInterno: '12', dominio: 'AE452KD', asientos: 45, disponible: true }), {
      id: 7,
      titulo: 'Interno 12',
      detalles: ['Patente AE452KD', '45 asientos'],
      estado: { texto: 'Habilitado', tono: 'ok' },
      deshabilitada: false,
    });
  });

  test('sin el dato de asientos (un candidato guardado no lo trae) no inventa nada', () => {
    assert.deepEqual(tarjetaVehiculo({ id: 7, numeroInterno: '12', dominio: 'AE452KD' }).detalles, ['Patente AE452KD']);
    assert.deepEqual(tarjetaVehiculo({ id: 7, numeroInterno: '12', dominio: 'AE452KD', asientos: null }).detalles, [
      'Patente AE452KD',
    ]);
  });

  test('con documentación vencida: deshabilitada y con el motivo', () => {
    const tarjeta = tarjetaVehiculo({
      id: 8,
      numeroInterno: '3',
      dominio: 'AB123CD',
      asientos: 19,
      disponible: false,
      motivo: 'Documentación vencida (VTV)',
    });
    assert.equal(tarjeta.deshabilitada, true);
    assert.deepEqual(tarjeta.estado, { texto: 'Documentación vencida (VTV)', tono: 'error' });
  });
});

describe('textoAsientos', () => {
  test('singular, plural y cero', () => {
    assert.equal(textoAsientos(1), '1 asiento');
    assert.equal(textoAsientos(45), '45 asientos');
    assert.equal(textoAsientos(0), '0 asientos');
  });

  test('sin dato: null', () => {
    for (const vacio of [null, undefined, '', 'muchos']) assert.equal(textoAsientos(vacio), null, String(vacio));
  });
});

describe('habilitadosPrimero', () => {
  const t = (id, deshabilitada = false) => ({ id, deshabilitada });

  test('los habilitados primero y los deshabilitados al final, cada grupo en su orden original', () => {
    const lista = [t(1, true), t(2), t(3, true), t(4), t(5)];
    assert.deepEqual(habilitadosPrimero(lista).map((x) => x.id), [2, 4, 5, 1, 3]);
  });

  test('no modifica la lista que recibe', () => {
    const lista = [t(1, true), t(2)];
    habilitadosPrimero(lista);
    assert.deepEqual(lista.map((x) => x.id), [1, 2]);
  });

  test('acepta otro criterio de deshabilitado (el del modal, con la disponibilidad)', () => {
    const noDisponibles = new Set([7]);
    assert.deepEqual(habilitadosPrimero([{ id: 7 }, { id: 8 }], (x) => noDisponibles.has(x.id)).map((x) => x.id), [8, 7]);
  });
});
