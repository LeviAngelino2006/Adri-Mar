// Tests de esChoferDelViaje: el chofer de un viaje es una persona y se compara con
// usuario.personaId, no con usuario.id. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { esChoferDelViaje } from './choferDelViaje.js';

// Usuario 5 con persona 12: los dos ids son distintos a propósito.
const USUARIO = { id: 5, personaId: 12 };

describe('esChoferDelViaje', () => {
  test('el chofer del viaje es la persona del usuario', () => {
    assert.equal(esChoferDelViaje({ choferId: 12 }, USUARIO), true);
  });

  test('un viaje cuyo choferId coincide con usuario.id (otra persona) no es suyo', () => {
    assert.equal(esChoferDelViaje({ choferId: 5 }, USUARIO), false);
  });

  test('sin choferId, usa chofer.id', () => {
    assert.equal(esChoferDelViaje({ chofer: { id: 12 } }, USUARIO), true);
  });

  test('sin persona (o una sesión vieja sin personaId) no es chofer de nada, tampoco de un viaje sin chofer', () => {
    assert.equal(esChoferDelViaje({ choferId: null }, { id: 5, personaId: null }), false);
    assert.equal(esChoferDelViaje({ choferId: undefined }, { id: 5 }), false);
    assert.equal(esChoferDelViaje({ choferId: 5 }, { id: 5 }), false);
  });

  test('sin viaje o sin usuario, false', () => {
    assert.equal(esChoferDelViaje(null, USUARIO), false);
    assert.equal(esChoferDelViaje({ choferId: 12 }, null), false);
  });
});
