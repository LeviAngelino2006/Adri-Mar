// Tests de presupuestos (SCRUM-159): permisos por perfil, alta con sus unidades
// (y la descripción snapshot de cada una), validaciones del POST, listado con
// búsqueda por cliente y detalle.
//
// Levantan la app real de Express con un JWT real y un doble de Prisma en
// memoria (con $transaction con rollback y Prisma.Decimal de verdad, para que
// la serialización de importes se pruebe igual que contra la base). NO tocan la
// base ni leen el .env. Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Prisma } = require('@prisma/client');

const SRC = path.join(__dirname, '..', 'src');

// --- Doble de Prisma --------------------------------------------------------

const db = {
  clientes: [],
  ubicaciones: [],
  tiposVehiculo: [],
  estadosVehiculo: [],
  vehiculos: [],
  usuarios: [],
  presupuestos: [],
  unidades: [],
  siguienteId: 1,
};

function sembrar() {
  db.clientes = [
    { id: 1, nombre: 'Río Tercero SA', nombreNormalizado: 'rio tercero sa' },
    { id: 2, nombre: 'Escuela Normal', nombreNormalizado: 'escuela normal' },
  ];
  db.ubicaciones = [
    { id: 1, nombre: 'Río Tercero' },
    { id: 2, nombre: 'Córdoba' },
  ];
  db.tiposVehiculo = [
    { id: 1, descripcion: 'Colectivo' },
    { id: 2, descripcion: 'Minibus' },
  ];
  db.estadosVehiculo = [
    { id: 1, descripcion: 'OPERATIVO' },
    { id: 2, descripcion: 'EN_TALLER' },
    { id: 3, descripcion: 'DADO_DE_BAJA' },
  ];
  db.vehiculos = [
    { id: 1, numeroInterno: '12', dominio: 'AB123CD', asientos: 17, tipoVehiculoId: 2, estadoVehiculoId: 1 },
    { id: 2, numeroInterno: '7', dominio: 'AC456EF', asientos: 45, tipoVehiculoId: 1, estadoVehiculoId: 2 },
    { id: 3, numeroInterno: '3', dominio: 'AA000AA', asientos: 19, tipoVehiculoId: 2, estadoVehiculoId: 3 },
  ];
  db.usuarios = [{ id: 10, personaId: 10, persona: { id: 10, nombre: 'Ana', apellido: 'Gestora' } }];
  db.presupuestos = [];
  db.unidades = [];
  db.siguienteId = 1;
}

const porId = (lista, id) => lista.find((f) => f.id === id) ?? null;
const conNombre = (fila) => fila && { id: fila.id, nombre: fila.nombre };

function vehiculoCompleto(v) {
  return {
    ...v,
    tipoVehiculo: porId(db.tiposVehiculo, v.tipoVehiculoId),
    estadoVehiculo: porId(db.estadosVehiculo, v.estadoVehiculoId),
  };
}

// Arma el presupuesto como lo devolvería Prisma con el include del service.
function conRelaciones(p, include = {}) {
  const fila = { ...p };
  if (include.cliente) fila.cliente = conNombre(porId(db.clientes, p.clienteId));
  if (include.origen) fila.origen = conNombre(porId(db.ubicaciones, p.origenId));
  if (include.destino) fila.destino = conNombre(porId(db.ubicaciones, p.destinoId));
  if (include.creadoPor) {
    // Usuario no tiene nombre ni apellido (viven en Persona): Prisma real falla
    // si se los pide, así que el doble también.
    const select = include.creadoPor.select ?? {};
    assert.ok(!select.nombre && !select.apellido, 'el nombre del usuario va en persona { select: { nombre, apellido } }');
    const u = porId(db.usuarios, p.creadoPorId);
    fila.creadoPor = { id: u.id, persona: { nombre: u.persona.nombre, apellido: u.persona.apellido } };
  }
  if (include.unidades) {
    assert.deepEqual(include.unidades.orderBy, { orden: 'asc' }, 'las unidades tienen que salir ordenadas');
    fila.unidades = db.unidades
      .filter((u) => u.presupuestoId === p.id)
      .sort((a, b) => a.orden - b.orden)
      .map((u) => {
        const v = porId(db.vehiculos, u.vehiculoId);
        return { ...u, vehiculo: { id: v.id, numeroInterno: v.numeroInterno, dominio: v.dominio } };
      });
  }
  return fila;
}

const prismaFalso = {
  cliente: { findUnique: async ({ where: { id } }) => porId(db.clientes, id) },
  ubicacion: { findUnique: async ({ where: { id } }) => porId(db.ubicaciones, id) },
  vehiculo: {
    findMany: async ({ where }) => db.vehiculos.filter((v) => where.id.in.includes(v.id)).map(vehiculoCompleto),
  },
  presupuesto: {
    create: async ({ data }) => {
      const { unidades, ...campos } = data;
      // Mismo tipo que devuelve Prisma para las columnas Decimal.
      assert.equal(typeof campos.importeNeto, 'string', 'el importe tiene que llegar a Prisma como string');
      const id = db.siguienteId++;
      const fila = {
        id,
        ...campos,
        importeNeto: new Prisma.Decimal(campos.importeNeto),
        alicuotaIva: new Prisma.Decimal(campos.alicuotaIva),
        creadoEn: new Date(Date.parse('2026-10-12T12:00:00Z') + id * 1000),
      };
      db.presupuestos.push(fila);
      for (const unidad of unidades.create) {
        db.unidades.push({ id: db.siguienteId++, presupuestoId: id, ...unidad });
      }
      return fila;
    },
    findUnique: async ({ where: { id }, include }) => {
      const p = porId(db.presupuestos, id);
      return p ? conRelaciones(p, include) : null;
    },
    findMany: async ({ where, include, orderBy }) => {
      assert.deepEqual(orderBy, [{ creadoEn: 'desc' }, { id: 'desc' }]);
      const texto = where?.cliente?.nombreNormalizado?.contains;
      return db.presupuestos
        .filter((p) => texto === undefined || porId(db.clientes, p.clienteId).nombreNormalizado.includes(texto))
        .sort((a, b) => b.creadoEn - a.creadoEn || b.id - a.id)
        .map((p) => conRelaciones(p, include));
    },
  },
  // Rollback real: si la función lanza, se restauran las tablas.
  $transaction: async (fn) => {
    const copia = { presupuestos: [...db.presupuestos], unidades: [...db.unidades] };
    try {
      return await fn(prismaFalso);
    } catch (err) {
      db.presupuestos = copia.presupuestos;
      db.unidades = copia.unidades;
      throw err;
    }
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

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

beforeEach(sembrar);

async function pedir(metodo, ruta, { perfil = 'ENCARGADO', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) {
    headers.Authorization = `Bearer ${generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil })}`;
  }
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

function payloadValido(cambios = {}) {
  return {
    fechaEmision: '2026-10-12',
    clienteId: 1,
    origenId: 1,
    destinoId: 2,
    fechaServicio: '2026-11-05',
    horaSalida: '07:30',
    cantidadPasajeros: 40,
    importeNeto: 420000,
    conFactura: true,
    formaPago: 'EFECTIVO / TRANSFERENCIA BANCARIA Y/O VALORES A 30 Y 60 DÍAS',
    diasValidez: 15,
    vehiculoIds: [1, 2],
    ...cambios,
  };
}

const crear = (cambios, opciones) => pedir('POST', '/presupuestos', { body: payloadValido(cambios), ...opciones });

// --- Tests ------------------------------------------------------------------

describe('permisos', () => {
  for (const perfil of ['CHOFER', 'PERSONAL_TALLER']) {
    test(`${perfil}: 403 en POST /, GET / y GET /:id`, async () => {
      const creado = await crear();
      assert.equal(creado.status, 201);
      const id = creado.json.presupuesto.id;

      assert.equal((await crear({}, { perfil })).status, 403);
      assert.equal((await pedir('GET', '/presupuestos', { perfil })).status, 403);
      assert.equal((await pedir('GET', `/presupuestos/${id}`, { perfil })).status, 403);
      assert.equal(db.presupuestos.length, 1, 'el POST rechazado no tiene que crear nada');
    });
  }

  test('sin token: 401', async () => {
    assert.equal((await pedir('GET', '/presupuestos', { perfil: null })).status, 401);
  });

  test('ADMINISTRADOR también puede crear', async () => {
    assert.equal((await crear({}, { perfil: 'ADMINISTRADOR' })).status, 201);
  });
});

describe('POST /presupuestos', () => {
  test('crea con 2 unidades y guarda la descripción snapshot de cada una, en orden', async () => {
    const { status, json } = await crear({ vehiculoIds: [2, 1] });

    assert.equal(status, 201);
    const p = json.presupuesto;
    assert.deepEqual(
      p.unidades.map((u) => ({ vehiculoId: u.vehiculoId, descripcion: u.descripcion, orden: u.orden })),
      [
        { vehiculoId: 2, descripcion: 'Colectivo de 45 pasajeros', orden: 1 },
        { vehiculoId: 1, descripcion: 'Minibus de 17 pasajeros', orden: 2 },
      ]
    );
    assert.deepEqual(
      db.unidades.map((u) => u.descripcion),
      ['Colectivo de 45 pasajeros', 'Minibus de 17 pasajeros'],
      'la descripción queda guardada en la tabla, no se calcula al leer'
    );
    assert.deepEqual(p.unidades[0].vehiculo, { id: 2, numeroInterno: '7', dominio: 'AC456EF' });
  });

  test('devuelve el detalle con Decimal como string y fechas sin hora', async () => {
    const { json } = await crear({ importeNeto: '1234.5' });
    const p = json.presupuesto;

    assert.equal(p.importeNeto, '1234.50');
    assert.equal(p.alicuotaIva, '10.50');
    assert.equal(p.fechaEmision, '2026-10-12');
    assert.equal(p.fechaServicio, '2026-11-05');
    assert.equal(p.horaSalida, '07:30');
    assert.equal(p.conFactura, true);
    assert.equal(p.diasValidez, 15);
    assert.deepEqual(p.cliente, { id: 1, nombre: 'Río Tercero SA' });
    assert.deepEqual(p.origen, { id: 1, nombre: 'Río Tercero' });
    assert.deepEqual(p.destino, { id: 2, nombre: 'Córdoba' });
    assert.deepEqual(p.creadoPor, { id: 10, nombre: 'Ana', apellido: 'Gestora' });
  });

  test('la alícuota la pone el backend aunque el cliente mande otra', async () => {
    const { json } = await pedir('POST', '/presupuestos', { body: { ...payloadValido(), alicuotaIva: 21 } });
    assert.equal(json.presupuesto.alicuotaIva, '10.50');
  });

  test('sin horaSalida queda en null (A confirmar) y sin conFactura queda con recibo', async () => {
    const { conFactura, horaSalida, ...resto } = payloadValido();
    const { status, json } = await pedir('POST', '/presupuestos', { body: resto });
    assert.equal(status, 201);
    assert.equal(json.presupuesto.horaSalida, null);
    assert.equal(json.presupuesto.conFactura, false);
  });

  for (const horaSalida of ['', '   ', null]) {
    test(`horaSalida ${JSON.stringify(horaSalida)} se guarda como null (A confirmar)`, async () => {
      const { status, json } = await crear({ horaSalida });
      assert.equal(status, 201);
      assert.equal(json.presupuesto.horaSalida, null);
      assert.equal(db.presupuestos[0].horaSalida, null);
    });
  }

  test('horaSalida con espacios alrededor se guarda recortada', async () => {
    const { json } = await crear({ horaSalida: ' 07:30 ' });
    assert.equal(json.presupuesto.horaSalida, '07:30');
  });

  test('creadoPorId sale del token, nunca del body', async () => {
    const { status, json } = await crear({ creadoPorId: 999 });
    assert.equal(status, 201);
    assert.equal(db.presupuestos[0].creadoPorId, 10);
    assert.equal(json.presupuesto.creadoPor.id, 10);
  });

  for (const importeNeto of [99999999999, '99999999999', '10000000000.00']) {
    test(`importeNeto con más de 10 dígitos enteros (${JSON.stringify(importeNeto)}): 400, no 500`, async () => {
      const { status, json } = await crear({ importeNeto });
      assert.equal(status, 400);
      assert.ok(json.errores.importeNeto);
      assert.equal(db.presupuestos.length, 0);
    });
  }

  test('importeNeto en el máximo de Decimal(12,2) es válido', async () => {
    const { status, json } = await crear({ importeNeto: '9999999999.99' });
    assert.equal(status, 201);
    assert.equal(json.presupuesto.importeNeto, '9999999999.99');
  });

  test('un vehículo EN_TALLER se puede presupuestar', async () => {
    assert.equal((await crear({ vehiculoIds: [2] })).status, 201);
  });

  test('vehículo dado de baja: 400 y no crea nada', async () => {
    const { status, json } = await crear({ vehiculoIds: [1, 3] });
    assert.equal(status, 400);
    assert.match(json.errores.vehiculoIds, /dadas de baja/);
    assert.equal(db.presupuestos.length, 0);
    assert.equal(db.unidades.length, 0);
  });

  for (const [descripcion, vehiculoIds] of [
    ['vacío', []],
    ['ausente', undefined],
    ['que no es un array', 1],
    ['con repetidos', [1, 1]],
    ['con un id inválido', [1, 'x']],
    ['con un vehículo que no existe', [1, 99]],
  ]) {
    test(`vehiculoIds ${descripcion}: 400`, async () => {
      const { status, json } = await crear({ vehiculoIds });
      assert.equal(status, 400);
      assert.ok(json.errores.vehiculoIds);
    });
  }

  for (const horaSalida of ['25:00', '9:30', '07:60', '0730', 730]) {
    test(`horaSalida ${JSON.stringify(horaSalida)}: 400`, async () => {
      const { status, json } = await crear({ horaSalida });
      assert.equal(status, 400);
      assert.equal(json.errores.horaSalida, 'El horario de salida debe tener el formato HH:mm');
    });
  }

  for (const diasValidez of [0, -5, 1.5, 366, '15 días', true]) {
    test(`diasValidez ${JSON.stringify(diasValidez)}: 400`, async () => {
      const { status, json } = await crear({ diasValidez });
      assert.equal(status, 400);
      assert.match(json.errores.diasValidez, /entre 1 y 365/);
    });
  }

  test('diasValidez en los extremos (1 y 365) es válido', async () => {
    assert.equal((await crear({ diasValidez: 1 })).status, 201);
    assert.equal((await crear({ diasValidez: 365 })).status, 201);
  });

  test('faltan los obligatorios: 400 con un error por campo', async () => {
    const { status, json } = await pedir('POST', '/presupuestos', { body: {} });
    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json.errores).sort(), [
      'cantidadPasajeros',
      'clienteId',
      'destinoId',
      'diasValidez',
      'fechaEmision',
      'fechaServicio',
      'formaPago',
      'importeNeto',
      'origenId',
      'vehiculoIds',
    ]);
  });

  for (const [campo, valor] of [
    ['importeNeto', 0],
    ['importeNeto', -10],
    ['importeNeto', '12.345'],
    ['importeNeto', '1e5'],
    ['cantidadPasajeros', 0],
    ['cantidadPasajeros', 2.5],
    ['fechaEmision', '2026-02-30'],
    ['fechaServicio', '12/11/2026'],
    ['conFactura', 'si'],
    ['formaPago', '   '],
  ]) {
    test(`${campo} ${JSON.stringify(valor)}: 400`, async () => {
      const { status, json } = await crear({ [campo]: valor });
      assert.equal(status, 400);
      assert.ok(json.errores[campo], `esperaba error en ${campo}`);
    });
  }

  test('fecha del servicio anterior a la emisión: 400', async () => {
    const { status, json } = await crear({ fechaServicio: '2026-10-11' });
    assert.equal(status, 400);
    assert.ok(json.errores.fechaServicio);
  });

  test('cliente, origen o destino inexistentes: 400 por campo', async () => {
    const { status, json } = await crear({ clienteId: 99, origenId: 98, destinoId: 97 });
    assert.equal(status, 400);
    assert.equal(json.errores.clienteId, 'El cliente elegido no existe');
    assert.equal(json.errores.origenId, 'El origen elegido no existe');
    assert.equal(json.errores.destinoId, 'El destino elegido no existe');
  });

  test('origen igual al destino: 400', async () => {
    const { status, json } = await crear({ destinoId: 1 });
    assert.equal(status, 400);
    assert.ok(json.errores.destinoId);
  });
});

describe('snapshot de las unidades (CA9)', () => {
  test('cambiar los asientos o el tipo del vehículo después de crear NO cambia la descripción guardada', async () => {
    const { json } = await crear({ vehiculoIds: [1] });
    const id = json.presupuesto.id;

    const vehiculo = porId(db.vehiculos, 1);
    vehiculo.asientos = 24;
    vehiculo.tipoVehiculoId = 1;

    const detalle = await pedir('GET', `/presupuestos/${id}`);
    assert.equal(detalle.json.presupuesto.unidades[0].descripcion, 'Minibus de 17 pasajeros');

    // Un presupuesto nuevo con el mismo vehículo sí toma los datos actuales.
    const nuevo = await crear({ vehiculoIds: [1] });
    assert.equal(nuevo.json.presupuesto.unidades[0].descripcion, 'Colectivo de 24 pasajeros');
  });
});

describe('GET /presupuestos', () => {
  test('lista del más nuevo al más viejo, con los campos del listado', async () => {
    await crear({ clienteId: 1 });
    await crear({ clienteId: 2, conFactura: false, importeNeto: '1234.56' });

    const { status, json } = await pedir('GET', '/presupuestos');
    assert.equal(status, 200);
    assert.deepEqual(
      json.presupuestos.map((p) => p.cliente.nombre),
      ['Escuela Normal', 'Río Tercero SA']
    );
    const [primero] = json.presupuestos;
    assert.deepEqual(
      Object.keys(primero).sort(),
      [
        'alicuotaIva',
        'cliente',
        'conFactura',
        'creadoEn',
        'destino',
        'fechaEmision',
        'fechaServicio',
        'id',
        'importeNeto',
        'origen',
      ]
    );
    assert.equal(primero.importeNeto, '1234.56');
    assert.equal(primero.conFactura, false);
    assert.equal(primero.alicuotaIva, '10.50');
    assert.deepEqual(primero.origen, { id: 1, nombre: 'Río Tercero' });
    assert.deepEqual(primero.destino, { id: 2, nombre: 'Córdoba' });
  });

  for (const texto of ['rio', 'RÍO', '  Río   tercero ']) {
    test(`?cliente=${JSON.stringify(texto)} ignora mayúsculas y acentos`, async () => {
      await crear({ clienteId: 1 });
      await crear({ clienteId: 2 });
      const { json } = await pedir('GET', `/presupuestos?cliente=${encodeURIComponent(texto)}`);
      assert.deepEqual(
        json.presupuestos.map((p) => p.cliente.nombre),
        ['Río Tercero SA']
      );
    });
  }

  for (const query of ['cliente=rio&cliente=escuela', 'cliente[x]=rio']) {
    test(`?${query} (no es un string): se ignora y lista sin filtro, no 500`, async () => {
      await crear({ clienteId: 1 });
      await crear({ clienteId: 2 });
      const { status, json } = await pedir('GET', `/presupuestos?${query}`);
      assert.equal(status, 200);
      assert.equal(json.presupuestos.length, 2);
    });
  }

  test('sin presupuestos devuelve una lista vacía', async () => {
    const { status, json } = await pedir('GET', '/presupuestos');
    assert.equal(status, 200);
    assert.deepEqual(json.presupuestos, []);
  });
});

describe('GET /presupuestos/assets/firma/:nombre', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  // JPEG mínimo de mentira (solo el encabezado): el endpoint no lo interpreta.
  const JPEG_FALSO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  let directorio;

  before(() => {
    directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'firmas-'));
    fs.writeFileSync(path.join(directorio, 'firma-marina.jpg'), JPEG_FALSO);
    // firma-pedro.jpg no se crea a propósito: el archivo puede faltar en el servidor.
    fs.writeFileSync(path.join(directorio, 'secreto.txt'), 'no se sirve');
    process.env.FIRMAS_DIR = directorio;
  });

  after(() => {
    delete process.env.FIRMAS_DIR;
    fs.rmSync(directorio, { recursive: true, force: true });
  });

  async function pedirFirma(nombre, perfil = 'ENCARGADO') {
    const headers = perfil ? { Authorization: `Bearer ${generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil })}` } : {};
    const respuesta = await fetch(`${base}/presupuestos/assets/firma/${nombre}`, { headers });
    return { status: respuesta.status, tipo: respuesta.headers.get('content-type'), cuerpo: Buffer.from(await respuesta.arrayBuffer()) };
  }

  test('Administrador y Encargado reciben la imagen', async () => {
    for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
      const { status, tipo, cuerpo } = await pedirFirma('marina', perfil);
      assert.equal(status, 200);
      assert.equal(tipo, 'image/jpeg');
      assert.deepEqual(cuerpo, JPEG_FALSO);
    }
  });

  test('CHOFER y PERSONAL_TALLER: 403; sin token: 401', async () => {
    assert.equal((await pedirFirma('marina', 'CHOFER')).status, 403);
    assert.equal((await pedirFirma('marina', 'PERSONAL_TALLER')).status, 403);
    assert.equal((await pedirFirma('marina', null)).status, 401);
  });

  for (const nombre of ['juan', 'firma-marina.jpg', 'MARINA', 'secreto.txt', '..%2Fsecreto.txt', '..%2F..%2F.env', 'constructor', '__proto__']) {
    test(`nombre fuera de la whitelist (${nombre}): 404`, async () => {
      const { status, cuerpo } = await pedirFirma(nombre);
      assert.equal(status, 404);
      assert.ok(!cuerpo.toString().includes('no se sirve'));
    });
  }

  test('nombre permitido pero sin archivo en el servidor: 404, no 500', async () => {
    assert.equal((await pedirFirma('pedro')).status, 404);
  });

  // Secret Files de Render: firma-<nombre>.jpg.b64 con el JPG en base64.
  describe('firma en base64 (.jpg.b64)', () => {
    const { mock } = require('node:test');
    const JPEG_PEDRO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.from('firma de pedro')]);
    const escribir = (archivo, contenido) => fs.writeFileSync(path.join(directorio, archivo), contenido);
    let errores;

    beforeEach(() => {
      for (const archivo of ['firma-pedro.jpg', 'firma-pedro.jpg.b64']) {
        fs.rmSync(path.join(directorio, archivo), { force: true });
      }
      errores = mock.method(console, 'error', () => {});
    });

    after(() => mock.restoreAll());

    test('.b64 válido: 200 image/jpeg con los bytes decodificados (tolera espacios y saltos al final)', async () => {
      escribir('firma-pedro.jpg.b64', `  ${JPEG_PEDRO.toString('base64')}\r\n\n`);
      const { status, tipo, cuerpo } = await pedirFirma('pedro');
      assert.equal(status, 200);
      assert.equal(tipo, 'image/jpeg');
      assert.deepEqual(cuerpo, JPEG_PEDRO);
      assert.equal(errores.mock.callCount(), 0);
    });

    test('.b64 partido en varias líneas (como lo pega un editor): 200', async () => {
      const lineas = JPEG_PEDRO.toString('base64').match(/.{1,8}/g).join('\n');
      escribir('firma-pedro.jpg.b64', lineas);
      const { status, cuerpo } = await pedirFirma('pedro');
      assert.equal(status, 200);
      assert.deepEqual(cuerpo, JPEG_PEDRO);
    });

    for (const [descripcion, contenido] of [
      ['texto que no es base64', 'esto no es una imagen'],
      ['base64 de algo que no es un JPG', Buffer.from('%PDF-1.7 no soy un jpg').toString('base64')],
      ['base64 cortado al pegar', JPEG_PEDRO.toString('base64').slice(3)],
      ['vacío', '   \n'],
    ]) {
      test(`.b64 corrupto (${descripcion}): 404 y console.error`, async () => {
        escribir('firma-pedro.jpg.b64', contenido);
        const { status, cuerpo } = await pedirFirma('pedro');
        assert.equal(status, 404);
        assert.deepEqual(JSON.parse(cuerpo), { error: 'Firma no encontrada' });
        assert.equal(errores.mock.callCount(), 1);
        assert.match(errores.mock.calls[0].arguments[0], /firma-pedro\.jpg\.b64 no es un JPG válido/);
      });
    }

    test('si hay .b64 se usa ese, aunque también esté el .jpg', async () => {
      escribir('firma-pedro.jpg', JPEG_FALSO);
      escribir('firma-pedro.jpg.b64', JPEG_PEDRO.toString('base64'));
      assert.deepEqual((await pedirFirma('pedro')).cuerpo, JPEG_PEDRO);
    });

    test('un .b64 corrupto no cae al .jpg: 404 (el pegado roto tiene que notarse)', async () => {
      escribir('firma-pedro.jpg', JPEG_FALSO);
      escribir('firma-pedro.jpg.b64', 'roto');
      assert.equal((await pedirFirma('pedro')).status, 404);
    });

    test('sin .b64 usa el .jpg', async () => {
      escribir('firma-pedro.jpg', JPEG_PEDRO);
      const { status, cuerpo } = await pedirFirma('pedro');
      assert.equal(status, 200);
      assert.deepEqual(cuerpo, JPEG_PEDRO);
    });

    test('un .jpg que no es un JPG: 404 y console.error', async () => {
      escribir('firma-pedro.jpg', 'no soy una imagen');
      assert.equal((await pedirFirma('pedro')).status, 404);
      assert.equal(errores.mock.callCount(), 1);
    });
  });
});

describe('GET /presupuestos/:id', () => {
  test('inexistente o con id inválido: 404', async () => {
    assert.equal((await pedir('GET', '/presupuestos/999')).status, 404);
    assert.equal((await pedir('GET', '/presupuestos/abc')).status, 404);
    assert.equal((await pedir('GET', '/presupuestos/99999999999')).status, 404);
  });

  test('no hay PUT ni DELETE', async () => {
    const { json } = await crear();
    const id = json.presupuesto.id;
    assert.equal((await pedir('PUT', `/presupuestos/${id}`, { body: payloadValido() })).status, 404);
    assert.equal((await pedir('DELETE', `/presupuestos/${id}`)).status, 404);
    assert.equal(db.presupuestos.length, 1);
  });
});
