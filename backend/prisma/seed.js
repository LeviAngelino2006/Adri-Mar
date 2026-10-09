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

  const contrasenaHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  const admin = await prisma.usuario.upsert({
    where: { nombreUsuario: ADMIN_USERNAME },
    update: {},
    create: {
      nombre: ADMIN_NOMBRE,
      apellido: ADMIN_APELLIDO,
      nombreUsuario: ADMIN_USERNAME,
      contrasenaHash,
      perfilId: perfilAdministrador.id,
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

  // MANTENIMIENTO no se usa todavía (queda previsto para el futuro módulo de
  // mantenimiento preventivo), pero se siembra ya para no necesitar otra
  // migración cuando llegue ese momento.
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

  const TIPOS_DOCUMENTO = [
    {
      codigo: 'POLIZA_SEGURO',
      descripcion: 'Póliza de seguro',
      aplicaA: 'VEHICULO',
      requiereVencimiento: true,
      requiereArchivo: true,
      orden: 1,
    },
    {
      codigo: 'CERT_COBERTURA',
      descripcion: 'Certificado de cobertura',
      aplicaA: 'VEHICULO',
      requiereVencimiento: true,
      requiereArchivo: true,
      orden: 2,
    },
    {
      codigo: 'PAGO_SEGURO',
      descripcion: 'Comprobante de pago de seguro',
      aplicaA: 'VEHICULO',
      requiereVencimiento: false,
      requiereArchivo: true,
      orden: 3,
    },
    {
      codigo: 'ITV',
      descripcion: 'Inspección Técnica Vehicular (ITV)',
      aplicaA: 'VEHICULO',
      requiereVencimiento: true,
      requiereArchivo: true,
      orden: 4,
    },
    {
      codigo: 'MATAFUEGOS',
      descripcion: 'Control de Matafuegos',
      aplicaA: 'VEHICULO',
      requiereVencimiento: true,
      requiereArchivo: false,
      orden: 5,
    },
    {
      codigo: 'TITULO_VEHICULO',
      descripcion: 'Título del automotor',
      aplicaA: 'VEHICULO',
      requiereVencimiento: false,
      requiereArchivo: true,
      orden: 6,
    },
    {
      codigo: 'CEDULA_IDENTIFICACION',
      descripcion: 'Cédula de identificación (Tarjeta Verde)',
      aplicaA: 'VEHICULO',
      requiereVencimiento: false,
      requiereArchivo: true,
      orden: 7,
    },
    {
      codigo: 'ALTA_TRANSPORTE',
      descripcion: 'Certificado de alta de transporte',
      aplicaA: 'VEHICULO',
      requiereVencimiento: false,
      requiereArchivo: true,
      orden: 8,
    },
    {
      codigo: 'LICENCIA_CONDUCIR',
      descripcion: 'Licencia de conducir profesional',
      aplicaA: 'CHOFER',
      requiereVencimiento: true,
      requiereArchivo: true,
      orden: 1,
    },
    {
      codigo: 'DNI_CHOFER',
      descripcion: 'Documento Nacional de Identidad (DNI)',
      aplicaA: 'CHOFER',
      requiereVencimiento: false,
      requiereArchivo: true,
      orden: 2,
    },
    {
      codigo: 'EXAMEN_PSICOFISICO',
      descripcion: 'Examen psicofísico / LINTI',
      aplicaA: 'CHOFER',
      requiereVencimiento: true,
      requiereArchivo: true,
      orden: 3,
    },
  ];

  for (const tipo of TIPOS_DOCUMENTO) {
    await prisma.tipoDocumento.upsert({
      where: { codigo: tipo.codigo },
      update: {
        descripcion: tipo.descripcion,
        aplicaA: tipo.aplicaA,
        requiereVencimiento: tipo.requiereVencimiento,
        requiereArchivo: tipo.requiereArchivo,
        orden: tipo.orden,
      },
      create: tipo,
    });
  }

  console.log(`Tipos de documento listos: ${TIPOS_DOCUMENTO.length} tipos`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
