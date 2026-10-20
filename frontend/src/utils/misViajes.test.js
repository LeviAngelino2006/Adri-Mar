// Tests de las vistas y el orden de Mis viajes. Se corren con `npm test`
// (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarPorInicio, viajesDeLaVista, vistaMisViajes } from './misViajes.js';

const viaje = (id, estado, fechaInicio) => ({ id, estado, fechaInicio });
const ids = (viajes) => viajes.map((v) => v.id);

// Como los manda el backend: del más futuro al más viejo.
const VIAJES = [
  viaje('27 oct', 'PROGRAMADO', '2026-10-27T06:30:00Z'),
  viaje('21 oct', 'PROGRAMADO', '2026-10-22T01:00:00Z'),
  viaje('en curso', 'EN_VIAJE', '2026-10-20T09:00:00Z'),
  viaje('atrasado de ayer', 'PROGRAMADO', '2026-10-19T11:00:00Z'),
  viaje('cancelado 17 oct', 'CANCELADO', '2026-10-17T12:00:00Z'),
  viaje('finalizado 15 oct', 'FINALIZADO', '2026-10-15T10:00:00Z'),
];

describe('viajesDeLaVista', () => {
  test('Próximos: el viaje en curso aparte y los Programados del más próximo al más lejano', () => {
    const { enCurso, resto } = viajesDeLaVista(VIAJES, 'proximos');
    assert.deepEqual(ids(enCurso), ['en curso']);
    assert.deepEqual(ids(resto), ['atrasado de ayer', '21 oct', '27 oct']);
  });

  test('Anteriores: Finalizados y Cancelados, el más reciente primero', () => {
    const { enCurso, resto } = viajesDeLaVista([...VIAJES].reverse(), 'anteriores');
    assert.deepEqual(enCurso, []);
    assert.deepEqual(ids(resto), ['cancelado 17 oct', 'finalizado 15 oct']);
  });

  test('sin viaje en curso, Próximos no tiene grupo En curso', () => {
    const { enCurso } = viajesDeLaVista(VIAJES.filter((v) => v.estado !== 'EN_VIAJE'), 'proximos');
    assert.deepEqual(enCurso, []);
  });

  test('no modifica el arreglo recibido', () => {
    const copia = [...VIAJES];
    viajesDeLaVista(VIAJES, 'proximos');
    assert.deepEqual(VIAJES, copia);
  });
});

describe('ordenarPorInicio', () => {
  test('un viaje sin fecha de inicio va al final en los dos sentidos', () => {
    const viajes = [viaje('sin fecha', 'PROGRAMADO', null), viaje('b', 'PROGRAMADO', '2026-10-21T10:00:00Z'), viaje('a', 'PROGRAMADO', '2026-10-20T10:00:00Z')];
    assert.deepEqual(ids(ordenarPorInicio(viajes, 'asc')), ['a', 'b', 'sin fecha']);
    assert.deepEqual(ids(ordenarPorInicio(viajes, 'desc')), ['b', 'a', 'sin fecha']);
  });
});

describe('vistaMisViajes', () => {
  test('?tab=anteriores es Anteriores; cualquier otro valor, Próximos', () => {
    assert.equal(vistaMisViajes('anteriores'), 'anteriores');
    assert.equal(vistaMisViajes(null), 'proximos');
    assert.equal(vistaMisViajes('cualquiera'), 'proximos');
  });
});
