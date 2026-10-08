// Tests del script de precarga de clientes: solo la parte pura (planificar).
// No tocan la base de datos ni cargan el cliente de Prisma.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { LISTA, planificar, ListaInvalidaError } = require(path.join(__dirname, '..', 'prisma', 'precargarClientes.js'));

// nombreNormalizado escrito a mano para no depender de la función que se prueba.
const fila = (nombre, nombreNormalizado) => ({ nombre, nombreNormalizado });

describe('planificar (precarga de clientes)', () => {
  test('la lista tiene 13 nombres', () => {
    assert.equal(LISTA.length, 13);
  });

  test('con la base vacía se crean los 13 con el nombre exacto de la lista, en orden', () => {
    const plan = planificar(LISTA, []);

    assert.equal(plan.crear.length, 13);
    assert.deepEqual(plan.crear.map((c) => c.nombre), LISTA);
    assert.deepEqual(plan.existentes, []);
  });

  test('con "Club Casino" existente se crean 12 y Club Casino figura como existente, sin advertencia', () => {
    const plan = planificar(LISTA, [fila('Club Casino', 'club casino')]);

    assert.equal(plan.crear.length, 12);
    assert.ok(!plan.crear.some((c) => c.nombre === 'Club Casino'));
    assert.deepEqual(plan.existentes, [
      { nombre: 'Club Casino', nombreNormalizado: 'club casino', nombreGuardado: 'Club Casino', advertencia: false },
    ]);
  });

  for (const [guardado, listado, clave] of [
    ['CLUB CASINO', 'Club Casino', 'club casino'],
    ['Exodo', 'Éxodo', 'exodo'],
  ]) {
    test(`con "${guardado}" existente se detecta como existente y se reporta como advertencia`, () => {
      const plan = planificar(LISTA, [fila(guardado, clave)]);

      assert.equal(plan.crear.length, 12);
      assert.ok(!plan.crear.some((c) => c.nombre === listado));
      assert.deepEqual(plan.existentes, [
        { nombre: listado, nombreNormalizado: clave, nombreGuardado: guardado, advertencia: true },
      ]);
    });
  }

  test('es idempotente: con todos ya cargados no queda nada por crear', () => {
    const cargados = planificar(LISTA, []).crear.map((c) => ({ nombre: c.nombre, nombreNormalizado: c.nombreNormalizado }));
    const plan = planificar(LISTA, cargados);

    assert.deepEqual(plan.crear, []);
    assert.equal(plan.existentes.length, 13);
    assert.ok(plan.existentes.every((e) => !e.advertencia));
  });

  test('una lista con "AGD" y "agd" se rechaza', () => {
    assert.throws(
      () => planificar(['AGD', 'Cotagro', 'agd'], []),
      (err) => {
        assert.ok(err instanceof ListaInvalidaError);
        assert.equal(err.problemas.length, 1);
        assert.match(err.problemas[0], /"AGD" y "agd"/);
        return true;
      }
    );
  });

  test('una lista con un nombre vacío o de solo espacios se rechaza', () => {
    for (const vacio of ['', '   ', undefined]) {
      assert.throws(() => planificar(['AGD', vacio], []), ListaInvalidaError);
    }
  });

  test('"AGD", "IPET 266" y "Éxodo" se mantienen exactamente así (mayúsculas y acentos)', () => {
    const nombres = planificar(LISTA, []).crear.map((c) => c.nombre);

    for (const esperado of ['AGD', 'IPET 266', 'Éxodo']) {
      assert.ok(nombres.includes(esperado), esperado);
    }
  });

  test('los nombres normalizados de la lista son 13 y distintos entre sí', () => {
    const claves = planificar(LISTA, []).crear.map((c) => c.nombreNormalizado);

    assert.equal(new Set(claves).size, 13);
    assert.ok(claves.includes('agd'));
    assert.ok(claves.includes('exodo'));
    assert.ok(claves.includes('ipet 266'));
  });
});
