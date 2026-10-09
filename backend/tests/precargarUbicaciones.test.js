// Tests del script de precarga de ubicaciones: solo la parte pura (planificar).
// No tocan la base de datos ni cargan el cliente de Prisma.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { LISTA, planificar, ListaInvalidaError } = require(path.join(__dirname, '..', 'prisma', 'precargarUbicaciones.js'));

// nombreNormalizado escrito a mano para no depender de la función que se prueba.
const rioTercero = (nombre, nombreNormalizado = 'rio tercero') => ({ nombre, nombreNormalizado });

describe('planificar (precarga de ubicaciones)', () => {
  test('la lista tiene 41 nombres', () => {
    assert.equal(LISTA.length, 41);
  });

  test('con la base vacía se crean las 41, en el orden de la lista', () => {
    const plan = planificar(LISTA, []);

    assert.equal(plan.crear.length, 41);
    assert.deepEqual(plan.crear.map((c) => c.nombre), LISTA);
    assert.deepEqual(plan.existentes, []);
  });

  test('con "Río Tercero" existente se crean 40 y Río Tercero figura como existente, sin advertencia', () => {
    const plan = planificar(LISTA, [rioTercero('Río Tercero')]);

    assert.equal(plan.crear.length, 40);
    assert.ok(!plan.crear.some((c) => c.nombre === 'Río Tercero'));
    assert.deepEqual(plan.existentes, [
      { nombre: 'Río Tercero', nombreNormalizado: 'rio tercero', nombreGuardado: 'Río Tercero', advertencia: false },
    ]);
  });

  test('con "Rio Tercero" (sin tilde) existente se detecta como existente y se reporta como advertencia', () => {
    const plan = planificar(LISTA, [rioTercero('Rio Tercero')]);

    assert.equal(plan.crear.length, 40);
    assert.deepEqual(plan.existentes, [
      { nombre: 'Río Tercero', nombreNormalizado: 'rio tercero', nombreGuardado: 'Rio Tercero', advertencia: true },
    ]);
  });

  test('es idempotente: con todas ya cargadas no queda nada por crear', () => {
    const cargadas = planificar(LISTA, []).crear.map((c) => ({ nombre: c.nombreFormateado, nombreNormalizado: c.nombreNormalizado }));
    const plan = planificar(LISTA, cargadas);

    assert.deepEqual(plan.crear, []);
    assert.equal(plan.existentes.length, 41);
    assert.ok(plan.existentes.every((e) => !e.advertencia));
  });

  test('una lista con dos variantes del mismo nombre ("Córdoba" y "cordoba") se rechaza', () => {
    assert.throws(
      () => planificar(['Córdoba', 'Villa María', 'cordoba'], []),
      (err) => {
        assert.ok(err instanceof ListaInvalidaError);
        assert.equal(err.problemas.length, 1);
        assert.match(err.problemas[0], /"Córdoba" y "cordoba"/);
        return true;
      }
    );
  });

  test('un nombre vacío en la lista se rechaza', () => {
    assert.throws(() => planificar(['Córdoba', '   '], []), ListaInvalidaError);
  });

  test('todos los nombres de la lista quedan formateados exactamente igual que en la lista', () => {
    const plan = planificar(LISTA, []);

    assert.deepEqual(plan.formatos, []);
    for (const c of plan.crear) {
      assert.equal(c.nombreFormateado, c.nombre);
    }
  });

  test('"Aeropuerto las Higueras", "Villa del Dique" y "Santa Rosa de Calamuchita" conservan sus palabras de enlace en minúscula', () => {
    const plan = planificar(LISTA, []);
    const formateados = plan.crear.map((c) => c.nombreFormateado);

    for (const esperado of ['Aeropuerto las Higueras', 'Villa del Dique', 'Santa Rosa de Calamuchita']) {
      assert.ok(formateados.includes(esperado), esperado);
    }
  });

  test('"Aeropuerto las Higueras" y "Las Higueras" son nombres distintos (no se tratan como duplicados)', () => {
    const plan = planificar(LISTA, []);
    const claves = plan.crear.map((c) => c.nombreNormalizado);

    assert.ok(claves.includes('aeropuerto las higueras'));
    assert.ok(claves.includes('las higueras'));
    assert.equal(new Set(claves).size, 41);
  });
});
