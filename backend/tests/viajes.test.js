// Tests de viajes: alta con datos administrativos, permisos, PATCH de datos
// administrativos y forma de la respuesta.
//
// Levantan la app real de Express (rutas, middlewares de autenticación y
// autorización, controladores y viajeService) con un JWT real, pero con el
// cliente de Prisma reemplazado por un doble en memoria: NO tocan la base de
// datos ni leen el .env. Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma -------------------------------------------------------

const llamadas = { create: [], update: [] };
let viajesParaListar = [];
// Lecturas de odómetro por viaje: { [viajeId]: { INICIO_VIAJE: km, FIN_VIAJE: km } }.
let lecturasPorViaje = {};
// Correcciones: { [idLecturaCorregida]: kmCorregido }.
let correcciones = {};
// Viaje que devuelve viaje.findUnique (el que se edita con PUT); null → un
// PROGRAMADO vacío.
let viajeActual = null;

const idLectura = (viajeId, origen) => viajeId * 10 + (origen === 'INICIO_VIAJE' ? 1 : 2);

// Fila de lectura con los campos que lee serializarLectura.
const lecturaFalsa = (id, valorKm, origen) => ({
  id,
  valorKm,
  origen: { descripcion: origen },
  vehiculoId: 1,
  viajeId: null,
  usuarioId: 1,
  lecturaCorregidaId: null,
  motivo: null,
  fechaHora: new Date('2026-01-01T00:00:00Z'),
  creadoEn: new Date('2026-01-01T00:00:00Z'),
});

function viajeBase(sobrescribir = {}) {
  return {
    id: 1,
    estadoViajeId: 2,
    estadoViaje: { descripcion: 'PROGRAMADO' },
    chofer: null,
    vehiculo: null,
    origen: null,
    destino: null,
    cliente: null,
    estadoPagoCliente: null,
    metodoPagoCliente: null,
    estadoPagoChofer: null,
    metodoPagoChofer: null,
    precio: null,
    pagoChofer: null,
    estadoPagoClienteId: null,
    fechaPagoCliente: null,
    metodoPagoClienteId: null,
    estadoPagoChoferId: null,
    fechaPagoChofer: null,
    metodoPagoChoferId: null,
    fechaInicio: null,
    fechaFin: null,
    kilometrosEstimados: null,
    horaInicioReal: null,
    horaFinReal: null,
    observacionFinal: null,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
    ...sobrescribir,
  };
}

const existe = (ids) => async ({ where: { id } }) => (ids.includes(id) ? { id } : null);

const prismaFalso = {
  cliente: { findUnique: existe([1]) },
  // Solo existencia: al crear/editar un A_CONFIRMAR no se valida habilitación
  // ni solapamiento, así que estos dobles NO traen estadoUsuario/estadoVehiculo
  // — si alguna ruta intentara validar disponibilidad, reventaría.
  usuario: { findUnique: existe([5]), findMany: async ({ where }) => where.id.in.filter((i) => i === 5).map((id) => ({ id })) },
  vehiculo: { findUnique: existe([7]), findMany: async ({ where }) => where.id.in.filter((i) => i === 7).map((id) => ({ id })) },
  ubicacion: {
    findUnique: existe([1, 2]),
    findMany: async ({ where }) => where.id.in.filter((i) => [1, 2].includes(i)).map((id) => ({ id })),
  },
  estadoPago: { findUnique: existe([1, 2, 3]) },
  metodoPago: { findUnique: existe([1, 2, 3]) },
  estadoViaje: {
    findUnique: async ({ where: { descripcion } }) => ({ id: descripcion === 'A_CONFIRMAR' ? 1 : 2, descripcion }),
  },
  lecturaOdometro: {
    findFirst: async ({ where }) => {
      if (where.viajeId !== undefined) {
        const origen = where.origen.descripcion;
        const km = lecturasPorViaje[where.viajeId]?.[origen];
        return km === undefined ? null : lecturaFalsa(idLectura(where.viajeId, origen), km, origen);
      }
      // Cadena de correcciones: quién corrige a la lectura `lecturaCorregidaId`.
      const kmCorregido = correcciones[where.lecturaCorregidaId];
      return kmCorregido === undefined
        ? null
        : lecturaFalsa(where.lecturaCorregidaId + 1000, kmCorregido, 'CORRECCION');
    },
    findUnique: async ({ where }) => {
      for (const [viajeId, lecturas] of Object.entries(lecturasPorViaje)) {
        for (const [origen, km] of Object.entries(lecturas)) {
          if (idLectura(Number(viajeId), origen) === where.id) return lecturaFalsa(where.id, km, origen);
        }
      }
      return null;
    },
  },
  // Los candidatos y el rollback se prueban en viajesCandidatos.test.js (con un
  // doble con estado); acá solo hace falta que las rutas que ahora usan
  // transacción no revienten.
  $transaction: async (fn) => fn(prismaFalso),
  viajeChoferCandidato: { deleteMany: async () => ({}), createMany: async () => ({}) },
  viajeVehiculoCandidato: { deleteMany: async () => ({}), createMany: async () => ({}) },
  viajeParada: { deleteMany: async () => ({}), createMany: async () => ({}) },
  viaje: {
    create: async ({ data }) => {
      llamadas.create.push(data);
      // Los create anidados de candidatos no son columnas del viaje.
      const { choferesCandidatos: _c, vehiculosCandidatos: _v, paradas: _p, ...columnas } = data;
      return viajeBase({
        ...columnas,
        estadoViaje: { descripcion: data.estadoViajeId === 1 ? 'A_CONFIRMAR' : 'PROGRAMADO' },
      });
    },
    update: async ({ data }) => {
      llamadas.update.push(data);
      return viajeBase(data);
    },
    findUnique: async () => viajeActual ?? viajeBase(),
    findMany: async () => viajesParaListar,
  },
};

// Tiene que estar antes de cargar la app: los services hacen
// require('./prismaClient') al cargarse.
const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

// --- Helpers ---------------------------------------------------------------

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
  llamadas.create.length = 0;
  llamadas.update.length = 0;
  viajesParaListar = [];
  lecturasPorViaje = {};
  correcciones = {};
  viajeActual = null;
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

// fechaInicio es obligatoria al crear y al editar en cualquier estado, así que
// forma parte del payload mínimo válido.
const CORE = { clienteId: 1, origenId: 1, destinoId: 2, fechaInicio: '2026-10-20T08:00' };

// En A_CONFIRMAR no hay chofer/vehículo asignado: se usan los candidatos.
const OPERATIVOS_COMPLETOS = {
  choferesCandidatos: [5],
  vehiculosCandidatos: [7],
  fechaFin: '2026-10-20T12:00',
  kilometrosEstimados: 120,
};

const DATOS_ADMINISTRATIVOS_VALIDOS = {
  precio: '150000.5',
  estadoPagoClienteId: 1,
  fechaPagoCliente: '2026-10-10T00:00',
  metodoPagoClienteId: 2,
  pagoChofer: 30000,
  estadoPagoChoferId: 3,
  fechaPagoChofer: null,
  metodoPagoChoferId: 1,
};

const CLAVES_ADMINISTRATIVAS = ['precio', 'pagoChofer', 'estadoPagoClienteId', 'metodoPagoClienteId'];

// --- Alta con datos administrativos ----------------------------------------

describe('POST /viajes con datosAdministrativos', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil}: los datos válidos se guardan en el mismo create`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil,
        body: { ...CORE, datosAdministrativos: DATOS_ADMINISTRATIVOS_VALIDOS },
      });

      assert.equal(status, 201);
      assert.equal(llamadas.create.length, 1);
      const data = llamadas.create[0];
      assert.equal(data.precio, '150000.50');
      assert.equal(data.pagoChofer, '30000.00');
      assert.equal(data.estadoPagoClienteId, 1);
      assert.equal(data.metodoPagoChoferId, 1);
      assert.equal(data.fechaPagoChofer, null);
      // "2026-10-10T00:00" se interpreta como hora de Córdoba (UTC-3).
      assert.equal(data.fechaPagoCliente.toISOString(), '2026-10-10T03:00:00.000Z');
      assert.equal(data.clienteId, 1);
      assert.equal(json.viaje.estado, 'A_CONFIRMAR');
      assert.equal(json.viaje.precio, 150000.5);
    });
  }

  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 y no se crea ningún viaje`, async () => {
      const { status } = await pedir('POST', '/viajes', {
        perfil,
        body: { ...CORE, datosAdministrativos: DATOS_ADMINISTRATIVOS_VALIDOS },
      });

      assert.equal(status, 403);
      assert.equal(llamadas.create.length, 0);
    });
  }

  test('sin token: 401', async () => {
    const { status } = await pedir('POST', '/viajes', { body: { ...CORE } });
    assert.equal(status, 401);
    assert.equal(llamadas.create.length, 0);
  });

  const INVALIDOS = [
    ['monto negativo', { precio: -5 }, 'precio'],
    ['pago al chofer que no es número', { pagoChofer: 'abc' }, 'pagoChofer'],
    ['estado de pago inexistente', { estadoPagoClienteId: 99 }, 'estadoPagoClienteId'],
    ['método de pago inexistente', { metodoPagoChoferId: 77 }, 'metodoPagoChoferId'],
    ['fecha inválida', { fechaPagoChofer: 'no-es-fecha' }, 'fechaPagoChofer'],
  ];
  for (const [nombre, datos, campo] of INVALIDOS) {
    test(`inválido (${nombre}): 400 en "${campo}" y no se crea ningún viaje`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, datosAdministrativos: datos },
      });

      assert.equal(status, 400);
      assert.ok(campo in json.errores, `falta el error de ${campo}`);
      assert.equal(llamadas.create.length, 0, 'un dato inválido no debe dejar un viaje a medias');
    });
  }

  for (const [nombre, valor] of [['texto', 'x'], ['arreglo', [1]]]) {
    test(`datosAdministrativos con forma inválida (${nombre}): 400 y no se crea nada`, async () => {
      const { status } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, datosAdministrativos: valor },
      });
      assert.equal(status, 400);
      assert.equal(llamadas.create.length, 0);
    });
  }

  for (const [nombre, valor] of [['ausente', undefined], ['null', null], ['objeto vacío', {}]]) {
    test(`datosAdministrativos ${nombre}: el create queda sin claves administrativas`, async () => {
      const body = valor === undefined ? { ...CORE } : { ...CORE, datosAdministrativos: valor };
      const { status } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body });

      assert.equal(status, 201);
      assert.equal(llamadas.create.length, 1);
      for (const clave of CLAVES_ADMINISTRATIVAS) {
        assert.ok(!(clave in llamadas.create[0]), `no debería enviarse ${clave}`);
      }
    });
  }
});

// --- Estado inicial, fecha obligatoria y pasajeros (Fase 1) -----------------

describe('POST /viajes: estado inicial', () => {
  test('con todos los datos operativos completos igual nace A_CONFIRMAR, sin validar disponibilidad', async () => {
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ENCARGADO',
      body: { ...CORE, ...OPERATIVOS_COMPLETOS },
    });

    assert.equal(status, 201);
    assert.equal(json.viaje.estado, 'A_CONFIRMAR');
    assert.equal(llamadas.create[0].estadoViajeId, 1);
    // El asignado queda en null; los que vinieron son candidatos.
    assert.equal(llamadas.create[0].choferId, null);
    assert.equal(llamadas.create[0].vehiculoId, null);
    assert.deepEqual(llamadas.create[0].choferesCandidatos, { create: [{ usuarioId: 5 }] });
    assert.deepEqual(llamadas.create[0].vehiculosCandidatos, { create: [{ vehiculoId: 7 }] });
  });

  test('con solo los datos core también nace A_CONFIRMAR', async () => {
    const { status, json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body: { ...CORE } });

    assert.equal(status, 201);
    assert.equal(json.viaje.estado, 'A_CONFIRMAR');
  });
});

describe('fechaInicio obligatoria', () => {
  for (const [nombre, valor] of [['ausente', undefined], ['null', null], ['vacía', ''], ['inválida', 'no-es-fecha']]) {
    test(`POST sin fechaInicio (${nombre}): 400 y no se crea nada`, async () => {
      const { fechaInicio: _omitida, ...sinFecha } = CORE;
      const body = valor === undefined ? sinFecha : { ...sinFecha, fechaInicio: valor };

      const { status, json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body });

      assert.equal(status, 400);
      assert.ok('fechaInicio' in json.errores);
      assert.equal(llamadas.create.length, 0);
    });
  }

  test('POST sin fechaInicio aunque vengan los otros 4 operativos: 400', async () => {
    const { fechaInicio: _omitida, ...sinFecha } = CORE;
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...sinFecha, ...OPERATIVOS_COMPLETOS },
    });

    assert.equal(status, 400);
    assert.ok('fechaInicio' in json.errores);
  });

  test('PUT de un A_CONFIRMAR sin fechaInicio: 400 y no actualiza', async () => {
    viajeActual = viajeBase({ estadoViaje: { descripcion: 'A_CONFIRMAR' } });
    const { fechaInicio: _omitida, ...sinFecha } = CORE;

    const { status, json } = await pedir('PUT', '/viajes/1', { perfil: 'ENCARGADO', body: sinFecha });

    assert.equal(status, 400);
    assert.ok('fechaInicio' in json.errores);
    assert.equal(llamadas.update.length, 0);
  });

  test('PUT de un A_CONFIRMAR con fechaInicio: 200', async () => {
    viajeActual = viajeBase({ estadoViaje: { descripcion: 'A_CONFIRMAR' } });

    const { status } = await pedir('PUT', '/viajes/1', { perfil: 'ENCARGADO', body: { ...CORE } });

    assert.equal(status, 200);
    // "2026-10-20T08:00" se interpreta como hora de Córdoba (UTC-3).
    assert.equal(llamadas.update[0].fechaInicio.toISOString(), '2026-10-20T11:00:00.000Z');
  });
});

describe('cantidadPasajeros', () => {
  test('POST sin pasajeros: OK y se guarda null', async () => {
    const { status, json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body: { ...CORE } });

    assert.equal(status, 201);
    assert.equal(llamadas.create[0].cantidadPasajeros, null);
    assert.equal(json.viaje.cantidadPasajeros, null);
  });

  for (const [nombre, valor] of [['null', null], ['vacío', '']]) {
    test(`POST con pasajeros ${nombre}: OK y se guarda null`, async () => {
      const { status } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, cantidadPasajeros: valor },
      });

      assert.equal(status, 201);
      assert.equal(llamadas.create[0].cantidadPasajeros, null);
    });
  }

  test('POST con pasajeros válidos: se guardan y vuelven en la respuesta', async () => {
    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...CORE, cantidadPasajeros: 45 },
    });

    assert.equal(status, 201);
    assert.equal(llamadas.create[0].cantidadPasajeros, 45);
    assert.equal(json.viaje.cantidadPasajeros, 45);
  });

  test('no se compara con los asientos del vehículo (un número grande es válido)', async () => {
    const { status } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...CORE, ...OPERATIVOS_COMPLETOS, cantidadPasajeros: 500 },
    });

    assert.equal(status, 201);
  });

  const INVALIDOS = [
    ['cero', 0],
    ['negativo', -3],
    ['decimal', 2.5],
    ['texto', 'abc'],
    ['booleano', true],
  ];
  for (const [nombre, valor] of INVALIDOS) {
    test(`POST con pasajeros ${nombre}: 400 y no se crea nada`, async () => {
      const { status, json } = await pedir('POST', '/viajes', {
        perfil: 'ADMINISTRADOR',
        body: { ...CORE, cantidadPasajeros: valor },
      });

      assert.equal(status, 400);
      assert.ok('cantidadPasajeros' in json.errores);
      assert.equal(llamadas.create.length, 0);
    });
  }

  test('PUT de un A_CONFIRMAR: guarda pasajeros, y si no vienen los borra (reemplazo completo)', async () => {
    viajeActual = viajeBase({ estadoViaje: { descripcion: 'A_CONFIRMAR' } });

    await pedir('PUT', '/viajes/1', { perfil: 'ENCARGADO', body: { ...CORE, cantidadPasajeros: 30 } });
    await pedir('PUT', '/viajes/1', { perfil: 'ENCARGADO', body: { ...CORE } });

    assert.equal(llamadas.update[0].cantidadPasajeros, 30);
    assert.equal(llamadas.update[1].cantidadPasajeros, null);
  });

  test('PUT con pasajeros inválidos: 400 y no actualiza', async () => {
    viajeActual = viajeBase({ estadoViaje: { descripcion: 'A_CONFIRMAR' } });

    const { status, json } = await pedir('PUT', '/viajes/1', {
      perfil: 'ENCARGADO',
      body: { ...CORE, cantidadPasajeros: 0 },
    });

    assert.equal(status, 400);
    assert.ok('cantidadPasajeros' in json.errores);
    assert.equal(llamadas.update.length, 0);
  });

  test('POST con fechaInicio ausente y pasajeros = 0: el 400 trae los dos errores juntos', async () => {
    const { fechaInicio: _omitida, ...sinFecha } = CORE;

    const { status, json } = await pedir('POST', '/viajes', {
      perfil: 'ADMINISTRADOR',
      body: { ...sinFecha, cantidadPasajeros: 0 },
    });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), ['cantidadPasajeros', 'fechaInicio']);
    assert.equal(llamadas.create.length, 0);
  });

  test('PUT con fechaInicio ausente y pasajeros = 0: el 400 trae los dos errores juntos', async () => {
    viajeActual = viajeBase({ estadoViaje: { descripcion: 'A_CONFIRMAR' } });
    const { fechaInicio: _omitida, ...sinFecha } = CORE;

    const { status, json } = await pedir('PUT', '/viajes/1', {
      perfil: 'ENCARGADO',
      body: { ...sinFecha, cantidadPasajeros: 0 },
    });

    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), ['cantidadPasajeros', 'fechaInicio']);
    assert.equal(llamadas.update.length, 0);
  });

  test('los pasajeros se ven en el listado para cualquier perfil que ve el viaje', async () => {
    viajesParaListar = [viajeBase({ cantidadPasajeros: 12 })];

    const { json } = await pedir('GET', '/viajes', { perfil: 'PERSONAL_TALLER' });

    assert.equal(json.viajes[0].cantidadPasajeros, 12);
  });
});

// --- PATCH de datos administrativos ----------------------------------------

describe('PATCH /viajes/:id/datos-administrativos', () => {
  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 (misma regla que el alta)`, async () => {
      const { status } = await pedir('PATCH', '/viajes/1/datos-administrativos', { perfil, body: { precio: 10 } });
      assert.equal(status, 403);
      assert.equal(llamadas.update.length, 0);
    });
  }

  test('sin campos reconocidos: 200 y no se toca la fila', async () => {
    const { status } = await pedir('PATCH', '/viajes/1/datos-administrativos', {
      perfil: 'ADMINISTRADOR',
      body: { clienteId: 5, algoDesconocido: true },
    });
    assert.equal(status, 200);
    assert.equal(llamadas.update.length, 0);
  });

  test('es parcial: solo actualiza lo que viene y null borra el dato', async () => {
    const { status } = await pedir('PATCH', '/viajes/1/datos-administrativos', {
      perfil: 'ENCARGADO',
      body: { precio: 10, estadoPagoClienteId: null },
    });
    assert.equal(status, 200);
    assert.deepEqual(llamadas.update, [{ precio: '10.00', estadoPagoClienteId: null }]);
  });

  test('monto inválido: 400 y no actualiza', async () => {
    const { status, json } = await pedir('PATCH', '/viajes/1/datos-administrativos', {
      perfil: 'ADMINISTRADOR',
      body: { precio: 'abc' },
    });
    assert.equal(status, 400);
    assert.ok('precio' in json.errores);
    assert.equal(llamadas.update.length, 0);
  });
});

// --- Forma de la respuesta -------------------------------------------------

describe('respuesta del viaje', () => {
  test('el alta no trae vencido ni excedido', async () => {
    const { json } = await pedir('POST', '/viajes', { perfil: 'ADMINISTRADOR', body: { ...CORE } });
    assert.ok(!('vencido' in json.viaje));
    assert.ok(!('excedido' in json.viaje));
  });

  test('el listado no trae vencido ni excedido, ni con fechas ya pasadas', async () => {
    viajesParaListar = [
      // Programado cuya salida ya pasó: antes habría sido "vencido".
      viajeBase({
        id: 1,
        estadoViaje: { descripcion: 'PROGRAMADO' },
        fechaInicio: new Date('2020-01-01T10:00:00Z'),
        fechaFin: new Date('2020-01-01T12:00:00Z'),
      }),
      // En viaje cuyo fin ya pasó: antes habría sido "excedido".
      viajeBase({
        id: 2,
        estadoViaje: { descripcion: 'EN_VIAJE' },
        fechaInicio: new Date('2020-01-02T10:00:00Z'),
        fechaFin: new Date('2020-01-02T12:00:00Z'),
      }),
    ];

    const { status, json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    assert.equal(status, 200);
    assert.equal(json.viajes.length, 2);
    for (const viaje of json.viajes) {
      assert.ok(!('vencido' in viaje), 'no debe existir vencido');
      assert.ok(!('excedido' in viaje), 'no debe existir excedido');
    }
    assert.deepEqual(
      json.viajes.map((v) => v.estado),
      ['PROGRAMADO', 'EN_VIAJE']
    );
  });
});

describe('odómetro del viaje en la respuesta', () => {
  async function listar() {
    const { status, json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });
    assert.equal(status, 200);
    return Object.fromEntries(json.viajes.map((v) => [v.id, v]));
  }

  test('Finalizado, En viaje y Programado devuelven lo que existe y null en lo demás', async () => {
    viajesParaListar = [
      viajeBase({ id: 1, estadoViaje: { descripcion: 'FINALIZADO' } }),
      viajeBase({ id: 2, estadoViaje: { descripcion: 'EN_VIAJE' } }),
      viajeBase({ id: 3, estadoViaje: { descripcion: 'PROGRAMADO' } }),
    ];
    lecturasPorViaje = {
      1: { INICIO_VIAJE: 57110, FIN_VIAJE: 57310 },
      2: { INICIO_VIAJE: 80000 },
    };

    const v = await listar();

    assert.equal(v[1].odometroInicial, 57110);
    assert.equal(v[1].odometroFinal, 57310);
    assert.equal(v[1].kmRealizados, 200);

    assert.equal(v[2].odometroInicial, 80000);
    assert.equal(v[2].odometroFinal, null);
    assert.equal(v[2].kmRealizados, null);

    assert.equal(v[3].odometroInicial, null);
    assert.equal(v[3].odometroFinal, null);
    assert.equal(v[3].kmRealizados, null);
  });

  test('usa la lectura vigente si fue corregida, y kmRealizados la respeta', async () => {
    viajesParaListar = [viajeBase({ id: 1, estadoViaje: { descripcion: 'FINALIZADO' } })];
    lecturasPorViaje = { 1: { INICIO_VIAJE: 57110, FIN_VIAJE: 57310 } };
    correcciones = { [idLectura(1, 'FIN_VIAJE')]: 57300 };

    const v = await listar();

    assert.equal(v[1].odometroInicial, 57110);
    assert.equal(v[1].odometroFinal, 57300);
    assert.equal(v[1].kmRealizados, 190);
  });
});
