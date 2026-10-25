import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { payloadDelToken, cambioLaSesion } from './sesion.js';

// Un JWT con este payload (la firma no se verifica en el front).
function tokenCon(payload) {
  const parte = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
  return `${parte({ alg: 'HS256', typ: 'JWT' })}.${parte(payload)}.firma`;
}

describe('payloadDelToken', () => {
  test('lee el payload, también con acentos', () => {
    const payload = { id: 4, perfil: 'ENCARGADO', habilitadoParaConducir: false, nombreUsuario: 'lucía' };
    assert.deepEqual(payloadDelToken(tokenCon(payload)), payload);
  });

  test('un token roto da null', () => {
    assert.equal(payloadDelToken('no-es-un-jwt'), null);
    assert.equal(payloadDelToken(''), null);
  });
});

describe('cambioLaSesion', () => {
  const guardado = { id: 4, perfil: 'ENCARGADO', habilitadoParaConducir: false, nombre: 'Diego' };

  test('mismo perfil y habilitación: no cambió', () => {
    assert.equal(cambioLaSesion(guardado, { perfil: 'ENCARGADO', habilitadoParaConducir: false }), false);
  });

  test('otro perfil: cambió', () => {
    assert.equal(cambioLaSesion(guardado, { perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false }), true);
  });

  test('otra habilitación: cambió (aparece o desaparece "Mis viajes")', () => {
    assert.equal(cambioLaSesion(guardado, { perfil: 'ENCARGADO', habilitadoParaConducir: true }), true);
  });

  test('sin usuario guardado o sin payload: no hay nada que comparar', () => {
    assert.equal(cambioLaSesion(null, { perfil: 'CHOFER' }), false);
    assert.equal(cambioLaSesion(guardado, null), false);
  });
});
