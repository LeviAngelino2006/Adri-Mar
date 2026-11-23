import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { alcanceDeViajes, puedeVerViajes } from './permisosViajes.js';

const usuario = (perfil, habilitadoParaConducir) => ({ perfil, habilitadoParaConducir });

describe('alcanceDeViajes', () => {
  test('Administrador y Encargado ven todos', () => {
    assert.equal(alcanceDeViajes(usuario('ADMINISTRADOR', false)), 'TODOS');
    assert.equal(alcanceDeViajes(usuario('ENCARGADO', true)), 'TODOS');
  });

  test('Chofer ve los propios', () => {
    assert.equal(alcanceDeViajes(usuario('CHOFER', true)), 'PROPIOS');
  });

  test('Personal de Taller: sin habilitación ninguno, con habilitación los propios', () => {
    assert.equal(alcanceDeViajes(usuario('PERSONAL_TALLER', false)), 'NINGUNO');
    assert.equal(alcanceDeViajes(usuario('PERSONAL_TALLER', undefined)), 'NINGUNO');
    assert.equal(alcanceDeViajes(usuario('PERSONAL_TALLER', true)), 'PROPIOS');
    assert.equal(puedeVerViajes(usuario('PERSONAL_TALLER', false)), false);
  });

  test('sin usuario no ve nada', () => {
    assert.equal(alcanceDeViajes(null), 'NINGUNO');
  });
});
