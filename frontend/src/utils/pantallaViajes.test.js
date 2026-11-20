// SCRUM-248: listado, ficha, formulario del viaje y datos administrativos son
// pantallas excluyentes de la página de Viajes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pantallaDeViajes } from './pantallaViajes.js';

const VIAJE = { id: 7 };

describe('pantallaDeViajes', () => {
  test('sin nada abierto, el listado', () => {
    assert.equal(pantallaDeViajes({ mostrarForm: false, editandoAdmin: null, seleccionado: null }), 'listado');
  });

  test('con un viaje seleccionado, la ficha', () => {
    assert.equal(pantallaDeViajes({ mostrarForm: false, editandoAdmin: null, seleccionado: VIAJE }), 'ficha');
  });

  test('editando los datos administrativos (la ficha quedó cerrada), solo esa pantalla', () => {
    assert.equal(pantallaDeViajes({ mostrarForm: false, editandoAdmin: VIAJE, seleccionado: null }), 'admin');
  });

  test('los datos administrativos le ganan a la ficha si quedara abierta', () => {
    assert.equal(pantallaDeViajes({ mostrarForm: false, editandoAdmin: VIAJE, seleccionado: VIAJE }), 'admin');
  });

  test('el formulario del viaje le gana a todo', () => {
    assert.equal(pantallaDeViajes({ mostrarForm: true, editandoAdmin: null, seleccionado: null }), 'form');
    assert.equal(pantallaDeViajes({ mostrarForm: true, editandoAdmin: VIAJE, seleccionado: VIAJE }), 'form');
  });
});
