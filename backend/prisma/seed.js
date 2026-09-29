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

  const perfilAdministrador = await prisma.perfil.findUnique({
    where: { descripcion: 'ADMINISTRADOR' },
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
    },
  });

  console.log(`Administrador inicial listo: ${admin.nombreUsuario}`);

  const TIPOS_VEHICULO = ['Colectivo', 'Trafi'];
  for (const descripcion of TIPOS_VEHICULO) {
    await prisma.tipoVehiculo.upsert({
      where: { descripcion },
      update: {},
      create: { descripcion },
    });
  }

  console.log(`Tipos de vehículo listos: ${TIPOS_VEHICULO.join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
