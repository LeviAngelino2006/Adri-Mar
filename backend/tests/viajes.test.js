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
  ubicacion: { findUnique: existe([1, 2]) },
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
  viaje: {
    create: async ({ data }) => {
      llamadas.create.push(data);
      return viajeBase({
        ...data,
        estadoViaje: { descripcion: data.estadoViajeId === 1 ? 'A_CONFIRMAR' : 'PROGRAMADO' },
      });
    },
    update: async ({ data }) => {
      llamadas.update.push(data);
      return viajeBase(data);
    },
    findUnique: async () => viajeBase(),
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

const CORE = { clienteId: 1, origenId: 1, destinoId: 2 };

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
