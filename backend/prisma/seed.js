const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  const {
    ADMIN_NOMBRE,
    ADMIN_APELLIDO,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
  } = process.env;

  if (!ADMIN_NOMBRE || !ADMIN_APELLIDO || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error(
      'Faltan variables de entorno del administrador inicial (ADMIN_NOMBRE, ADMIN_APELLIDO, ADMIN_USERNAME, ADMIN_PASSWORD).'
    );
  }

  const PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];
  for (const descripcion of PERFILES) {
    await prisma.perfil.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Perfiles listos: ${PERFILES.join(', ')}`);

  const ESTADOS_USUARIO = ['ACTIVO', 'INACTIVO'];
  for (const descripcion of ESTADOS_USUARIO) {
    await prisma.estadoUsuario.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Estados de usuario listos: ${ESTADOS_USUARIO.join(', ')}`);

  const perfilAdministrador = await prisma.perfil.findUnique({
    where: { descripcion: 'ADMINISTRADOR' },
  });
  const estadoActivo = await prisma.estadoUsuario.findUnique({
    where: { descripcion: 'ACTIVO' },
  });

  const personaAdmin = await prisma.persona.upsert({
    where: { id: 1 },
    update: {
      nombre: ADMIN_NOMBRE,
      apellido: ADMIN_APELLIDO,
      perfilId: perfilAdministrador.id,
      activo: true,
    },
    create: {
      nombre: ADMIN_NOMBRE,
      apellido: ADMIN_APELLIDO,
      perfilId: perfilAdministrador.id,
      activo: true,
    },
  });

  const contrasenaHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  const admin = await prisma.usuario.upsert({
    where: { nombreUsuario: ADMIN_USERNAME },
    update: {
      personaId: personaAdmin.id,
    },
    create: {
      nombreUsuario: ADMIN_USERNAME,
      contrasenaHash,
      personaId: personaAdmin.id,
      estadoUsuarioId: estadoActivo.id,
    },
  });

  console.log(`Administrador inicial listo: ${admin.nombreUsuario}`);

  // orden: de mayor a menor capacidad/tamaño real del vehículo, para que el
  // selector del frontend los muestre en ese orden sin ordenar alfabético.
  const TIPOS_VEHICULO = [
    { descripcion: 'Colectivo', orden: 1 },
    { descripcion: 'Minibus', orden: 2 },
    { descripcion: 'Trafic', orden: 3 },
    { descripcion: 'Utilitario', orden: 4 },
  ];
  for (const { descripcion, orden } of TIPOS_VEHICULO) {
    await prisma.tipoVehiculo.upsert({
      where: { descripcion },
      update: { orden },
      create: { descripcion, orden },
    });
  }

  console.log(`Tipos de vehículo listos: ${TIPOS_VEHICULO.map((t) => t.descripcion).join(', ')}`);

  const ESTADOS_VEHICULO = ['OPERATIVO', 'EN_TALLER', 'DADO_DE_BAJA'];
  for (const descripcion of ESTADOS_VEHICULO) {
    await prisma.estadoVehiculo.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Estados de vehículo listos: ${ESTADOS_VEHICULO.join(', ')}`);

  const ESTADOS_VIAJE = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
  for (const descripcion of ESTADOS_VIAJE) {
    await prisma.estadoViaje.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Estados de viaje listos: ${ESTADOS_VIAJE.join(', ')}`);

  // MANTENIMIENTO: la lectura que crea un service o un arreglo cuando su km
  // supera al odómetro del vehículo (mantenimientoService).
  const ORIGENES_LECTURA = [
    'ALTA_VEHICULO',
    'INICIO_VIAJE',
    'FIN_VIAJE',
    'MANUAL',
    'CORRECCION',
    'MANTENIMIENTO',
  ];
  for (const descripcion of ORIGENES_LECTURA) {
    await prisma.origenLectura.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Orígenes de lectura listos: ${ORIGENES_LECTURA.join(', ')}`);

  // Reusado tal cual para el pago al cliente y el pago al chofer.
  const ESTADOS_PAGO = ['PENDIENTE', 'PAGADO', 'PARCIAL'];
  for (const descripcion of ESTADOS_PAGO) {
    await prisma.estadoPago.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Estados de pago listos: ${ESTADOS_PAGO.join(', ')}`);

  const METODOS_PAGO = ['EFECTIVO', 'BANCO', 'CHEQUE'];
  for (const descripcion of METODOS_PAGO) {
    await prisma.metodoPago.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Métodos de pago listos: ${METODOS_PAGO.join(', ')}`);

  const CATEGORIAS_DOCUMENTO = ['VEHICULO', 'CHOFER'];
  for (const descripcion of CATEGORIAS_DOCUMENTO) {
    await prisma.categoriaDocumento.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Categorías de documento listas: ${CATEGORIAS_DOCUMENTO.join(', ')}`);

  // descripcion es el código; la etiqueta visible vive en
  // frontend/src/constants/tiposDocumento.js. diasAviso: días de anticipación
  // con los que un documento vigente pasa a "Por vencer" (5 para el pago del
  // seguro, que es mensual; 30 para el resto).
  const TIPOS_DOCUMENTO = [
    { descripcion: 'POLIZA_SEGURO', categoria: 'VEHICULO', requiereVencimiento: true, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'CERT_COBERTURA', categoria: 'VEHICULO', requiereVencimiento: true, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'PAGO_SEGURO', categoria: 'VEHICULO', requiereVencimiento: true, requiereArchivo: true, diasAviso: 5 },
    { descripcion: 'ITV', categoria: 'VEHICULO', requiereVencimiento: true, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'MATAFUEGOS', categoria: 'VEHICULO', requiereVencimiento: true, requiereArchivo: false, diasAviso: 30 },
    { descripcion: 'TITULO_VEHICULO', categoria: 'VEHICULO', requiereVencimiento: false, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'CEDULA_IDENTIFICACION', categoria: 'VEHICULO', requiereVencimiento: false, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'ALTA_TRANSPORTE', categoria: 'VEHICULO', requiereVencimiento: false, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'LICENCIA_CONDUCIR', categoria: 'CHOFER', requiereVencimiento: true, requiereArchivo: true, diasAviso: 30 },
    { descripcion: 'DNI_CHOFER', categoria: 'CHOFER', requiereVencimiento: true, requiereArchivo: true, diasAviso: 30 },
  ];

  for (const { descripcion, categoria, ...datos } of TIPOS_DOCUMENTO) {
    const categoriaDocumento = await prisma.categoriaDocumento.findUnique({
      where: { descripcion: categoria },
    });
    await prisma.tipoDocumento.upsert({
      where: { descripcion },
      update: { categoriaDocumentoId: categoriaDocumento.id, ...datos },
      create: { descripcion, categoriaDocumentoId: categoriaDocumento.id, ...datos },
    });
  }

  console.log(`Tipos de documento listos: ${TIPOS_DOCUMENTO.length} tipos`);

  // porcentajeAviso: el estado pasa a "Próximo" al 95 % del intervalo
  // (ver calcularEstadoService en src/utils/estadoService.js).
  const PLANTILLAS_MANTENIMIENTO = [
    { tipoVehiculo: 'Colectivo', intervaloKm: 20000, porcentajeAviso: 95, nombre: 'Service Colectivo (Cada 20.000 km)' },
    { tipoVehiculo: 'Minibus', intervaloKm: 20000, porcentajeAviso: 95, nombre: 'Service Minibús (Cada 20.000 km)' },
    { tipoVehiculo: 'Trafic', intervaloKm: 15000, porcentajeAviso: 95, nombre: 'Service Trafic (Cada 15.000 km)' },
    { tipoVehiculo: 'Utilitario', intervaloKm: 10000, porcentajeAviso: 95, nombre: 'Service Utilitario (Cada 10.000 km)' },
  ];

  for (const p of PLANTILLAS_MANTENIMIENTO) {
    const tipo = await prisma.tipoVehiculo.findUnique({
      where: { descripcion: p.tipoVehiculo },
    });
    if (tipo) {
      await prisma.plantillaMantenimiento.upsert({
        where: { tipoVehiculoId: tipo.id },
        update: { nombre: p.nombre, intervaloKm: p.intervaloKm, porcentajeAviso: p.porcentajeAviso },
        create: {
          nombre: p.nombre,
          tipoVehiculoId: tipo.id,
          intervaloKm: p.intervaloKm,
          porcentajeAviso: p.porcentajeAviso,
        },
      });
    }
  }

  console.log(`Plantillas de mantenimiento listas: ${PLANTILLAS_MANTENIMIENTO.length} plantillas`);

  // Trabajos que no son el service: no generan alertas ni reinician el conteo.
  // La migración 20261023180000_arreglos_y_service ya los inserta; el upsert
  // por nombre mantiene el seed idempotente.
  const TIPOS_ARREGLO = [
    { nombre: 'Engrase', descripcion: 'Engrase de rodamientos y articulaciones de las ruedas', requiereDetalle: false },
    { nombre: 'Rotación de cubiertas', descripcion: 'Rotación de neumáticos. Se recomienda cada 10.000 km, pero no genera alerta', requiereDetalle: false },
    { nombre: 'Cambio de cubiertas', descripcion: 'Reemplazo de uno o más neumáticos', requiereDetalle: false },
    { nombre: 'Frenos', descripcion: 'Pastillas, discos, cintas o líquido de frenos', requiereDetalle: false },
    { nombre: 'Batería y electricidad', descripcion: 'Batería, alternador, luces y sistema eléctrico', requiereDetalle: false },
    { nombre: 'Chapa y pintura', descripcion: 'Trabajos de chapista', requiereDetalle: false },
    { nombre: 'Mecánica general', descripcion: 'Reparaciones de motor, caja, tren delantero, etc.', requiereDetalle: false },
    { nombre: 'Otro', descripcion: 'Cualquier trabajo que no entra en los anteriores', requiereDetalle: true },
  ];

  for (const [indice, { nombre, ...datos }] of TIPOS_ARREGLO.entries()) {
    await prisma.tipoArreglo.upsert({
      where: { nombre },
      update: { ...datos, orden: indice + 1 },
      create: { nombre, ...datos, orden: indice + 1 },
    });
  }

  console.log(`Tipos de arreglo listos: ${TIPOS_ARREGLO.length} tipos`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
