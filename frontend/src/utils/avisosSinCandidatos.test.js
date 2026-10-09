// Tests del texto que explica un viaje sin candidatos en el modal de Confirmar.
// Se corren con `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIN_CHOFERES,
  SIN_CHOFERES_NI_VEHICULOS,
  SIN_VEHICULOS,
  avisosSinCandidatos,
} from './avisosSinCandidatos.js';

const candidato = { id: 1 };

describe('avisosSinCandidatos', () => {
  test('sin choferes ni vehículos: un solo texto, arriba del bloque de chofer', () => {
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: [], vehiculosCandidatos: [] }), {
      antesDeChofer: 'Este viaje no tiene choferes ni vehículos posibles cargados. Elegí uno de la lista.',
      antesDeVehiculo: null,
    });
  });

  test('faltan solo los choferes: el texto va arriba del bloque de chofer', () => {
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: [], vehiculosCandidatos: [candidato] }), {
      antesDeChofer: 'Este viaje no tiene choferes posibles cargados. Elegí uno de la lista.',
      antesDeVehiculo: null,
    });
  });

  test('faltan solo los vehículos: el texto va arriba del bloque de vehículo', () => {
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: [candidato], vehiculosCandidatos: [] }), {
      antesDeChofer: null,
      antesDeVehiculo: 'Este viaje no tiene vehículos posibles cargados. Elegí uno de la lista.',
    });
  });

  test('con candidatos de los dos tipos no hay ningún texto', () => {
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: [candidato], vehiculosCandidatos: [candidato] }), {
      antesDeChofer: null,
      antesDeVehiculo: null,
    });
  });

  test('si la clave no llegó no se sabe: no se afirma que "no tiene" candidatos', () => {
    const nada = { antesDeChofer: null, antesDeVehiculo: null };
    assert.deepEqual(avisosSinCandidatos({}), nada);
    assert.deepEqual(avisosSinCandidatos(undefined), nada);
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: null, vehiculosCandidatos: undefined }), nada);
  });

  test('una clave ausente y la otra vacía: solo habla de la vacía', () => {
    assert.deepEqual(avisosSinCandidatos({ vehiculosCandidatos: [] }), {
      antesDeChofer: null,
      antesDeVehiculo: SIN_VEHICULOS,
    });
    assert.deepEqual(avisosSinCandidatos({ choferesCandidatos: [] }), {
      antesDeChofer: SIN_CHOFERES,
      antesDeVehiculo: null,
    });
  });

  test('los textos son los acordados', () => {
    assert.equal(SIN_CHOFERES_NI_VEHICULOS, 'Este viaje no tiene choferes ni vehículos posibles cargados. Elegí uno de la lista.');
    assert.equal(SIN_CHOFERES, 'Este viaje no tiene choferes posibles cargados. Elegí uno de la lista.');
    assert.equal(SIN_VEHICULOS, 'Este viaje no tiene vehículos posibles cargados. Elegí uno de la lista.');
  });
});
