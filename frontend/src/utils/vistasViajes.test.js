// Tests de lo que comparten las vistas Próximos | Anteriores de Viajes y Mis
// viajes. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISTAS_VIAJES,
  filtrosParaLaVista,
  opcionesDeEstado,
  parametrosDeVista,
  separarProximos,
  vistaDeLaUrl,
  vistaDelEstado,
} from './vistasViajes.js';

describe('vista en la URL', () => {
  test('?tab=anteriores es Anteriores; cualquier otro valor, Próximos', () => {
    assert.equal(vistaDeLaUrl('anteriores'), 'anteriores');
    assert.equal(vistaDeLaUrl(null), 'proximos');
    assert.equal(vistaDeLaUrl('cualquiera'), 'proximos');
  });

  test('Próximos no lleva parámetro; Anteriores, tab=anteriores', () => {
    assert.deepEqual(parametrosDeVista('proximos'), {});
    assert.deepEqual(parametrosDeVista('anteriores'), { tab: 'anteriores' });
  });
});

describe('estados de cada vista', () => {
  test('los abiertos son Próximos y los cerrados, Anteriores', () => {
    for (const estado of ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE']) assert.equal(vistaDelEstado(estado), 'proximos');
    for (const estado of ['FINALIZADO', 'CANCELADO']) assert.equal(vistaDelEstado(estado), 'anteriores');
  });

  test('las opciones del filtro: "Todos" y los estados de la vista, con su etiqueta', () => {
    assert.deepEqual(
      opcionesDeEstado(VISTAS_VIAJES.proximos).map((o) => o.label),
      ['Todos', 'A confirmar', 'Programado', 'En viaje']
    );
    assert.deepEqual(opcionesDeEstado(VISTAS_VIAJES.anteriores).map((o) => o.value), ['', 'FINALIZADO', 'CANCELADO']);
  });

  test('al cambiar de vista se limpia un estado que no es de la nueva, y nada más', () => {
    const filtros = { estado: 'CANCELADO', choferId: '5' };
    assert.deepEqual(filtrosParaLaVista(filtros, VISTAS_VIAJES.proximos), { estado: '', choferId: '5' });
    assert.equal(filtrosParaLaVista(filtros, VISTAS_VIAJES.anteriores), filtros);
    const sinEstado = { estado: '', choferId: '' };
    assert.equal(filtrosParaLaVista(sinEstado, VISTAS_VIAJES.proximos), sinEstado);
  });
});

describe('separarProximos', () => {
  test('sin cerrar según el backend, después los En viaje y el resto, en el orden recibido', () => {
    const viajes = [
      { id: 1, estado: 'PROGRAMADO', sinCerrar: true },
      { id: 2, estado: 'EN_VIAJE', sinCerrar: true },
      { id: 3, estado: 'EN_VIAJE', sinCerrar: false },
      { id: 4, estado: 'PROGRAMADO', sinCerrar: false },
      { id: 5, estado: 'A_CONFIRMAR', sinCerrar: false },
    ];
    const { sinCerrar, enCurso, resto } = separarProximos(viajes);
    assert.deepEqual(sinCerrar.map((v) => v.id), [1, 2]);
    // El En viaje que empezó ayer está solo en "sin cerrar".
    assert.deepEqual(enCurso.map((v) => v.id), [3]);
    assert.deepEqual(resto.map((v) => v.id), [4, 5]);
  });
});
