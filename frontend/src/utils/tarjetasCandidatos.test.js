// Orden de los choferes y vehículos posibles (SCRUM-251).
// Se corre con `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTO_VERIFICANDO, habilitadosPrimero } from './tarjetasCandidatos.js';

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

  test('acepta otro criterio de deshabilitado (disponible: false en el buscador, la disponibilidad en el modal)', () => {
    const opciones = [{ id: 7, disponible: false }, { id: 8 }, { id: 9, disponible: true }];
    assert.deepEqual(habilitadosPrimero(opciones, (o) => o.disponible === false).map((x) => x.id), [8, 9, 7]);
  });
});

test('TEXTO_VERIFICANDO', () => {
  assert.equal(TEXTO_VERIFICANDO, 'Verificando…');
});
