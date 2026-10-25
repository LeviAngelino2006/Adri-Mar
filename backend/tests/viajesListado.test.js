// Tests del listado de viajes de gestión (GET /viajes): las vistas Próximos y
// Anteriores (corte por día de Córdoba, orden y el grupo "sin cerrar"), que sin
// `vista` el endpoint siga exactamente igual que antes y la búsqueda `q` por
// cliente o lugar.
//
// App real de Express con JWT real y un doble de Prisma en memoria que aplica el
// `where` y el `orderBy` que recibe (helpers/whereEnMemoria): no tocan la base ni
// leen el .env. "Ahora" se fija con mock.timers (solo Date).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cumple, ordenar } = require('./helpers/whereEnMemoria');

const SRC = path.join(__dirname, '..', 'src');

// --- Fixtures ----------------------------------------------------------------

// "Ahora": sábado 24 de octubre de 2026 a las 12:00 de Córdoba (UTC-3).
const AHORA = new Date('2026-10-24T15:00:00Z');
// Un instante en hora de Córdoba: cba('2026-10-23', '23:30').
const cba = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`);

const lugar = (id, nombre, nombreNormalizado) => ({ id, nombre, nombreNormalizado, placeId: null, latitud: null, longitud: null });
const cliente = (id, nombre, nombreNormalizado) => ({ id, nombre, nombreNormalizado });
const parada = (orden, ubicacion) => ({ orden, ubicacion });

function viaje(id, estado, fechaInicio, extra = {}) {
  return {
    id,
    estadoViaje: { descripcion: estado },
    fechaInicio,
    fechaFin: null,
    precio: null,
    estadoPagoClienteId: null,
    estadoPagoCliente: null,
    choferId: null,
    chofer: null,
    vehiculoId: null,
    vehiculo: null,
    origenId: 1,
    origen: lugar(1, 'Río Tercero', 'rio tercero'),
    destinoId: 2,
    destino: lugar(2, 'Córdoba', 'cordoba'),
    clienteId: null,
    cliente: null,
    paradas: [],
    choferesCandidatos: [],
    vehiculosCandidatos: [],
    metodoPagoClienteId: null,
    metodoPagoCliente: null,
    fechaPagoCliente: null,
    pagoChofer: null,
    estadoPagoChoferId: null,
    estadoPagoChofer: null,
    fechaPagoChofer: null,
    metodoPagoChoferId: null,
    metodoPagoChofer: null,
    kilometrosEstimados: null,
    cantidadPasajeros: null,
    horaInicioReal: null,
    horaFinReal: null,
    observacionFinal: null,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

// Los ids no siguen el orden de las fechas a propósito.
const VIAJES = {
  aConfirmarViejo: viaje(1, 'A_CONFIRMAR', cba('2026-10-20', '09:00')),
  programadoAyer: viaje(2, 'PROGRAMADO', cba('2026-10-23', '08:00')),
  // Ayer a las 23:30 de Córdoba: en UTC ya es el 24 (02:30), pero es de ayer.
  enViajeDesdeAyer: viaje(3, 'EN_VIAJE', cba('2026-10-23', '23:30'), { choferId: 8 }),
  // Hoy a las 00:30 de Córdoba: en UTC todavía es el 24 (03:30); es de hoy.
  programadoHoyTemprano: viaje(4, 'PROGRAMADO', cba('2026-10-24', '00:30'), { choferId: 8 }),
  enViajeHoy: viaje(5, 'EN_VIAJE', cba('2026-10-24', '07:00')),
  programadoHoyTarde: viaje(6, 'PROGRAMADO', cba('2026-10-24', '18:00'), {
    clienteId: 1,
    cliente: cliente(1, 'Colegio Nacional de Monserrat', 'colegio nacional de monserrat'),
  }),
  aConfirmarSemanaQueViene: viaje(7, 'A_CONFIRMAR', cba('2026-10-30', '10:00'), {
    clienteId: 3,
    cliente: cliente(3, 'Viajes 100% Serranos', 'viajes 100% serranos'),
  }),
  programadoSemanaQueViene: viaje(8, 'PROGRAMADO', cba('2026-10-29', '06:00'), {
    origenId: 3,
    origen: lugar(3, 'Villa María', 'villa maria'),
    destinoId: 4,
    destino: lugar(4, 'Mendoza', 'mendoza'),
    paradas: [parada(1, lugar(5, 'San Luis', 'san luis')), parada(2, lugar(6, 'Mercedes', 'mercedes'))],
  }),
  aConfirmarSinFecha: viaje(9, 'A_CONFIRMAR', null),
  finalizadoHoy: viaje(10, 'FINALIZADO', cba('2026-10-24', '05:00'), {
    clienteId: 2,
    cliente: cliente(2, 'Turismo Peñón SRL', 'turismo penon srl'),
  }),
  // Destino particular (una dirección de Google): sin nombreNormalizado.
  finalizadoSemanaPasada: viaje(11, 'FINALIZADO', cba('2026-10-15', '09:00'), {
    destinoId: 7,
    destino: lugar(7, 'Av. Colón 1234, Córdoba', null),
  }),
  canceladoHaceDosSemanas: viaje(12, 'CANCELADO', cba('2026-10-08', '09:00')),
  // Cancelado antes de tener fecha (era A confirmar).
  canceladoSinFecha: viaje(13, 'CANCELADO', null),
};

const ids = (...nombres) => nombres.map((n) => VIAJES[n].id);

// --- Doble de Prisma -----------------------------------------------------------

const llamadasFindMany = [];
let filas = [];

const prismaFalso = {
  viaje: {
    findMany: async (args) => {
      llamadasFindMany.push(args);
      const filtradas = args.where ? filas.filter((f) => cumple(f, args.where)) : filas;
      return ordenar(filtradas, args.orderBy);
    },
  },
  lecturaOdometro: { findFirst: async () => null },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

// La sesión sale del token (ver helpers/sesionDelToken.js).
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
instalarSesionDelToken(SRC);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

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
  llamadasFindMany.length = 0;
  filas = Object.values(VIAJES);
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: AHORA });
});

async function pedir(ruta, perfil = 'ENCARGADO') {
  const token = generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil, habilitadoParaConducir: true });
  const respuesta = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: respuesta.status, json: await respuesta.json() };
}

const idsDe = (json) => json.viajes.map((v) => v.id);

// --- Tests ---------------------------------------------------------------------

describe('GET /viajes sin vista: igual que antes', () => {
  test('todos los estados, del más futuro al más viejo, sin fecha al final y sin la clave sinCerrar', async () => {
    const { status, json } = await pedir('/viajes');

    assert.equal(status, 200);
    assert.deepEqual(llamadasFindMany[0].where, {});
    assert.deepEqual(llamadasFindMany[0].orderBy, { fechaInicio: { sort: 'desc', nulls: 'last' } });
    assert.deepEqual(
      idsDe(json).slice(0, 4),
      ids('aConfirmarSemanaQueViene', 'programadoSemanaQueViene', 'programadoHoyTarde', 'enViajeHoy')
    );
    assert.equal(json.viajes.length, Object.keys(VIAJES).length);
    assert.deepEqual(new Set(idsDe(json).slice(-2)), new Set(ids('aConfirmarSinFecha', 'canceladoSinFecha')));
    assert.ok(json.viajes.every((v) => !('sinCerrar' in v)));
  });

  test('los filtros de siempre arman el mismo where que antes', async () => {
    await pedir('/viajes?estado=PROGRAMADO&choferId=8&fechaDesde=2026-10-24&fechaHasta=2026-10-24');
    assert.deepEqual(llamadasFindMany[0].where, {
      estadoViaje: { descripcion: { equals: 'PROGRAMADO' } },
      choferId: 8,
      fechaInicio: { gte: cba('2026-10-24', '00:00'), lte: new Date('2026-10-25T02:59:59.999Z') },
    });
    assert.deepEqual(llamadasFindMany[0].orderBy, { fechaInicio: { sort: 'desc', nulls: 'last' } });
  });
});

describe('GET /viajes?vista=proximos', () => {
  test('solo los abiertos: primero los sin cerrar, después los En viaje, después de hoy en adelante y sin fecha al final', async () => {
    const { status, json } = await pedir('/viajes?vista=proximos');

    assert.equal(status, 200);
    assert.deepEqual(llamadasFindMany[0].where, {
      estadoViaje: { descripcion: { in: ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE'] } },
    });
    assert.deepEqual(
      idsDe(json),
      ids(
        // Sin cerrar, del más viejo al más nuevo.
        'aConfirmarViejo',
        'programadoAyer',
        'enViajeDesdeAyer',
        // En viaje de hoy.
        'enViajeHoy',
        // De hoy en adelante, del más próximo al más lejano.
        'programadoHoyTemprano',
        'programadoHoyTarde',
        'programadoSemanaQueViene',
        'aConfirmarSemanaQueViene',
        'aConfirmarSinFecha'
      )
    );
  });

  test('sinCerrar: true solo en los abiertos de días anteriores (día de Córdoba)', async () => {
    const { json } = await pedir('/viajes?vista=proximos');
    const sinCerrar = json.viajes.filter((v) => v.sinCerrar).map((v) => v.id);

    assert.deepEqual(sinCerrar, ids('aConfirmarViejo', 'programadoAyer', 'enViajeDesdeAyer'));
    assert.ok(json.viajes.every((v) => typeof v.sinCerrar === 'boolean'));
  });

  test('a las 22:00 de Córdoba (en UTC ya es mañana) el corte sigue siendo el día de Córdoba', async () => {
    mock.timers.setTime(new Date('2026-10-25T01:00:00Z').getTime());
    const { json } = await pedir('/viajes?vista=proximos');
    const porId = new Map(json.viajes.map((v) => [v.id, v.sinCerrar]));

    assert.equal(porId.get(VIAJES.programadoHoyTarde.id), false);
    assert.equal(porId.get(VIAJES.programadoHoyTemprano.id), false);
    assert.equal(porId.get(VIAJES.enViajeDesdeAyer.id), true);
  });

  test('a las 00:30 del domingo, lo del sábado ya es sin cerrar', async () => {
    mock.timers.setTime(cba('2026-10-25', '00:30').getTime());
    const { json } = await pedir('/viajes?vista=proximos');
    const porId = new Map(json.viajes.map((v) => [v.id, v.sinCerrar]));

    assert.equal(porId.get(VIAJES.programadoHoyTarde.id), true);
    assert.equal(porId.get(VIAJES.enViajeHoy.id), true);
    assert.equal(porId.get(VIAJES.programadoSemanaQueViene.id), false);
  });

  test('los filtros se aplican dentro de la vista', async () => {
    const programados = await pedir('/viajes?vista=proximos&estado=PROGRAMADO');
    assert.deepEqual(
      idsDe(programados.json),
      ids('programadoAyer', 'programadoHoyTemprano', 'programadoHoyTarde', 'programadoSemanaQueViene')
    );

    const deUnChofer = await pedir('/viajes?vista=proximos&choferId=8');
    assert.deepEqual(idsDe(deUnChofer.json), ids('enViajeDesdeAyer', 'programadoHoyTemprano'));

    const hastaHoy = await pedir('/viajes?vista=proximos&fechaHasta=2026-10-24');
    assert.deepEqual(
      idsDe(hastaHoy.json),
      ids('aConfirmarViejo', 'programadoAyer', 'enViajeDesdeAyer', 'enViajeHoy', 'programadoHoyTemprano', 'programadoHoyTarde')
    );
  });

  test('un estado que no es de la vista da una lista vacía, no un error', async () => {
    const { status, json } = await pedir('/viajes?vista=proximos&estado=FINALIZADO');
    assert.equal(status, 200);
    assert.deepEqual(json.viajes, []);
  });

  test('Personal de Taller también puede usar la vista', async () => {
    const { status, json } = await pedir('/viajes?vista=proximos', 'PERSONAL_TALLER');
    assert.equal(status, 200);
    assert.equal(json.viajes.length, 9);
  });
});

describe('GET /viajes?vista=anteriores', () => {
  test('Finalizados y Cancelados de cualquier fecha, el más reciente primero, sin fecha al final', async () => {
    const { status, json } = await pedir('/viajes?vista=anteriores');

    assert.equal(status, 200);
    assert.deepEqual(llamadasFindMany[0].where, {
      estadoViaje: { descripcion: { in: ['FINALIZADO', 'CANCELADO'] } },
    });
    assert.deepEqual(
      idsDe(json),
      ids('finalizadoHoy', 'finalizadoSemanaPasada', 'canceladoHaceDosSemanas', 'canceladoSinFecha')
    );
    assert.ok(json.viajes.every((v) => !('sinCerrar' in v)));
  });

  test('cada viaje está en una sola de las dos vistas, y entre las dos están todos', async () => {
    const proximos = idsDe((await pedir('/viajes?vista=proximos')).json);
    const anteriores = idsDe((await pedir('/viajes?vista=anteriores')).json);
    assert.equal(proximos.filter((id) => anteriores.includes(id)).length, 0);
    assert.deepEqual([...proximos, ...anteriores].sort((a, b) => a - b), Object.values(VIAJES).map((v) => v.id).sort((a, b) => a - b));
  });

  test('con estado=CANCELADO, solo los cancelados', async () => {
    const { json } = await pedir('/viajes?vista=anteriores&estado=CANCELADO');
    assert.deepEqual(idsDe(json), ids('canceladoHaceDosSemanas', 'canceladoSinFecha'));
  });
});

describe('GET /viajes con una vista inválida', () => {
  for (const ruta of ['/viajes?vista=todos', '/viajes?vista=', '/viajes?vista=toString', '/viajes?vista=proximos&vista=anteriores']) {
    test(`${ruta}: 400 con el error en vista y sin consultar la base`, async () => {
      const { status, json } = await pedir(ruta);
      assert.equal(status, 400);
      assert.ok(json.errores.vista);
      assert.equal(llamadasFindMany.length, 0);
    });
  }

  test('/mis-viajes no usa la vista: el parámetro se ignora', async () => {
    filas = Object.values(VIAJES).map((v) => ({ ...v, choferId: 10 }));
    const { status } = await pedir('/viajes/mis-viajes?vista=todos', 'CHOFER');
    assert.equal(status, 200);
    assert.ok(!('in' in (llamadasFindMany[0].where.estadoViaje?.descripcion ?? {})));
  });
});

describe('GET /viajes?q=: búsqueda por cliente o lugar', () => {
  const buscar = (q, extra = '') => pedir(`/viajes?q=${encodeURIComponent(q)}${extra}`);

  test('por cliente, sin distinguir mayúsculas', async () => {
    for (const q of ['monserrat', 'MONSERRAT', 'Colegio Nacional']) {
      const { status, json } = await buscar(q);
      assert.equal(status, 200, q);
      assert.deepEqual(idsDe(json), ids('programadoHoyTarde'), q);
    }
  });

  test('por origen, destino o parada', async () => {
    assert.deepEqual(idsDe((await buscar('Villa María')).json), ids('programadoSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('mendoza')).json), ids('programadoSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('San Luis')).json), ids('programadoSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('mercedes')).json), ids('programadoSemanaQueViene'));
  });

  test('sin distinguir tildes en clientes y ubicaciones frecuentes, para los dos lados', async () => {
    assert.deepEqual(idsDe((await buscar('VILLA MARIA')).json), ids('programadoSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('peñon')).json), ids('finalizadoHoy'));
    assert.deepEqual(idsDe((await buscar('penón')).json), ids('finalizadoHoy'));
    // "rio tercero" encuentra "Río Tercero", el origen de todos menos uno.
    assert.equal((await buscar('rio tercero')).json.viajes.length, Object.keys(VIAJES).length - 1);
  });

  test('una dirección particular (sin nombre normalizado) no distingue mayúsculas, pero sí tildes', async () => {
    assert.deepEqual(idsDe((await buscar('COLÓN 1234')).json), ids('finalizadoSemanaPasada'));
    assert.deepEqual(idsDe((await buscar('colon 1234')).json), []);
  });

  test('arma el filtro con la API de Prisma: el texto recortado y el normalizado, en un AND', async () => {
    await buscar('  Río  ');
    const { AND } = llamadasFindMany[0].where;
    assert.equal(AND.length, 1);
    const enUbicacion = { OR: [{ nombreNormalizado: { contains: 'rio' } }, { nombre: { contains: 'Río', mode: 'insensitive' } }] };
    assert.deepEqual(AND[0], {
      OR: [
        { cliente: { is: { nombreNormalizado: { contains: 'rio' } } } },
        { origen: { is: enUbicacion } },
        { destino: { is: enUbicacion } },
        { paradas: { some: { ubicacion: enUbicacion } } },
      ],
    });
  });

  test('"%" y "_" se buscan literales, no como comodines de LIKE', async () => {
    assert.deepEqual(idsDe((await buscar('%')).json), ids('aConfirmarSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('100% serr')).json), ids('aConfirmarSemanaQueViene'));
    assert.deepEqual(idsDe((await buscar('_')).json), []);
    assert.deepEqual(idsDe((await buscar('r_o tercero')).json), []);

    llamadasFindMany.length = 0;
    // El texto a_b%c\d llega a la base como a\_b\%c\\d.
    await buscar('a_b%c\\d');
    const [{ OR }] = llamadasFindMany[0].where.AND;
    assert.deepEqual(OR[0], { cliente: { is: { nombreNormalizado: { contains: 'a\\_b\\%c\\\\d' } } } });
  });

  for (const q of ['', '   ']) {
    test(`q=${JSON.stringify(q)} es lo mismo que no buscar`, async () => {
      const { status, json } = await buscar(q);
      assert.equal(status, 200);
      assert.deepEqual(llamadasFindMany[0].where, {});
      assert.equal(json.viajes.length, Object.keys(VIAJES).length);
    });
  }

  test('se combina con la vista y con el filtro de cobro', async () => {
    assert.deepEqual(
      idsDe((await buscar('córdoba', '&vista=anteriores')).json),
      ids('finalizadoHoy', 'finalizadoSemanaPasada', 'canceladoHaceDosSemanas', 'canceladoSinFecha')
    );
    assert.deepEqual(idsDe((await buscar('colón', '&vista=proximos')).json), []);

    llamadasFindMany.length = 0;
    await buscar('mendoza', '&administrativoPendiente=true');
    assert.equal(llamadasFindMany[0].where.AND.length, 2);
  });

  test('hasta 100 caracteres se busca; con más, 400 con el error en q y sin consultar la base', async () => {
    assert.equal((await buscar('a'.repeat(100))).status, 200);

    llamadasFindMany.length = 0;
    const { status, json } = await buscar('a'.repeat(101));
    assert.equal(status, 400);
    assert.match(json.errores.q, /100 caracteres/);
    assert.equal(llamadasFindMany.length, 0);
  });

  test('los espacios de los extremos no cuentan para el largo', async () => {
    assert.equal((await buscar(` ${'a'.repeat(100)} `)).status, 200);
  });

  test('?q=a&q=b (no es un texto): 400', async () => {
    const { status, json } = await pedir('/viajes?q=a&q=b');
    assert.equal(status, 400);
    assert.ok(json.errores.q);
  });
});
