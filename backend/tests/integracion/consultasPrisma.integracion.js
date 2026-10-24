// Test de integración: corre las consultas REALES de Prisma contra un Postgres
// migrado. Los tests de tests/*.test.js usan un doble de Prisma en memoria, que
// no valida los select/include contra el schema: así pasó a producción el 500 de
// Documentación, Presupuestos y Mantenimiento cuando nombre y apellido se
// mudaron de Usuario a Persona. Acá cada endpoint de listado, ficha y alta de
// esos módulos (más Viajes, Flota y Personal) pega contra la base de verdad.
//
// No valida el contenido de las respuestas: alcanza con que no exploten. Si
// Prisma tira un error, el endpoint responde 500, el test falla y el error de
// Prisma queda en la salida (el handler de app.js lo loguea).
//
// Siembra la base con prisma/seed.js (catálogos y el administrador) y datos
// mínimos propios, así que necesita una base DESCARTABLE: se niega a correr si
// DATABASE_URL no apunta a localhost. No lee el .env.
//
//   DATABASE_URL=postgresql://...@localhost:5432/base_descartable npx prisma migrate deploy
//   DATABASE_URL=postgresql://...@localhost:5432/base_descartable npm run test:integracion
//
// En el CI corre en el job de migraciones, contra la base que acaba de migrar.

const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]'];
function exigirBaseLocal(url) {
  if (!url) {
    throw new Error('Definí DATABASE_URL apuntando a un Postgres local descartable y ya migrado.');
  }
  const { hostname } = new URL(url);
  if (!HOSTS_LOCALES.includes(hostname)) {
    throw new Error(`DATABASE_URL apunta a "${hostname}": este test siembra datos y solo corre contra una base local.`);
  }
}
exigirBaseLocal(process.env.DATABASE_URL);

process.env.JWT_SECRET = 'secreto-solo-para-integracion';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BACKEND = path.join(__dirname, '..', '..');
const SRC = path.join(BACKEND, 'src');

const app = require(path.join(SRC, 'app.js'));
const prisma = require(path.join(SRC, 'services', 'prismaClient.js'));
const { normalizarNombre } = require(path.join(SRC, 'utils', 'normalizarNombre.js'));

const ADMIN = { nombreUsuario: 'admin-integracion', contrasena: 'clave-solo-para-integracion' };

// Sufijo para los campos únicos: permite correrlo más de una vez sobre la misma
// base local sin chocar con lo sembrado antes.
const SUFIJO = Date.now().toString(36);

const DIA_MS = 24 * 60 * 60 * 1000;
const diaCordoba = (offsetDias = 0) =>
  new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDias * DIA_MS).toISOString().slice(0, 10);
const HOY = diaCordoba();

let servidor;
let base;
let token;
// Ids de lo sembrado, para armar las rutas de las fichas.
const ids = {};

function sembrarCatalogos() {
  execFileSync(process.execPath, [path.join(BACKEND, 'prisma', 'seed.js')], {
    cwd: BACKEND,
    stdio: 'inherit',
    env: {
      ...process.env,
      ADMIN_NOMBRE: 'Admin',
      ADMIN_APELLIDO: 'Integración',
      ADMIN_USERNAME: ADMIN.nombreUsuario,
      ADMIN_PASSWORD: ADMIN.contrasena,
    },
  });
}

// Lo mínimo para que cada listado y ficha tenga al menos una fila que
// serializar: un vehículo con plan, un chofer, viajes, documentos de los dos
// titulares, un presupuesto y un service y un arreglo.
async function sembrarDatos() {
  const admin = await prisma.usuario.findUnique({ where: { nombreUsuario: ADMIN.nombreUsuario } });
  const perfilChofer = await prisma.perfil.findUnique({ where: { descripcion: 'CHOFER' } });
  const colectivo = await prisma.tipoVehiculo.findUnique({ where: { descripcion: 'Colectivo' }, include: { plantilla: true } });
  const operativo = await prisma.estadoVehiculo.findUnique({ where: { descripcion: 'OPERATIVO' } });
  const estado = async (descripcion) => (await prisma.estadoViaje.findUnique({ where: { descripcion } })).id;
  const tipoDocumento = async (descripcion) => (await prisma.tipoDocumento.findUnique({ where: { descripcion } })).id;
  const tipoArreglo = await prisma.tipoArreglo.findFirst({ where: { requiereDetalle: false }, orderBy: { orden: 'asc' } });

  const marca = await prisma.marca.create({ data: { nombre: `Marca ${SUFIJO}`, nombreNormalizado: `marca ${SUFIJO}` } });
  const modelo = await prisma.modelo.create({
    data: { nombre: `Modelo ${SUFIJO}`, nombreNormalizado: `modelo ${SUFIJO}`, marcaId: marca.id },
  });
  const vehiculo = await prisma.vehiculo.create({
    data: {
      dominio: `IT${SUFIJO}`.toUpperCase(),
      numeroInterno: '99',
      modeloId: modelo.id,
      anio: 2020,
      asientos: 45,
      kilometraje: 50000,
      estadoVehiculoId: operativo.id,
      tipoVehiculoId: colectivo.id,
    },
  });
  await prisma.planMantenimiento.create({
    data: { vehiculoId: vehiculo.id, plantillaMantenimientoId: colectivo.plantilla.id, kmUltimoService: 40000 },
  });

  const chofer = await prisma.persona.create({
    data: {
      nombre: 'Chofer',
      apellido: `Integración ${SUFIJO}`,
      dni: `IT-${SUFIJO}`,
      perfilId: perfilChofer.id,
      habilitadoParaConducir: true,
    },
  });

  const cliente = await prisma.cliente.create({ data: { nombre: `Cliente ${SUFIJO}`, nombreNormalizado: `cliente ${SUFIJO}` } });
  const origen = await prisma.ubicacion.create({ data: { nombre: `Origen ${SUFIJO}`, nombreNormalizado: `origen ${SUFIJO}` } });
  const destino = await prisma.ubicacion.create({ data: { nombre: `Destino ${SUFIJO}`, nombreNormalizado: `destino ${SUFIJO}` } });

  const programado = await prisma.viaje.create({
    data: {
      estadoViajeId: await estado('PROGRAMADO'),
      choferId: chofer.id,
      vehiculoId: vehiculo.id,
      fechaInicio: new Date(`${diaCordoba(2)}T08:00:00-03:00`),
      fechaFin: new Date(`${diaCordoba(2)}T18:00:00-03:00`),
      clienteId: cliente.id,
      origenId: origen.id,
      destinoId: destino.id,
      precio: '150000.00',
      paradas: { create: [{ ubicacionId: destino.id, orden: 1 }] },
    },
  });
  await prisma.viaje.create({
    data: {
      estadoViajeId: await estado('A_CONFIRMAR'),
      fechaInicio: new Date(`${diaCordoba(5)}T08:00:00-03:00`),
      fechaFin: new Date(`${diaCordoba(5)}T18:00:00-03:00`),
      clienteId: cliente.id,
      origenId: origen.id,
      destinoId: destino.id,
      choferesCandidatos: { create: [{ personaId: chofer.id }] },
      vehiculosCandidatos: { create: [{ vehiculoId: vehiculo.id }] },
    },
  });
  await prisma.viaje.create({
    data: {
      estadoViajeId: await estado('FINALIZADO'),
      choferId: chofer.id,
      vehiculoId: vehiculo.id,
      fechaInicio: new Date(`${diaCordoba(-3)}T08:00:00-03:00`),
      fechaFin: new Date(`${diaCordoba(-3)}T18:00:00-03:00`),
      odometroInicial: 49000,
      odometroFinal: 50000,
      clienteId: cliente.id,
      origenId: origen.id,
      destinoId: destino.id,
    },
  });

  const matafuegos = await tipoDocumento('MATAFUEGOS');
  const licencia = await tipoDocumento('LICENCIA_CONDUCIR');
  await prisma.documento.create({
    data: {
      tipoDocumentoId: matafuegos,
      vehiculoId: vehiculo.id,
      fechaVencimiento: new Date(`${diaCordoba(10)}T00:00:00Z`),
      usuarioId: admin.id,
    },
  });
  // El archivo no existe en Storage: alcanza con la fila para la carpeta y el historial.
  await prisma.documento.create({
    data: {
      tipoDocumentoId: licencia,
      choferId: chofer.id,
      archivoPath: `choferes/${chofer.id}/LICENCIA_CONDUCIR_integracion.pdf`,
      nombreArchivo: 'licencia.pdf',
      fechaVencimiento: new Date(`${diaCordoba(200)}T00:00:00Z`),
      usuarioId: admin.id,
    },
  });

  const presupuesto = await prisma.presupuesto.create({
    data: {
      fechaEmision: new Date(`${HOY}T00:00:00Z`),
      clienteId: cliente.id,
      origenId: origen.id,
      destinoId: destino.id,
      fechaServicio: new Date(`${diaCordoba(20)}T00:00:00Z`),
      horaSalida: '07:30',
      cantidadPasajeros: 40,
      importeNeto: '420000.00',
      formaPago: 'EFECTIVO',
      diasValidez: 15,
      creadoPorId: admin.id,
      unidades: { create: [{ vehiculoId: vehiculo.id, descripcion: 'Colectivo 45 asientos', orden: 1 }] },
    },
  });

  await prisma.mantenimientoRealizado.create({
    data: {
      vehiculoId: vehiculo.id,
      esServicePreventivo: true,
      fecha: new Date(`${diaCordoba(-30)}T12:00:00Z`),
      kilometraje: 40000,
      usuarioId: admin.id,
    },
  });
  const nombreResponsable = `Taller de integración ${SUFIJO}`;
  const responsable = await prisma.responsableMantenimiento.create({
    data: { nombre: nombreResponsable, nombreNormalizado: normalizarNombre(nombreResponsable) },
  });
  await prisma.mantenimientoRealizado.create({
    data: {
      vehiculoId: vehiculo.id,
      fecha: new Date(`${diaCordoba(-10)}T12:00:00Z`),
      kilometraje: 45000,
      responsableId: responsable.id,
      usuarioId: admin.id,
      tiposArreglo: { create: [{ tipoArregloId: tipoArreglo.id }] },
    },
  });

  Object.assign(ids, {
    usuario: admin.id,
    persona: admin.personaId,
    vehiculo: vehiculo.id,
    modelo: modelo.id,
    marca: marca.id,
    tipoVehiculo: colectivo.id,
    chofer: chofer.id,
    cliente: cliente.id,
    origen: origen.id,
    destino: destino.id,
    viaje: programado.id,
    presupuesto: presupuesto.id,
    matafuegos,
    licencia,
    tipoArreglo: tipoArreglo.id,
    responsable: responsable.id,
  });
}

async function pedir(metodo, ruta, { body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let cuerpo;
  if (form) {
    cuerpo = new FormData();
    for (const [clave, valor] of Object.entries(form)) cuerpo.append(clave, String(valor));
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(body);
  }
  const res = await fetch(`${base}${ruta}`, { method: metodo, headers, body: cuerpo });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = texto;
  }
  return { status: res.status, json };
}

// El único criterio: el endpoint responde lo esperado (no un 500).
async function esperar(metodo, ruta, opciones = {}, estadoEsperado = 200) {
  const { status, json } = await pedir(metodo, ruta, opciones);
  assert.equal(status, estadoEsperado, `${metodo} ${ruta} respondió ${status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

// Un test por consulta, para que una que explota no tape a las demás. La ruta es
// una función porque los ids se conocen recién después de sembrar.
function probarGets(casos) {
  for (const [nombre, ruta] of casos) {
    test(nombre, async () => {
      await esperar('GET', ruta());
    });
  }
}

before(async () => {
  sembrarCatalogos();
  await sembrarDatos();
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  const login = await esperar('POST', '/auth/login', {
    body: { nombreUsuario: ADMIN.nombreUsuario, contrasena: ADMIN.contrasena },
  });
  token = login.token;
});

after(async () => {
  if (servidor) await new Promise((resolver) => servidor.close(resolver));
  await prisma.$disconnect();
});

describe('Documentación', () => {
  probarGets([
    ['tipos de documento', () => '/documentos/tipos'],
    ['estado de la flota', () => '/documentos/estado-flota'],
    ['estado de los choferes', () => '/documentos/estado-choferes'],
    ['alertas de vencimiento', () => '/documentos/alertas'],
    ['ficha de vehículo', () => `/documentos/vehiculos/${ids.vehiculo}`],
    ['historial de un tipo del vehículo', () => `/documentos/vehiculos/${ids.vehiculo}/tipos/${ids.matafuegos}/historial`],
    ['ficha de chofer', () => `/documentos/choferes/${ids.chofer}`],
    ['historial de un tipo del chofer', () => `/documentos/choferes/${ids.chofer}/tipos/${ids.licencia}/historial`],
  ]);

  // MATAFUEGOS no requiere archivo: se registra sin tocar Storage.
  test('registrar un documento de vehículo', async () => {
    await esperar(
      'POST',
      `/documentos/vehiculos/${ids.vehiculo}`,
      { form: { tipoDocumentoId: ids.matafuegos, fechaVencimiento: diaCordoba(60) } },
      201
    );
  });
});

describe('Presupuestos', () => {
  probarGets([
    ['listado', () => '/presupuestos'],
    ['listado con búsqueda por cliente', () => `/presupuestos?cliente=${encodeURIComponent(`Cliente ${SUFIJO}`)}`],
    ['ficha (la que usa el PDF)', () => `/presupuestos/${ids.presupuesto}`],
  ]);

  test('crear un presupuesto', async () => {
    await esperar(
      'POST',
      '/presupuestos',
      {
        body: {
          fechaEmision: HOY,
          clienteId: ids.cliente,
          origenId: ids.origen,
          destinoId: ids.destino,
          fechaServicio: diaCordoba(30),
          horaSalida: '08:00',
          cantidadPasajeros: 30,
          importeNeto: '300000',
          conFactura: true,
          formaPago: 'EFECTIVO',
          diasValidez: 15,
          vehiculoIds: [ids.vehiculo],
        },
      },
      201
    );
  });
});

describe('Mantenimiento', () => {
  probarGets([
    ['tipos de arreglo', () => '/mantenimientos/tipos-arreglo'],
    ['responsables', () => '/mantenimientos/responsables'],
    ['estado del service (pestaña Service)', () => '/mantenimientos/planes'],
    ['historial', () => '/mantenimientos/historial'],
    ['historial de services', () => '/mantenimientos/historial?tipo=SERVICE'],
    ['historial de arreglos (pestaña Arreglos)', () => '/mantenimientos/historial?tipo=ARREGLO'],
    ['historial de un vehículo', () => `/mantenimientos/historial?vehiculoId=${ids.vehiculo}`],
    ['advertencia de service para un viaje', () => `/mantenimientos/evaluar-viaje?vehiculoId=${ids.vehiculo}&kilometrosEstimados=500`],
  ]);

  test('registrar un service', async () => {
    await esperar('POST', '/mantenimientos/services', { body: { vehiculoId: ids.vehiculo, fecha: HOY, kilometraje: 50000 } }, 201);
  });

  test('registrar un arreglo', async () => {
    await esperar(
      'POST',
      '/mantenimientos/arreglos',
      {
        body: {
          vehiculoId: ids.vehiculo,
          fecha: HOY,
          kilometraje: 50000,
          tiposArregloIds: [ids.tipoArreglo],
          responsableId: ids.responsable,
        },
      },
      201
    );
  });

  test('asignar el plan de service', async () => {
    await esperar('POST', '/mantenimientos/planes', { body: { vehiculoId: ids.vehiculo, kmUltimoService: 50000 } }, 201);
  });
});

describe('Viajes', () => {
  probarGets([
    ['listado', () => '/viajes'],
    ['listado: Próximos', () => '/viajes?vista=proximos'],
    ['listado: Anteriores', () => '/viajes?vista=anteriores'],
    ['listado con búsqueda', () => `/viajes?q=${encodeURIComponent(`Cliente ${SUFIJO}`)}`],
    ['listado con administrativo pendiente', () => '/viajes?administrativoPendiente=true'],
    ['listado por chofer y vehículo', () => `/viajes?choferId=${ids.chofer}&vehiculoId=${ids.vehiculo}`],
    ['mis viajes', () => '/viajes/mis-viajes'],
    ['disponibilidad de un viaje', () => `/viajes/${ids.viaje}/disponibilidad`],
    ['estados de pago', () => '/estados-pago'],
    ['métodos de pago', () => '/metodos-pago'],
    ['clientes', () => '/clientes'],
    ['ubicaciones', () => '/ubicaciones'],
  ]);

  test('disponibilidad para un viaje nuevo', async () => {
    await esperar('POST', '/viajes/disponibilidad', {
      body: {
        fechaInicio: `${diaCordoba(2)}T09:00:00-03:00`,
        fechaFin: `${diaCordoba(2)}T12:00:00-03:00`,
        choferIds: [ids.chofer],
        vehiculoIds: [ids.vehiculo],
      },
    });
  });
});

describe('Flota', () => {
  probarGets([
    ['listado de vehículos', () => '/vehiculos'],
    ['ficha de vehículo', () => `/vehiculos/${ids.vehiculo}`],
    ['lecturas de odómetro', () => `/vehiculos/${ids.vehiculo}/lecturas-odometro`],
    ['tipos de vehículo', () => '/tipos-vehiculo'],
    ['marcas', () => '/marcas'],
    ['modelos de una marca', () => `/marcas/${ids.marca}/modelos`],
  ]);

  test('dar de alta un vehículo', async () => {
    await esperar(
      'POST',
      '/vehiculos',
      {
        body: {
          dominio: `AA${String(Date.now()).slice(-3)}ZZ`,
          numeroInterno: '100',
          modeloId: ids.modelo,
          anio: 2022,
          asientos: 19,
          kilometraje: 1000,
          tipoVehiculoId: ids.tipoVehiculo,
        },
      },
      201
    );
  });
});

describe('Personal y usuarios', () => {
  probarGets([
    ['sesión actual', () => '/auth/me'],
    ['listado de personas', () => '/personas'],
    ['ficha de persona', () => `/personas/${ids.persona}`],
    ['disponibles para conducir', () => '/personas/disponibles-chofer'],
    ['listado de usuarios', () => '/usuarios'],
    ['ficha de usuario', () => `/usuarios/${ids.usuario}`],
    ['usuarios disponibles para conducir', () => '/usuarios/disponibles-chofer'],
  ]);
});
