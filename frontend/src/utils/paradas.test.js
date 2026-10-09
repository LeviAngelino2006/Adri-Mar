// Tests de las funciones puras de la lista de paradas. Se corren con
// `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_PARADA_VACIA,
  MAX_PARADAS,
  agregarParada,
  elegirUbicacion,
  errorDeSecuencia,
  moverParada,
  nuevaParada,
  paradasAPayload,
  paradasDesdeViaje,
  quitarParada,
} from './paradas.js';

const ubic = (id, nombre) => ({ id, nombre });
const ids = (lista) => lista.map((p) => p.id);

describe('agregarParada', () => {
  test('agrega una fila vacía al final con una clave propia', () => {
    const lista = agregarParada([nuevaParada(ubic(3, 'Alta Gracia'))]);

    assert.equal(lista.length, 2);
    assert.deepEqual([lista[1].id, lista[1].nombre], ['', '']);
    assert.notEqual(lista[0].clave, lista[1].clave);
  });

  test('no pasa del máximo de 9', () => {
    let lista = [];
    for (let i = 0; i < MAX_PARADAS + 3; i += 1) lista = agregarParada(lista);

    assert.equal(lista.length, MAX_PARADAS);
    assert.equal(MAX_PARADAS, 9);
  });

  test('no modifica la lista original', () => {
    const original = [];
    agregarParada(original);
    assert.equal(original.length, 0);
  });
});

describe('quitarParada', () => {
  test('quita la fila de esa clave y conserva el orden del resto', () => {
    const [a, b, c] = [nuevaParada(ubic(3, 'A')), nuevaParada(ubic(4, 'B')), nuevaParada(ubic(5, 'C'))];

    assert.deepEqual(ids(quitarParada([a, b, c], b.clave)), [3, 5]);
  });

  test('una clave que no existe no cambia nada', () => {
    const lista = [nuevaParada(ubic(3, 'A'))];
    assert.deepEqual(quitarParada(lista, 'no-existe'), lista);
  });

  test('con la misma ubicación repetida quita solo la fila indicada', () => {
    const [a, b] = [nuevaParada(ubic(3, 'A')), nuevaParada(ubic(3, 'A'))];

    const resto = quitarParada([a, b], a.clave);

    assert.equal(resto.length, 1);
    assert.equal(resto[0].clave, b.clave);
  });
});

describe('moverParada', () => {
  const armar = () => [nuevaParada(ubic(3, 'A')), nuevaParada(ubic(4, 'B')), nuevaParada(ubic(5, 'C'))];

  test('hacia abajo (+1) intercambia con la siguiente', () => {
    assert.deepEqual(ids(moverParada(armar(), 0, 1)), [4, 3, 5]);
  });

  test('hacia arriba (-1) intercambia con la anterior', () => {
    assert.deepEqual(ids(moverParada(armar(), 2, -1)), [3, 5, 4]);
  });

  test('la primera no sube y la última no baja', () => {
    const lista = armar();
    assert.equal(moverParada(lista, 0, -1), lista);
    assert.equal(moverParada(lista, 2, 1), lista);
  });

  test('un índice fuera de rango no cambia nada', () => {
    const lista = armar();
    assert.equal(moverParada(lista, 7, -1), lista);
    assert.equal(moverParada(lista, -1, 1), lista);
  });

  test('las filas conservan su clave al moverse (el selector viaja con su texto)', () => {
    const lista = armar();
    const claves = lista.map((p) => p.clave);

    const movida = moverParada(lista, 0, 1);

    assert.deepEqual(movida.map((p) => p.clave), [claves[1], claves[0], claves[2]]);
  });

  test('no modifica la lista original', () => {
    const lista = armar();
    moverParada(lista, 0, 1);
    assert.deepEqual(ids(lista), [3, 4, 5]);
  });
});

describe('elegirUbicacion', () => {
  test('completa solo la fila indicada', () => {
    const [a, b] = [nuevaParada(), nuevaParada()];

    const lista = elegirUbicacion([a, b], b.clave, ubic(7, 'Villa del Dique'));

    assert.deepEqual([lista[0].id, lista[1].id, lista[1].nombre], ['', 7, 'Villa del Dique']);
  });

  test('con null vacía la fila', () => {
    const a = nuevaParada(ubic(3, 'Alta Gracia'));
    const [vacia] = elegirUbicacion([a], a.clave, null);
    assert.deepEqual([vacia.id, vacia.nombre], ['', '']);
  });
});

describe('paradasDesdeViaje', () => {
  test('convierte las paradas de la API en filas, en el mismo orden', () => {
    const lista = paradasDesdeViaje({
      paradas: [
        { orden: 1, ubicacion: ubic(3, 'Alta Gracia') },
        { orden: 2, ubicacion: ubic(4, 'Museo del Kempes') },
      ],
    });

    assert.deepEqual(lista.map((p) => [p.id, p.nombre]), [
      [3, 'Alta Gracia'],
      [4, 'Museo del Kempes'],
    ]);
    assert.equal(new Set(lista.map((p) => p.clave)).size, 2);
  });

  test('un viaje sin paradas (o sin la clave) da una lista vacía', () => {
    assert.deepEqual(paradasDesdeViaje({ paradas: [] }), []);
    assert.deepEqual(paradasDesdeViaje({}), []);
    assert.deepEqual(paradasDesdeViaje(undefined), []);
  });
});

describe('paradasAPayload', () => {
  test('devuelve solo los ids, en orden, y ningún error', () => {
    const lista = [nuevaParada(ubic(3, 'A')), nuevaParada(ubic(4, 'B')), nuevaParada(ubic(3, 'A'))];

    assert.deepEqual(paradasAPayload(lista), { ids: [3, 4, 3], errores: {} });
  });

  test('una lista vacía es válida: sin ids ni errores', () => {
    assert.deepEqual(paradasAPayload([]), { ids: [], errores: {} });
  });

  test('una fila sin ubicación NO se descarta en silencio: queda como error de esa fila', () => {
    const [a, vacia, c] = [nuevaParada(ubic(3, 'A')), nuevaParada(), nuevaParada(ubic(5, 'C'))];

    const { ids: elegidos, errores } = paradasAPayload([a, vacia, c]);

    assert.deepEqual(errores, { [vacia.clave]: 'Elegí una ubicación o quitá la parada' });
    assert.equal(errores[vacia.clave], ERROR_PARADA_VACIA);
    // Los ids válidos siguen en orden; quien guarda frena el envío por el error.
    assert.deepEqual(elegidos, [3, 5]);
  });

  test('varias filas vacías dan un error por cada una', () => {
    const [a, b] = [nuevaParada(), nuevaParada()];

    const { errores } = paradasAPayload([a, b]);

    assert.deepEqual(Object.keys(errores).sort(), [a.clave, b.clave].sort());
  });

  test('una fila vaciada después de elegir también es un error', () => {
    const a = nuevaParada(ubic(3, 'A'));
    const [vaciada] = elegirUbicacion([a], a.clave, null);

    assert.deepEqual(Object.keys(paradasAPayload([vaciada]).errores), [vaciada.clave]);
  });

  test('los ids numéricos en texto se convierten a número', () => {
    assert.deepEqual(paradasAPayload([{ clave: 'x', id: '4', nombre: 'B' }]).ids, [4]);
  });
});

describe('errorDeSecuencia', () => {
  test('sin paradas no dice nada (origen = destino lo informa el backend)', () => {
    assert.equal(errorDeSecuencia(1, [], 1), null);
    assert.equal(errorDeSecuencia(1, [], 2), null);
  });

  test('primera parada igual al origen', () => {
    assert.equal(errorDeSecuencia(1, [1, 3], 2), 'La parada 1 es igual al punto anterior');
  });

  test('dos paradas seguidas iguales', () => {
    assert.equal(errorDeSecuencia(1, [3, 4, 4], 2), 'La parada 3 es igual al punto anterior');
  });

  test('última parada igual al destino', () => {
    assert.equal(errorDeSecuencia(1, [3, 2], 2), 'La parada 2 es igual al destino');
    assert.equal(errorDeSecuencia(1, [2], 2), 'La parada 1 es igual al destino');
  });

  test('una ubicación repetida pero no consecutiva es válida', () => {
    assert.equal(errorDeSecuencia(1, [3, 4, 3], 2), null);
    assert.equal(errorDeSecuencia(1, [3, 1, 4], 2), null);
  });

  test('un ida y vuelta (origen = destino con una parada en el medio) es válido', () => {
    assert.equal(errorDeSecuencia(1, [2], 1), null);
  });

  test('acepta ids numéricos en texto', () => {
    assert.equal(errorDeSecuencia('1', [3, 3], '2'), 'La parada 2 es igual al punto anterior');
  });
});
