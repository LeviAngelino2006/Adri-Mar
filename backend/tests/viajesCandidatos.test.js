// Tests de candidatos (Fase 2 del flujo de viajes): alta y edición con choferes
// y vehículos posibles, confirmar (elige uno de cada uno y borra los
// candidatos en UNA transacción), visibilidad por perfil y disponibilidad.
//
// Levantan la app real de Express con un JWT real, pero con Prisma reemplazado
// por un doble CON ESTADO (tablas en memoria) y un $transaction con rollback
// real: lo que no se confirma, se deshace. NO tocan la base ni leen el .env.
// Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma con estado (compartido, ver helpers/) --------------------

const { crearEntorno, instalarEnCache, ESTADOS, cba, idsDe } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar, agregarViaje, filaPorId } = crearEntorno();
// Los arrays de `db` se mutan siempre en el lugar: estas referencias no quedan viejas.
const { viajes, candChofer, candVeh, fallos, borrados } = db;

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

// --- Helpers ----------------------------------------------------------------

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  sembrar();
});

function tokenDe(perfil) {
  return generarToken({ id: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });
}

async function pedir(metodo, ruta, { perfil, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) headers.Authorization = `Bearer ${tokenDe(perfil)}`;
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const CORE = { clienteId: 1, origenId: 1, destinoId: 2, fechaInicio: '2026-10-20T08:00' };
const GESTORES = ['ADMINISTRADOR', 'ENCARGADO'];

// --- Alta con candidatos ----------------------------------------------------

describe('POST /viajes con candidatos', () => {
  test('crea el viaje con sus candidatos y sin asignado', async () => {
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ENCARGADO',
      body: { ...CORE, choferesCandidatos: [5, 6], vehiculosCandidatos: [7] },
    });

    assert.equal(status, 201);
    assert.equal(json.viaje.estado, 'A_CONFIRMAR');
    assert.equal(json.viaje.choferId, null);
    assert.equal(json.viaje.vehiculoId, null);
    assert.deepEqual(json.viaje.choferesCandidatos, [
      { id: 5, nombre: 'Ana', apellido: 'Pérez' },
      { id: 6, nombre: 'Beto', apellido: 'Gómez' },
    ]);
    assert.deepEqual(json.viaje.vehiculosCandidatos, [{ id: 7, dominio: 'AE452KD', numeroInterno: '12' }]);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', json.viaje.id), [5, 6]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', json.viaje.id), [7]);
  });

  test('sin candidatos: listas vacías', async () => {
    const { status, json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body: { ...CORE } });

    assert.equal(status, 201);
    assert.deepEqual(json.viaje.choferesCandidatos, []);
    assert.deepEqual(json.viaje.vehiculosCandidatos, []);
  });

  test('un candidato inactivo, no habilitado o en taller se acepta: la disponibilidad informa, no bloquea', async () => {
    const { status } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...CORE, choferesCandidatos: [7, 8], vehiculosCandidatos: [8, 10] },
    });

    assert.equal(status, 201);
  });

  for (const campo of ['choferId', 'vehiculoId']) {
    test(`${campo} suelto en un A_CONFIRMAR: 400 y no se crea nada`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, [campo]: campo === 'choferId' ? 5 : 7 },
      });

      assert.equal(status, 400);
      assert.ok(campo in json.errores);
      assert.equal(viajes.length, 0);
    });
  }

  const INVALIDOS = [
    ['no es una lista', { choferesCandidatos: 5 }, 'choferesCandidatos'],
    ['ids repetidos', { choferesCandidatos: [5, 5] }, 'choferesCandidatos'],
    ['id cero', { vehiculosCandidatos: [0] }, 'vehiculosCandidatos'],
    ['id que no es número', { vehiculosCandidatos: ['x'] }, 'vehiculosCandidatos'],
    ['id booleano', { choferesCandidatos: [true] }, 'choferesCandidatos'],
    ['chofer inexistente', { choferesCandidatos: [5, 999] }, 'choferesCandidatos'],
    ['vehículo inexistente', { vehiculosCandidatos: [999] }, 'vehiculosCandidatos'],
  ];
  for (const [nombre, datos, campo] of INVALIDOS) {
    test(`inválido (${nombre}): 400 en "${campo}" y no se crea nada`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, ...datos },
      });

      assert.equal(status, 400);
      assert.ok(campo in json.errores);
      assert.equal(viajes.length, 0);
      assert.equal(candChofer.length + candVeh.length, 0);
    });
  }

  test('los errores de candidatos viajan juntos con los de los otros campos', async () => {
    const { fechaInicio: _omitida, ...sinFecha } = CORE;

    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...sinFecha, choferesCandidatos: [5, 5], vehiculosCandidatos: 'x', cantidadPasajeros: 0 },
    });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), [
      'cantidadPasajeros',
      'choferesCandidatos',
      'fechaInicio',
      'vehiculosCandidatos',
    ]);
  });
});

// --- Edición de candidatos --------------------------------------------------

describe('PUT /viajes/:id: candidatos', () => {
  test('A_CONFIRMAR: reemplazo completo de las dos listas', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...CORE, choferesCandidatos: [6, 10], vehiculosCandidatos: [8, 9] },
    });

    assert.equal(status, 200);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [6, 10]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [8, 9]);
    assert.deepEqual(json.viaje.choferesCandidatos.map((c) => c.id), [6, 10]);
    assert.deepEqual(json.viaje.vehiculosCandidatos.map((c) => c.id), [8, 9]);
  });

  test('una lista ausente se vacía (es reemplazo, no parche)', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7] });

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE } });

    assert.equal(status, 200);
    assert.equal(candChofer.length, 0);
    assert.equal(candVeh.length, 0);
  });

  test('no toca los candidatos de otros viajes', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5] });
    const otro = agregarViaje({ choferesCandidatos: [6], vehiculosCandidatos: [7] });

    await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE, choferesCandidatos: [10] } });

    assert.deepEqual(idsDe(candChofer, 'usuarioId', otro.id), [6]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', otro.id), [7]);
  });

  test('choferId suelto en un A_CONFIRMAR: 400 y los candidatos quedan como estaban', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5] });

    const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...CORE, choferId: 6, choferesCandidatos: [10] },
    });

    assert.equal(status, 400);
    assert.ok('choferId' in json.errores);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5]);
  });

  test('lista inválida: 400 y los candidatos quedan como estaban', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...CORE, choferesCandidatos: [999] },
    });

    assert.equal(status, 400);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [7]);
  });

  test('si falla un paso de la edición se deshace todo (una sola transacción)', async () => {
    const silenciar = mock.method(console, 'error', () => {});
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7] });
    fallos.createManyChofer = true;

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...CORE, choferesCandidatos: [10], vehiculosCandidatos: [9] },
    });
    silenciar.mock.restore();

    assert.equal(status, 500);
    // El deleteMany de choferes y el de vehículos ya habían corrido: tienen que
    // haberse revertido.
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5, 6]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [7]);
  });

  test('PROGRAMADO: sigue con 1 chofer y 1 vehículo y los candidatos no aplican', async () => {
    const viaje = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });
    const asignado = { ...CORE, choferId: 6, vehiculoId: 9, fechaFin: '2026-10-20T12:00', kilometrosEstimados: 80 };

    const ok = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: asignado });
    assert.equal(ok.status, 200);
    assert.equal(filaPorId(viaje.id).choferId, 6);
    assert.equal(filaPorId(viaje.id).vehiculoId, 9);

    const conCandidatos = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...asignado, choferesCandidatos: [5], vehiculosCandidatos: [7] },
    });
    assert.equal(conCandidatos.status, 400);
    assert.ok('choferesCandidatos' in conCandidatos.json.errores);
    assert.ok('vehiculosCandidatos' in conCandidatos.json.errores);
    assert.equal(candChofer.length + candVeh.length, 0);
  });

  test('PROGRAMADO con listas vacías: se acepta', async () => {
    const viaje = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: {
        ...CORE,
        choferId: 5,
        vehiculoId: 7,
        fechaFin: '2026-10-20T12:00',
        kilometrosEstimados: 80,
        choferesCandidatos: [],
        vehiculosCandidatos: [],
      },
    });

    assert.equal(status, 200);
  });
});

// --- Confirmar --------------------------------------------------------------

describe('PATCH /viajes/:id/confirmar', () => {
  const CONFIRMACION = { choferId: 5, vehiculoId: 7, fechaFin: '2026-10-20T12:00', kilometrosEstimados: 150 };

  test('con un candidato de cada lista: pasa a PROGRAMADO', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7, 9] });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: CONFIRMACION,
    });

    assert.equal(status, 200);
    assert.equal(json.viaje.estado, 'PROGRAMADO');
    assert.equal(json.viaje.choferId, 5);
    assert.equal(json.viaje.vehiculoId, 7);
    assert.equal(json.viaje.kilometrosEstimados, 150);
    assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.PROGRAMADO);
  });

  test('con alguien que NO es candidato ("elegir otro"): también pasa', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: { ...CONFIRMACION, choferId: 6, vehiculoId: 9 },
    });

    assert.equal(status, 200);
    assert.equal(json.viaje.choferId, 6);
    assert.equal(json.viaje.vehiculoId, 9);
  });

  test('confirmar borra los candidatos (y solo los de ese viaje)', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7, 9] });
    const otro = agregarViaje({ choferesCandidatos: [10], vehiculosCandidatos: [9] });

    const { json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ADMINISTRADOR',
      body: CONFIRMACION,
    });

    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), []);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), []);
    assert.deepEqual(json.viaje.choferesCandidatos, []);
    assert.deepEqual(json.viaje.vehiculosCandidatos, []);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', otro.id), [10]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', otro.id), [9]);
  });

  test('usa la fecha de inicio ya guardada: no hace falta volver a mandarla', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5] });

    const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: CONFIRMACION,
    });

    assert.equal(status, 200);
    assert.equal(filaPorId(viaje.id).fechaInicio.toISOString(), cba('08:00').toISOString());
  });

  test('exige chofer, vehículo, fecha de fin y km: 400 con todos los faltantes y candidatos intactos', async () => {
    const viaje = agregarViaje({
      fechaFin: null,
      kilometrosEstimados: null,
      choferesCandidatos: [5],
      vehiculosCandidatos: [7],
    });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, { perfil: 'ENCARGADO', body: {} });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), [
      'choferId',
      'fechaFin',
      'kilometrosEstimados',
      'vehiculoId',
    ]);
    assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.A_CONFIRMAR);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5]);
  });

  const NO_DISPONIBLES = [
    ['chofer no habilitado', { choferId: 7 }, 'choferId'],
    ['chofer dado de baja', { choferId: 8 }, 'choferId'],
    ['vehículo en taller', { vehiculoId: 8 }, 'vehiculoId'],
  ];
  for (const [nombre, cambios, campo] of NO_DISPONIBLES) {
    test(`${nombre}: 400 y el viaje y sus candidatos quedan intactos`, async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5, 7, 8], vehiculosCandidatos: [7, 8] });

      const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
        perfil: 'ENCARGADO',
        body: { ...CONFIRMACION, ...cambios },
      });

      assert.equal(status, 400);
      assert.ok(campo in json.errores);
      assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.A_CONFIRMAR);
      assert.equal(idsDe(candChofer, 'usuarioId', viaje.id).length, 3);
      assert.equal(idsDe(candVeh, 'vehiculoId', viaje.id).length, 2);
    });
  }

  test('chofer con otro viaje programado que se superpone: 400 y candidatos intactos', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, fechaInicio: cba('10:00'), fechaFin: cba('14:00') });
    const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: CONFIRMACION,
    });

    assert.equal(status, 400);
    assert.ok('choferId' in json.errores);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5]);
  });

  test('un viaje que ya está PROGRAMADO: 409 y sus datos quedan intactos', async () => {
    const viaje = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });
    // Candidatos "perdidos" a propósito: una segunda confirmación no puede
    // borrarlos.
    candChofer.push({ viajeId: viaje.id, usuarioId: 6 });
    const antes = { ...filaPorId(viaje.id) };

    const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: { ...CONFIRMACION, choferId: 6, vehiculoId: 9 },
    });

    assert.equal(status, 409);
    assert.deepEqual(filaPorId(viaje.id), antes);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [6]);
  });

  test('carrera: si otra confirmación gana entre la lectura y la transacción, 409 sin borrar nada', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7] });
    // En medio de la validación (después de haber leído A_CONFIRMAR), "otra
    // confirmación" pasa el viaje a PROGRAMADO con otro chofer.
    db.alLeerUsuario = () => {
      const fila = filaPorId(viaje.id);
      fila.estadoViajeId = ESTADOS.PROGRAMADO;
      fila.choferId = 6;
      fila.vehiculoId = 9;
      db.alLeerUsuario = null;
    };

    const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: CONFIRMACION,
    });

    assert.equal(status, 409);
    // La ganadora conserva su asignación: la perdedora no pisó nada...
    assert.equal(filaPorId(viaje.id).choferId, 6);
    assert.equal(filaPorId(viaje.id).vehiculoId, 9);
    // ...y el error se lanzó antes de los deleteMany: ni siquiera se
    // ejecutaron (no alcanza con que un rollback los hubiera deshecho).
    assert.deepEqual(borrados, []);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5, 6]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [7]);
  });

  test('pasar a PROGRAMADO y borrar candidatos es una sola transacción: si falla el borrado, no se confirma', async () => {
    const silenciar = mock.method(console, 'error', () => {});
    const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7, 9] });
    // Falla el SEGUNDO deleteMany: el update del viaje y el borrado de choferes
    // ya se habían ejecutado y se tienen que revertir.
    fallos.deleteManyVehiculo = true;

    const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: CONFIRMACION,
    });
    silenciar.mock.restore();

    assert.equal(status, 500);
    const fila = filaPorId(viaje.id);
    assert.equal(fila.estadoViajeId, ESTADOS.A_CONFIRMAR);
    assert.equal(fila.choferId, null);
    assert.equal(fila.vehiculoId, null);
    assert.deepEqual(idsDe(candChofer, 'usuarioId', viaje.id), [5, 6]);
    assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [7, 9]);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403`, async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5] });

      const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, { perfil, body: CONFIRMACION });

      assert.equal(status, 403);
      assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.A_CONFIRMAR);
    });
  }
});

// --- Visibilidad ------------------------------------------------------------

describe('visibilidad de los candidatos', () => {
  const CLAVES = ['choferesCandidatos', 'vehiculosCandidatos'];

  for (const perfil of GESTORES) {
    test(`${perfil}: ve los candidatos en el listado`, async () => {
      agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

      const { json } = await pedir('GET', '/viajes', { perfil });

      assert.deepEqual(json.viajes[0].choferesCandidatos.map((c) => c.id), [5]);
      assert.deepEqual(json.viajes[0].vehiculosCandidatos.map((c) => c.id), [7]);
    });
  }

  test('un viaje que no es A_CONFIRMAR los trae vacíos para un gestor', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    assert.deepEqual(json.viajes[0].choferesCandidatos, []);
    assert.deepEqual(json.viajes[0].vehiculosCandidatos, []);
  });

  test('PERSONAL_TALLER ve el listado pero SIN las claves de candidatos', async () => {
    agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('GET', '/viajes', { perfil: 'PERSONAL_TALLER' });

    assert.equal(status, 200);
    assert.equal(json.viajes.length, 1);
    for (const clave of CLAVES) assert.ok(!(clave in json.viajes[0]), `no debería venir ${clave}`);
  });

  test('un CHOFER no ve los candidatos en /mis-viajes', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 10, vehiculoId: 7, choferesCandidatos: [5] });

    const { status, json } = await pedir('GET', '/viajes/mis-viajes', { perfil: 'CHOFER' });

    assert.equal(status, 200);
    assert.equal(json.viajes.length, 1);
    for (const clave of CLAVES) assert.ok(!(clave in json.viajes[0]), `no debería venir ${clave}`);
  });

  test('/mis-viajes sigue sin mostrar A_CONFIRMAR, ni pidiéndolos explícitamente', async () => {
    agregarViaje({ estado: 'A_CONFIRMAR', choferId: 10, choferesCandidatos: [10] });
    agregarViaje({ estado: 'PROGRAMADO', choferId: 10, vehiculoId: 7 });

    const todos = await pedir('GET', '/viajes/mis-viajes', { perfil: 'CHOFER' });
    assert.deepEqual(todos.json.viajes.map((v) => v.estado), ['PROGRAMADO']);

    const pedido = await pedir('GET', '/viajes/mis-viajes?estado=A_CONFIRMAR', { perfil: 'CHOFER' });
    assert.equal(pedido.json.viajes.length, 0);
  });
});

// --- Disponibilidad ---------------------------------------------------------

describe('GET /viajes/:id/disponibilidad', () => {
  const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

  test('informa disponibilidad y motivo de cada candidato', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 9, fechaInicio: cba('10:00'), fechaFin: cba('13:30') });
    const viaje = agregarViaje({
      choferesCandidatos: [5, 6, 7, 8],
      vehiculosCandidatos: [7, 8, 9, 10],
    });

    const { status, json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.equal(status, 200);
    const choferes = porId(json.choferes);
    assert.deepEqual(choferes[5], {
      id: 5,
      disponible: false,
      motivo: 'Se superpone con otro viaje programado (10:00–13:30)',
    });
    assert.deepEqual(choferes[6], { id: 6, disponible: true, motivo: null });
    assert.deepEqual(choferes[7], { id: 7, disponible: false, motivo: 'No habilitado para conducir' });
    assert.deepEqual(choferes[8], { id: 8, disponible: false, motivo: 'Usuario dado de baja' });

    const vehiculosPorId = porId(json.vehiculos);
    assert.deepEqual(vehiculosPorId[7], { id: 7, disponible: true, motivo: null });
    assert.deepEqual(vehiculosPorId[8], { id: 8, disponible: false, motivo: 'Vehículo en taller' });
    assert.deepEqual(vehiculosPorId[9], {
      id: 9,
      disponible: false,
      motivo: 'Se superpone con otro viaje programado (10:00–13:30)',
    });
    assert.deepEqual(vehiculosPorId[10], { id: 10, disponible: false, motivo: 'Vehículo dado de baja' });
  });

  test('la habilitación pesa más que el horario en el motivo', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 7, fechaInicio: cba('10:00'), fechaFin: cba('13:00') });
    const viaje = agregarViaje({ choferesCandidatos: [7] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.equal(json.choferes[0].motivo, 'No habilitado para conducir');
  });

  test('dos viajes que se tocan en el borde (uno termina cuando empieza el otro) no se superponen', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, fechaInicio: cba('06:00'), fechaFin: cba('08:00') });
    const viaje = agregarViaje({ choferesCandidatos: [5] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.equal(json.choferes[0].disponible, true);
  });

  test('otro viaje A_CONFIRMAR, o cancelado, no cuenta como superposición', async () => {
    agregarViaje({ estado: 'A_CONFIRMAR', choferId: 5, fechaInicio: cba('09:00'), fechaFin: cba('11:00') });
    agregarViaje({ estado: 'CANCELADO', choferId: 5, fechaInicio: cba('09:00'), fechaFin: cba('11:00') });
    const viaje = agregarViaje({ choferesCandidatos: [5] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.equal(json.choferes[0].disponible, true);
  });

  test('sin fechaFin se chequea contra el día completo de fechaInicio', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, fechaInicio: cba('20:00'), fechaFin: cba('22:00') });
    agregarViaje({
      estado: 'PROGRAMADO',
      choferId: 6,
      fechaInicio: cba('08:00', '2026-10-21'),
      fechaFin: cba('10:00', '2026-10-21'),
    });
    const viaje = agregarViaje({ fechaFin: null, choferesCandidatos: [5, 6] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    const choferes = porId(json.choferes);
    assert.equal(choferes[5].disponible, false, 'el mismo día, aunque sea a la noche, se superpone');
    assert.equal(choferes[6].disponible, true, 'al día siguiente no');
  });

  test('sin todos: solo los candidatos', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.deepEqual(json.choferes.map((c) => c.id), [5]);
    assert.deepEqual(json.vehiculos.map((v) => v.id), [7]);
  });

  test('todos=true: suma choferes activos y habilitados y vehículos no dados de baja', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [8], vehiculosCandidatos: [10] });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad?todos=true`, { perfil: 'ENCARGADO' });

    // Candidatos (aunque no estén habilitados) + activos y habilitados (5, 6, 10).
    assert.deepEqual(json.choferes.map((c) => c.id).sort((a, b) => a - b), [5, 6, 8, 10]);
    // Candidato dado de baja + los demás no dados de baja (el de taller incluido).
    assert.deepEqual(json.vehiculos.map((v) => v.id).sort((a, b) => a - b), [7, 8, 9, 10]);
    assert.equal(porId(json.choferes)[7], undefined, 'un chofer no habilitado que no es candidato no aparece');
  });

  test('todos=true no incluye a un vehículo dado de baja que no es candidato', async () => {
    const viaje = agregarViaje({});

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad?todos=true`, { perfil: 'ENCARGADO' });

    assert.deepEqual(json.vehiculos.map((v) => v.id).sort((a, b) => a - b), [7, 8, 9]);
  });

  test('el propio viaje no cuenta como superposición consigo mismo', async () => {
    const viaje = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

    const { json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad?todos=true`, { perfil: 'ENCARGADO' });

    assert.equal(porId(json.choferes)[5].disponible, true);
    assert.equal(porId(json.vehiculos)[7].disponible, true);
  });

  test('viaje inexistente: 404', async () => {
    const { status } = await pedir('GET', '/viajes/9999/disponibilidad', { perfil: 'ENCARGADO' });
    assert.equal(status, 404);
  });

  test('viaje sin fecha de inicio (histórico): 400', async () => {
    const viaje = agregarViaje({ fechaInicio: null, fechaFin: null });

    const { status, json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil: 'ENCARGADO' });

    assert.equal(status, 400);
    assert.ok('fechaInicio' in json.errores);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403`, async () => {
      const viaje = agregarViaje({});
      const { status } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`, { perfil });
      assert.equal(status, 403);
    });
  }

  test('sin token: 401', async () => {
    const { status } = await pedir('GET', '/viajes/1/disponibilidad');
    assert.equal(status, 401);
  });
});

describe('POST /viajes/disponibilidad (alta)', () => {
  const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

  test('evalúa los ids con las fechas del formulario', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7, fechaInicio: cba('09:00'), fechaFin: cba('11:00') });

    const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: {
        fechaInicio: '2026-10-20T10:00',
        fechaFin: '2026-10-20T12:00',
        choferIds: [5, 6, 7],
        vehiculoIds: [7, 8],
      },
    });

    assert.equal(status, 200);
    const choferes = porId(json.choferes);
    assert.equal(choferes[5].disponible, false);
    assert.equal(choferes[5].motivo, 'Se superpone con otro viaje programado (09:00–11:00)');
    assert.equal(choferes[6].disponible, true);
    assert.equal(choferes[7].motivo, 'No habilitado para conducir');
    assert.equal(porId(json.vehiculos)[7].disponible, false);
    assert.equal(porId(json.vehiculos)[8].motivo, 'Vehículo en taller');
  });

  test('sin fechaFin chequea el día de fechaInicio', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, fechaInicio: cba('20:00'), fechaFin: cba('22:00') });

    const { json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: { fechaInicio: '2026-10-20T08:00', choferIds: [5], vehiculoIds: [] },
    });

    assert.equal(json.choferes[0].disponible, false);
  });

  test('listas ausentes: respuesta vacía', async () => {
    const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: { fechaInicio: '2026-10-20T08:00' },
    });

    assert.equal(status, 200);
    assert.deepEqual(json, { choferes: [], vehiculos: [] });
  });

  test('un id que no existe vuelve como no disponible, sin cortar la consulta', async () => {
    const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: { fechaInicio: '2026-10-20T08:00', choferIds: [5, 999], vehiculoIds: [] },
    });

    assert.equal(status, 200);
    assert.deepEqual(porId(json.choferes)[999], { id: 999, disponible: false, motivo: 'No encontrado' });
    assert.equal(porId(json.choferes)[5].disponible, true);
  });

  test('datos inválidos: 400 con todos los errores juntos', async () => {
    const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: { choferIds: [5, 5], vehiculoIds: 'x', fechaFin: 'no-es-fecha' },
    });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), ['choferIds', 'fechaFin', 'fechaInicio', 'vehiculoIds']);
  });

  test('fechaFin no posterior al inicio: 400', async () => {
    const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
      perfil: 'ENCARGADO',
      body: { fechaInicio: '2026-10-20T10:00', fechaFin: '2026-10-20T10:00' },
    });

    assert.equal(status, 400);
    assert.ok('fechaFin' in json.errores);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403`, async () => {
      const { status } = await pedir('POST', '/viajes/disponibilidad', {
        perfil,
        body: { fechaInicio: '2026-10-20T08:00' },
      });
      assert.equal(status, 403);
    });
  }

  test('sin token: 401', async () => {
    const { status } = await pedir('POST', '/viajes/disponibilidad', { body: { fechaInicio: '2026-10-20T08:00' } });
    assert.equal(status, 401);
  });
});
