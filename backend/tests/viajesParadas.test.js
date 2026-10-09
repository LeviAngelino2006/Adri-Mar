// Tests de paradas intermedias (Fase 3 del flujo de viajes): alta y edición con
// puntos intermedios ordenados, validación de la secuencia completa
// [origen, ...paradas, destino], estados en los que se pueden editar,
// visibilidad por perfil y garantías de la base (cascade).
//
// Levantan la app real de Express con un JWT real, pero con Prisma reemplazado
// por el doble con estado de helpers/prismaFalsoConEstado.js (tablas en memoria,
// $transaction con rollback real y @@unique([viajeId, orden]) como en la base).
// NO tocan la base ni leen el .env. Se corren con `npm test` (node:test).
//
// Ubicaciones del doble: 1 Río Tercero, 2 Córdoba, 3 Alta Gracia, 4 Museo del
// Kempes, 5 Villa del Dique.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar, agregarViaje, filaPorId } = crearEntorno();
// Los arrays de `db` se mutan siempre en el lugar: estas referencias no quedan viejas.
const { viajes, paradas, fallos } = db;

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

// Ids de ubicación de las paradas de un viaje, en orden.
const paradasDe = (viajeId) =>
  paradas
    .filter((p) => p.viajeId === viajeId)
    .sort((a, b) => a.orden - b.orden)
    .map((p) => p.ubicacionId);

// Las filas completas (para verificar el `orden` guardado).
const filasDe = (viajeId) =>
  paradas
    .filter((p) => p.viajeId === viajeId)
    .sort((a, b) => a.orden - b.orden)
    .map((p) => ({ ubicacionId: p.ubicacionId, orden: p.orden }));

// --- Alta con paradas -------------------------------------------------------

describe('POST /viajes con paradas', () => {
  test('crea el viaje con las paradas en orden, y el orden lo asigna el backend', async () => {
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ENCARGADO',
      body: { ...CORE, paradas: [3, 4] },
    });

    assert.equal(status, 201);
    assert.deepEqual(filasDe(json.viaje.id), [
      { ubicacionId: 3, orden: 1 },
      { ubicacionId: 4, orden: 2 },
    ]);
    assert.deepEqual(json.viaje.paradas, [
      { orden: 1, ubicacion: { id: 3, nombre: 'Alta Gracia' } },
      { orden: 2, ubicacion: { id: 4, nombre: 'Museo del Kempes' } },
    ]);
  });

  test('sin paradas: lista vacía', async () => {
    const { status, json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body: { ...CORE } });

    assert.equal(status, 201);
    assert.deepEqual(json.viaje.paradas, []);
    assert.equal(paradas.length, 0);
  });

  test('acepta null y [] como "sin paradas"', async () => {
    for (const valor of [null, []]) {
      const { status } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, paradas: valor },
      });
      assert.equal(status, 201);
    }
    assert.equal(paradas.length, 0);
  });

  test('el máximo son 9 paradas: 9 entran, 10 no', async () => {
    const nueve = [3, 4, 5, 3, 4, 5, 3, 4, 5];

    const ok = await pedir('POST', '/viajes', { perfil: 'ENCARGADO', body: { ...CORE, paradas: nueve } });
    assert.equal(ok.status, 201);
    assert.equal(paradasDe(ok.json.viaje.id).length, 9);

    const cantidadAntes = viajes.length;
    const diez = await pedir('POST', '/viajes', { perfil: 'ENCARGADO', body: { ...CORE, paradas: [...nueve, 3] } });
    assert.equal(diez.status, 400);
    assert.equal(diez.json.errores.paradas, 'Máximo 9 paradas');
    assert.equal(viajes.length, cantidadAntes, 'no se crea el viaje');
  });

  const FORMATO_INVALIDO = [
    ['no es una lista', 3],
    ['id cero', [0]],
    ['id negativo', [-1]],
    ['id que no es número', ['x']],
    ['id booleano', [true]],
    ['id decimal', [2.5]],
  ];
  for (const [nombre, valor] of FORMATO_INVALIDO) {
    test(`formato inválido (${nombre}): 400 y no se crea nada`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, paradas: valor },
      });

      assert.equal(status, 400);
      assert.ok('paradas' in json.errores);
      assert.equal(viajes.length, 0);
      assert.equal(paradas.length, 0);
    });
  }

  test('una parada que no existe: 400 y no se crea nada', async () => {
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...CORE, paradas: [3, 999] },
    });

    assert.equal(status, 400);
    assert.equal(json.errores.paradas, 'Alguna parada elegida no existe');
    assert.equal(viajes.length, 0);
  });

  describe('dos puntos consecutivos iguales (secuencia [origen, ...paradas, destino])', () => {
    const CONSECUTIVOS = [
      ['la primera parada igual al origen', [1], 'La parada 1 es igual al punto anterior'],
      ['dos paradas seguidas iguales', [3, 3], 'La parada 2 es igual al punto anterior'],
      ['dos paradas iguales en el medio', [3, 4, 4, 5], 'La parada 3 es igual al punto anterior'],
      ['la última parada igual al destino', [3, 2], 'La parada 2 es igual al destino'],
      ['la única parada igual al destino', [2], 'La parada 1 es igual al destino'],
    ];
    for (const [nombre, valor, mensaje] of CONSECUTIVOS) {
      test(`${nombre}: 400 "${mensaje}"`, async () => {
        const { status, json } = await pedir('POST', '/viajes', {
          perfil: 'ENCARGADO',
          body: { ...CORE, paradas: valor },
        });

        assert.equal(status, 400);
        assert.equal(json.errores.paradas, mensaje);
        assert.equal(viajes.length, 0);
        assert.equal(paradas.length, 0);
      });
    }

    test('una ubicación repetida pero NO consecutiva es válida', async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ENCARGADO',
        body: { ...CORE, paradas: [3, 4, 3] },
      });

      assert.equal(status, 201);
      assert.deepEqual(paradasDe(json.viaje.id), [3, 4, 3]);
    });

    test('una parada igual al origen pero no pegada a él es válida (ida y vuelta)', async () => {
      const { status } = await pedir('POST', '/viajes', {
        perfil: 'ENCARGADO',
        body: { ...CORE, paradas: [3, 1, 4] },
      });

      assert.equal(status, 201);
    });
  });

  describe('origen igual a destino', () => {
    test('con al menos una parada es un ida y vuelta: se permite', async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ENCARGADO',
        body: { ...CORE, origenId: 1, destinoId: 1, paradas: [2] },
      });

      assert.equal(status, 201);
      assert.equal(json.viaje.origenId, 1);
      assert.equal(json.viaje.destinoId, 1);
      assert.deepEqual(paradasDe(json.viaje.id), [2]);
    });

    test('sin paradas se mantiene el error de siempre, en el mismo campo y con el mismo mensaje', async () => {
      for (const valor of [undefined, null, []]) {
        const { status, json } = await pedir('POST', '/viajes', {
          perfil: 'ENCARGADO',
          body: { ...CORE, origenId: 1, destinoId: 1, ...(valor === undefined ? {} : { paradas: valor }) },
        });

        assert.equal(status, 400);
        assert.equal(json.errores.destinoId, 'El destino no puede ser el mismo que el origen');
        assert.ok(!('paradas' in json.errores));
      }
      assert.equal(viajes.length, 0);
    });

    test('con paradas que repiten el mismo punto pegado sigue siendo un error', async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ENCARGADO',
        body: { ...CORE, origenId: 1, destinoId: 1, paradas: [1] },
      });

      assert.equal(status, 400);
      assert.equal(json.errores.paradas, 'La parada 1 es igual al punto anterior');
    });
  });

  test('los errores de paradas viajan juntos con los de los otros campos', async () => {
    const { fechaInicio: _omitida, ...sinFecha } = CORE;

    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...sinFecha, paradas: ['x'], cantidadPasajeros: 0, choferesCandidatos: [5, 5] },
    });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), [
      'cantidadPasajeros',
      'choferesCandidatos',
      'fechaInicio',
      'paradas',
    ]);
  });

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se crea nada`, async () => {
      const { status } = await pedir('POST', '/viajes', { perfil, body: { ...CORE, paradas: [3] } });

      assert.equal(status, 403);
      assert.equal(paradas.length, 0);
    });
  }
});

// --- Edición de paradas -----------------------------------------------------

describe('PUT /viajes/:id: paradas', () => {
  test('reordenar: el PUT con el orden nuevo persiste bien', async () => {
    const viaje = agregarViaje({ paradas: [3, 4, 5] });

    const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...CORE, paradas: [5, 3, 4] },
    });

    // Que el doble haga cumplir (viajeId, orden) único prueba además que el
    // deleteMany va antes del createMany: si no, reordenar chocaría.
    assert.equal(status, 200);
    assert.deepEqual(filasDe(viaje.id), [
      { ubicacionId: 5, orden: 1 },
      { ubicacionId: 3, orden: 2 },
      { ubicacionId: 4, orden: 3 },
    ]);
    assert.deepEqual(json.viaje.paradas.map((p) => [p.orden, p.ubicacion.id]), [
      [1, 5],
      [2, 3],
      [3, 4],
    ]);
  });

  test('agregar, quitar y vaciar son reemplazo completo', async () => {
    const viaje = agregarViaje({ paradas: [3] });

    await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE, paradas: [3, 4, 5] } });
    assert.deepEqual(paradasDe(viaje.id), [3, 4, 5]);

    await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE, paradas: [4] } });
    assert.deepEqual(filasDe(viaje.id), [{ ubicacionId: 4, orden: 1 }]);

    await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE, paradas: [] } });
    assert.deepEqual(paradasDe(viaje.id), []);
  });

  test('un PUT sin la clave `paradas` las borra (como cualquier campo ausente)', async () => {
    const viaje = agregarViaje({ paradas: [3, 4] });

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE } });

    assert.equal(status, 200);
    assert.deepEqual(paradasDe(viaje.id), []);
  });

  test('no toca las paradas de otros viajes', async () => {
    const viaje = agregarViaje({ paradas: [3] });
    const otro = agregarViaje({ paradas: [4, 5] });

    await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: { ...CORE, paradas: [5] } });

    assert.deepEqual(paradasDe(otro.id), [4, 5]);
  });

  test('un viaje PROGRAMADO también se puede editar', async () => {
    const viaje = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7, paradas: [3] });
    const programado = {
      ...CORE,
      choferId: 5,
      vehiculoId: 7,
      fechaFin: '2026-10-20T12:00',
      kilometrosEstimados: 80,
    };

    const { status } = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...programado, paradas: [4, 5] },
    });

    assert.equal(status, 200);
    assert.deepEqual(filasDe(viaje.id), [
      { ubicacionId: 4, orden: 1 },
      { ubicacionId: 5, orden: 2 },
    ]);
    assert.equal(filaPorId(viaje.id).kilometrosEstimados, 80);
  });

  for (const estado of ['EN_VIAJE', 'FINALIZADO', 'CANCELADO']) {
    test(`${estado}: no se pueden editar (409) y las paradas quedan intactas`, async () => {
      const viaje = agregarViaje({ estado, choferId: 5, vehiculoId: 7, paradas: [3, 4] });

      const { status } = await pedir('PUT', `/viajes/${viaje.id}`, {
        perfil: 'ENCARGADO',
        body: {
          ...CORE,
          choferId: 5,
          vehiculoId: 7,
          fechaFin: '2026-10-20T12:00',
          kilometrosEstimados: 80,
          paradas: [5],
        },
      });

      assert.equal(status, 409);
      assert.deepEqual(paradasDe(viaje.id), [3, 4]);
    });
  }

  test('paradas inválidas: 400 y las paradas del viaje quedan como estaban', async () => {
    const viaje = agregarViaje({ paradas: [3, 4] });

    for (const valor of [[999], [3, 3], [2], [1], 'x']) {
      const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
        perfil: 'ENCARGADO',
        body: { ...CORE, paradas: valor },
      });
      assert.equal(status, 400);
      assert.ok('paradas' in json.errores);
    }
    assert.deepEqual(paradasDe(viaje.id), [3, 4]);
  });

  test('origen igual a destino: con paradas se permite, sin paradas no', async () => {
    const viaje = agregarViaje({});
    const idaYVuelta = { ...CORE, origenId: 1, destinoId: 1 };

    const sinParadas = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: idaYVuelta });
    assert.equal(sinParadas.status, 400);
    assert.equal(sinParadas.json.errores.destinoId, 'El destino no puede ser el mismo que el origen');

    const conParadas = await pedir('PUT', `/viajes/${viaje.id}`, {
      perfil: 'ENCARGADO',
      body: { ...idaYVuelta, paradas: [2] },
    });
    assert.equal(conParadas.status, 200);
  });

  // Reemplazar las paradas y actualizar el viaje son UNA transacción: si falla
  // cualquier paso, no queda el viaje con las paradas a medio cambiar.
  for (const estado of ['A_CONFIRMAR', 'PROGRAMADO']) {
    const cuerpo = {
      ...CORE,
      ...(estado === 'PROGRAMADO' ? { choferId: 5, vehiculoId: 7, fechaFin: '2026-10-20T12:00' } : {}),
      kilometrosEstimados: 999,
      paradas: [5],
    };

    test(`${estado}: si falla el createMany (el deleteMany ya corrió) se deshace todo`, async () => {
      const silenciar = mock.method(console, 'error', () => {});
      const viaje = agregarViaje({ estado, choferId: 5, vehiculoId: 7, kilometrosEstimados: 100, paradas: [3, 4] });
      fallos.createManyParadas = true;

      const { status } = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: cuerpo });
      silenciar.mock.restore();

      assert.equal(status, 500);
      assert.deepEqual(filasDe(viaje.id), [
        { ubicacionId: 3, orden: 1 },
        { ubicacionId: 4, orden: 2 },
      ]);
      assert.equal(filaPorId(viaje.id).kilometrosEstimados, 100);
    });

    test(`${estado}: si falla el update del viaje (las paradas ya se habían reemplazado) se deshace todo`, async () => {
      const silenciar = mock.method(console, 'error', () => {});
      const viaje = agregarViaje({ estado, choferId: 5, vehiculoId: 7, kilometrosEstimados: 100, paradas: [3, 4] });
      fallos.updateViaje = true;

      const { status } = await pedir('PUT', `/viajes/${viaje.id}`, { perfil: 'ENCARGADO', body: cuerpo });
      silenciar.mock.restore();

      assert.equal(status, 500);
      // Las paradas nuevas ([5]) ya estaban insertadas cuando falló el update:
      // el rollback tiene que devolver las viejas.
      assert.deepEqual(filasDe(viaje.id), [
        { ubicacionId: 3, orden: 1 },
        { ubicacionId: 4, orden: 2 },
      ]);
      assert.equal(filaPorId(viaje.id).kilometrosEstimados, 100);
    });
  }

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403`, async () => {
      const viaje = agregarViaje({ paradas: [3] });
      const { status } = await pedir('PUT', `/viajes/${viaje.id}`, { perfil, body: { ...CORE, paradas: [4] } });
      assert.equal(status, 403);
      assert.deepEqual(paradasDe(viaje.id), [3]);
    });
  }
});

// --- Confirmar y paradas ----------------------------------------------------

describe('PATCH /viajes/:id/confirmar no toca las paradas', () => {
  test('el viaje confirmado conserva sus paradas', async () => {
    const viaje = agregarViaje({ paradas: [3, 4], choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: { choferId: 5, vehiculoId: 7, fechaFin: '2026-10-20T12:00', kilometrosEstimados: 150 },
    });

    assert.equal(status, 200);
    assert.equal(json.viaje.estado, 'PROGRAMADO');
    assert.deepEqual(paradasDe(viaje.id), [3, 4]);
    assert.deepEqual(json.viaje.paradas.map((p) => p.ubicacion.id), [3, 4]);
  });
});

// --- Visibilidad ------------------------------------------------------------

describe('visibilidad de las paradas', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER']) {
    test(`${perfil} ve las paradas, ordenadas, en el listado`, async () => {
      agregarViaje({ paradas: [4, 3, 5] });

      const { status, json } = await pedir('GET', '/viajes', { perfil });

      assert.equal(status, 200);
      assert.deepEqual(json.viajes[0].paradas.map((p) => [p.orden, p.ubicacion.id]), [
        [1, 4],
        [2, 3],
        [3, 5],
      ]);
    });
  }

  test('un CHOFER ve las paradas de su viaje en /mis-viajes', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 10, vehiculoId: 7, paradas: [3, 4] });

    const { status, json } = await pedir('GET', '/viajes/mis-viajes', { perfil: 'CHOFER' });

    assert.equal(status, 200);
    assert.deepEqual(json.viajes[0].paradas.map((p) => p.ubicacion.nombre), ['Alta Gracia', 'Museo del Kempes']);
  });

  test('un viaje sin paradas las trae como lista vacía, para cualquier perfil', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 10, vehiculoId: 7 });

    const taller = await pedir('GET', '/viajes', { perfil: 'PERSONAL_TALLER' });
    const chofer = await pedir('GET', '/viajes/mis-viajes', { perfil: 'CHOFER' });

    assert.deepEqual(taller.json.viajes[0].paradas, []);
    assert.deepEqual(chofer.json.viajes[0].paradas, []);
  });

  test('las paradas no traen datos propios: solo orden y ubicación (id y nombre)', async () => {
    agregarViaje({ paradas: [3] });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    assert.deepEqual(Object.keys(json.viajes[0].paradas[0]).sort(), ['orden', 'ubicacion']);
    assert.deepEqual(Object.keys(json.viajes[0].paradas[0].ubicacion).sort(), ['id', 'nombre']);
  });
});

// --- Garantías de la base (cascade) -----------------------------------------
//
// El borrado en cascada lo hace Postgres, no la app (no hay endpoint que borre
// viajes), y un doble en memoria no lo puede probar. Por eso se verifica lo que
// se ENVÍA: que el schema y el SQL de la migración declaren las FK como tienen
// que ser. No reemplaza una prueba contra una base real.

describe('viaje_paradas: cascade y unicidad declarados en schema y migración', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

  const dirMigraciones = path.join(__dirname, '..', 'prisma', 'migrations');
  const carpeta = fs.readdirSync(dirMigraciones).find((nombre) => nombre.endsWith('_add_paradas_viaje'));

  test('existe la migración de paradas', () => {
    assert.ok(carpeta, 'no se encontró una migración *_add_paradas_viaje');
  });

  test('schema.prisma: borrar un viaje borra sus paradas; no se puede borrar una ubicación usada', () => {
    const modelo = schema.match(/model ViajeParada \{[\s\S]*?\n\}/)?.[0];
    assert.ok(modelo, 'no se encontró el modelo ViajeParada');

    assert.match(modelo, /viaje\s+Viaje\s+@relation\(fields: \[viajeId\], references: \[id\], onDelete: Cascade\)/);
    assert.match(modelo, /ubicacion\s+Ubicacion\s+@relation\(fields: \[ubicacionId\], references: \[id\], onDelete: Restrict\)/);
    assert.match(modelo, /@@unique\(\[viajeId, orden\]\)/);
    assert.match(modelo, /@@map\("viaje_paradas"\)/);
  });

  test('migración: la FK al viaje es ON DELETE CASCADE y la de la ubicación ON DELETE RESTRICT', () => {
    const sql = fs.readFileSync(path.join(dirMigraciones, carpeta, 'migration.sql'), 'utf8');

    assert.match(sql, /FOREIGN KEY \("viaje_id"\) REFERENCES "viajes"\("id"\) ON DELETE CASCADE/);
    assert.match(sql, /FOREIGN KEY \("ubicacion_id"\) REFERENCES "ubicaciones"\("id"\) ON DELETE RESTRICT/);
    assert.match(sql, /CREATE UNIQUE INDEX "viaje_paradas_viaje_id_orden_key" ON "viaje_paradas"\("viaje_id", "orden"\)/);
  });

  test('Viaje y Ubicacion tienen la relación inversa', () => {
    assert.match(schema, /paradas\s+ViajeParada\[\]/);
    assert.match(schema, /viajesParada\s+ViajeParada\[\]/);
  });
});
