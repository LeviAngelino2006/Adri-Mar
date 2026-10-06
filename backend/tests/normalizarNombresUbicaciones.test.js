// Tests del script de migración de nombres de ubicaciones: la parte pura
// (planificar) y la aplicación del plan contra un cliente falso. No tocan la
// base de datos.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { planificar, aplicarPlan } = require(path.join(__dirname, '..', 'prisma', 'normalizarNombresUbicaciones.js'));
const { normalizarNombre } = require(path.join(__dirname, '..', 'src', 'utils', 'normalizarNombre.js'));

const fila = (id, nombre, viajes = 0) => ({ id, nombre, nombreNormalizado: normalizarNombre(nombre), viajes });

describe('planificar', () => {
  test('renombra a formato de título y cuenta lo que ya está bien', () => {
    const plan = planificar([fila(1, 'RIO TERCERO'), fila(2, 'cancha de olaeta'), fila(3, 'Córdoba Capital')]);

    assert.deepEqual(plan.renombres, [
      { id: 1, de: 'RIO TERCERO', a: 'Rio Tercero' },
      { id: 2, de: 'cancha de olaeta', a: 'Cancha de Olaeta' },
    ]);
    assert.deepEqual(plan.fusiones, []);
    assert.equal(plan.sinCambios, 1);
  });

  test('respeta los acentos que ya tiene el nombre', () => {
    const plan = planificar([fila(1, 'RÍO CUARTO'), fila(2, 'rio cuarto sur')]);
    assert.deepEqual(plan.renombres.map((r) => r.a), ['Río Cuarto', 'Rio Cuarto Sur']);
  });

  test('fusiona las que quedan con el mismo nombre normalizado: conserva la más antigua', () => {
    // En la práctica el índice único de nombre_normalizado lo impide; la fusión es una red de seguridad.
    const plan = planificar([fila(5, 'rio tercero', 2), fila(3, 'RIO TERCERO', 7), fila(9, 'Río Tercero', 1)]);

    assert.equal(plan.fusiones.length, 1);
    assert.deepEqual(plan.fusiones[0].conservar, { id: 3, nombre: 'RIO TERCERO', nuevoNombre: 'Rio Tercero' });
    assert.deepEqual(plan.fusiones[0].absorber, [
      { id: 5, nombre: 'rio tercero', viajes: 2 },
      { id: 9, nombre: 'Río Tercero', viajes: 1 },
    ]);
    // La que se conserva también se renombra.
    assert.deepEqual(plan.renombres, [{ id: 3, de: 'RIO TERCERO', a: 'Rio Tercero' }]);
    assert.equal(plan.sinCambios, 0);
  });

  test('corrige un nombre_normalizado desactualizado', () => {
    const plan = planificar([{ id: 1, nombre: 'Rio Tercero', nombreNormalizado: 'viejo', viajes: 0 }]);
    assert.deepEqual(plan.renombres, [{ id: 1, de: 'Rio Tercero', a: 'Rio Tercero', nombreNormalizado: 'rio tercero' }]);
  });

  test('es idempotente: aplicar el plan y volver a planificar no deja nada', () => {
    const inicial = [fila(1, 'RIO TERCERO'), fila(2, 'rio tercero'), fila(3, 'villa del rosario'), fila(4, 'Almafuerte')];
    const plan = planificar(inicial);

    // Estado resultante de aplicar el plan.
    const absorbidas = new Set(plan.fusiones.flatMap((f) => f.absorber.map((a) => a.id)));
    const renombre = new Map(plan.renombres.map((r) => [r.id, r.a]));
    const despues = inicial
      .filter((u) => !absorbidas.has(u.id))
      .map((u) => fila(u.id, renombre.get(u.id) ?? u.nombre));

    const segundoPlan = planificar(despues);
    assert.deepEqual(segundoPlan.renombres, []);
    assert.deepEqual(segundoPlan.fusiones, []);
    assert.equal(segundoPlan.sinCambios, despues.length);
  });

  test('sin ubicaciones: plan vacío', () => {
    assert.deepEqual(planificar([]), { renombres: [], fusiones: [], sinCambios: 0 });
  });
});

describe('aplicarPlan', () => {
  function clienteFalso() {
    const llamadas = [];
    return {
      llamadas,
      viaje: { updateMany: async (a) => llamadas.push(['viaje.updateMany', a]) },
      ubicacion: {
        delete: async (a) => llamadas.push(['ubicacion.delete', a]),
        update: async (a) => llamadas.push(['ubicacion.update', a]),
      },
    };
  }

  test('reasigna viajes, borra las absorbidas y recién después renombra', async () => {
    const plan = planificar([fila(3, 'RIO TERCERO'), fila(5, 'rio tercero')]);
    const tx = clienteFalso();

    await aplicarPlan(tx, plan);

    assert.deepEqual(tx.llamadas, [
      ['viaje.updateMany', { where: { origenId: 5 }, data: { origenId: 3 } }],
      ['viaje.updateMany', { where: { destinoId: 5 }, data: { destinoId: 3 } }],
      ['ubicacion.delete', { where: { id: 5 } }],
      ['ubicacion.update', { where: { id: 3 }, data: { nombre: 'Rio Tercero' } }],
    ]);
  });

  test('sin cambios no escribe nada', async () => {
    const tx = clienteFalso();
    await aplicarPlan(tx, planificar([fila(1, 'Rio Tercero')]));
    assert.deepEqual(tx.llamadas, []);
  });
});
