// Tests de la regla de "Comenzar viaje" con otro viaje en curso. Se corren con
// `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MOTIVOS_BLOQUEO_COMENZAR, viajeEnCursoQueBloquea } from './viajeEnCurso.js';

const programado = { id: 1, estado: 'PROGRAMADO', choferId: 5, vehiculoId: 12 };

describe('viajeEnCursoQueBloquea', () => {
  test('sin viajes en curso no bloquea', () => {
    assert.equal(viajeEnCursoQueBloquea(programado, []), null);
    assert.equal(viajeEnCursoQueBloquea(programado), null);
  });

  test('el chofer con otro viaje En viaje bloquea, con ese viaje', () => {
    const enCurso = { id: 2, estado: 'EN_VIAJE', choferId: 5, vehiculoId: 30 };
    assert.deepEqual(viajeEnCursoQueBloquea(programado, [enCurso]), { viaje: enCurso, motivo: 'chofer' });
  });

  test('el vehículo en otro viaje En viaje (de otro chofer) también bloquea', () => {
    const enCurso = { id: 3, estado: 'EN_VIAJE', choferId: 8, vehiculoId: 12 };
    assert.deepEqual(viajeEnCursoQueBloquea(programado, [enCurso]), { viaje: enCurso, motivo: 'vehiculo' });
  });

  test('si coinciden los dos, gana el chofer', () => {
    const delVehiculo = { id: 3, estado: 'EN_VIAJE', choferId: 8, vehiculoId: 12 };
    const delChofer = { id: 2, estado: 'EN_VIAJE', choferId: 5, vehiculoId: 30 };
    assert.equal(viajeEnCursoQueBloquea(programado, [delVehiculo, delChofer]).motivo, 'chofer');
  });

  test('toma los ids del objeto anidado si no vienen sueltos', () => {
    const viaje = { id: 1, estado: 'PROGRAMADO', chofer: { id: 5 }, vehiculo: { id: 12 } };
    const enCurso = { id: 2, estado: 'EN_VIAJE', chofer: { id: 5 }, vehiculo: { id: 30 } };
    assert.equal(viajeEnCursoQueBloquea(viaje, [enCurso]).motivo, 'chofer');
  });

  test('otro chofer y otro vehículo en curso no bloquean', () => {
    assert.equal(viajeEnCursoQueBloquea(programado, [{ id: 4, estado: 'EN_VIAJE', choferId: 8, vehiculoId: 30 }]), null);
  });

  test('el mismo viaje, o uno que no está En viaje, no cuentan', () => {
    assert.equal(viajeEnCursoQueBloquea(programado, [{ ...programado, estado: 'EN_VIAJE' }]), null);
    assert.equal(viajeEnCursoQueBloquea(programado, [{ id: 2, estado: 'FINALIZADO', choferId: 5 }]), null);
  });

  test('un viaje que no está Programado nunca se bloquea (no tiene "Comenzar")', () => {
    const enCurso = { id: 2, estado: 'EN_VIAJE', choferId: 5 };
    assert.equal(viajeEnCursoQueBloquea({ ...programado, estado: 'A_CONFIRMAR' }, [enCurso]), null);
    assert.equal(viajeEnCursoQueBloquea(null, [enCurso]), null);
  });

  test('el motivo del chofer es el texto pedido', () => {
    assert.equal(MOTIVOS_BLOQUEO_COMENZAR.chofer, 'Terminá el viaje en curso antes de comenzar otro.');
  });
});
