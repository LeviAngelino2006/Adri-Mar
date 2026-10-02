const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Migración de datos (one-off): genera el historial retroactivo de
// LecturaOdometro a partir del estado actual de vehiculos y viajes, antes de
// que el odómetro pase a vivir exclusivamente en esa tabla. Pensado para
// correrse una sola vez; es seguro re-ejecutarlo (salta lo que ya existe).
async function main() {
  const admin = await prisma.usuario.findFirst({
    where: { perfil: { descripcion: 'ADMINISTRADOR' } },
    orderBy: { creadoEn: 'asc' },
  });
  if (!admin) {
    throw new Error('No hay ningún usuario ADMINISTRADOR en la base; no se puede atribuir la migración.');
  }
  console.log(`Usuario ADMINISTRADOR usado para atribución: id=${admin.id}, email=${admin.email}, usuario=${admin.nombreUsuario}`);

  const origenAltaVehiculo = await prisma.origenLectura.findUnique({ where: { descripcion: 'ALTA_VEHICULO' } });
  const origenFinViaje = await prisma.origenLectura.findUnique({ where: { descripcion: 'FIN_VIAJE' } });

  let creadasAlta = 0;
  let saltadasAlta = 0;
  let creadasFin = 0;
  let saltadasFin = 0;

  await prisma.$transaction(async (tx) => {
    // --- ALTA_VEHICULO: una por cada vehiculo existente ---
    // Si el vehiculo ya tiene viajes Finalizado con odometroInicial registrado
    // (de antes de esta migración), usamos el odometroInicial del más antiguo
    // de esos viajes (por fechaInicio) como valorKm, en vez del kilometraje
    // actual: el kilometraje actual puede ser posterior a viajes ya
    // finalizados, y fechar esa lectura en creadoEn del vehiculo rompería el
    // orden cronológico (ver violación detectada en el vehículo 9 en la
    // primera corrida de esta migración). Si no hay ningún viaje así, se
    // sigue usando el kilometraje actual, como antes.
    const vehiculos = await tx.vehiculo.findMany();
    for (const vehiculo of vehiculos) {
      const yaExiste = await tx.lecturaOdometro.findFirst({
        where: { vehiculoId: vehiculo.id, origenId: origenAltaVehiculo.id },
      });
      if (yaExiste) {
        saltadasAlta += 1;
        continue;
      }

      const viajeFinalizadoMasAntiguoConOdometro = await tx.viaje.findFirst({
        where: {
          vehiculoId: vehiculo.id,
          estadoViaje: { descripcion: 'FINALIZADO' },
          odometroInicial: { not: null },
        },
        orderBy: { fechaInicio: 'asc' },
      });

      const valorKm = viajeFinalizadoMasAntiguoConOdometro
        ? viajeFinalizadoMasAntiguoConOdometro.odometroInicial
        : vehiculo.kilometraje;

      await tx.lecturaOdometro.create({
        data: {
          vehiculoId: vehiculo.id,
          valorKm,
          fechaHora: vehiculo.creadoEn,
          origenId: origenAltaVehiculo.id,
          usuarioId: admin.id,
        },
      });
      creadasAlta += 1;
    }

    // --- FIN_VIAJE retroactiva: una por cada viaje Finalizado con odometroFinal no nulo ---
    const viajesFinalizados = await tx.viaje.findMany({
      where: {
        estadoViaje: { descripcion: 'FINALIZADO' },
        odometroFinal: { not: null },
      },
    });

    for (const viaje of viajesFinalizados) {
      const yaExiste = await tx.lecturaOdometro.findFirst({
        where: { viajeId: viaje.id, origenId: origenFinViaje.id },
      });
      if (yaExiste) {
        saltadasFin += 1;
        continue;
      }

      await tx.lecturaOdometro.create({
        data: {
          vehiculoId: viaje.vehiculoId,
          valorKm: viaje.odometroFinal,
          fechaHora: viaje.actualizadoEn,
          origenId: origenFinViaje.id,
          viajeId: viaje.id,
          usuarioId: admin.id,
        },
      });
      creadasFin += 1;
    }
  });

  console.log(`\nLecturas ALTA_VEHICULO creadas: ${creadasAlta} (saltadas por ya existir: ${saltadasAlta})`);
  console.log(`Lecturas FIN_VIAJE creadas: ${creadasFin} (saltadas por ya existir: ${saltadasFin})`);

  // --- Verificación 1: orden cronológico no decreciente por vehiculo ---
  console.log('\n--- Verificación de integridad cronológica ---');
  const vehiculos = await prisma.vehiculo.findMany();
  let violacionesEncontradas = 0;

  for (const vehiculo of vehiculos) {
    const lecturas = await prisma.lecturaOdometro.findMany({
      where: { vehiculoId: vehiculo.id },
      orderBy: { fechaHora: 'asc' },
      include: { origen: true, viaje: { select: { id: true } } },
    });

    for (let i = 1; i < lecturas.length; i++) {
      const anterior = lecturas[i - 1];
      const actual = lecturas[i];
      if (actual.valorKm < anterior.valorKm) {
        violacionesEncontradas += 1;
        console.log(
          `  VIOLACIÓN en vehículo id=${vehiculo.id} (${vehiculo.dominio}): ` +
            `lectura ${anterior.id} [${anterior.origen.descripcion}${anterior.viaje ? ` viaje=${anterior.viaje.id}` : ''}] ` +
            `fechaHora=${anterior.fechaHora.toISOString()} valorKm=${anterior.valorKm}  ->  ` +
            `lectura ${actual.id} [${actual.origen.descripcion}${actual.viaje ? ` viaje=${actual.viaje.id}` : ''}] ` +
            `fechaHora=${actual.fechaHora.toISOString()} valorKm=${actual.valorKm}`
        );
      }
    }
  }

  if (violacionesEncontradas === 0) {
    console.log('  Sin violaciones: todas las lecturas quedaron en orden cronológico no decreciente por vehículo.');
  } else {
    console.log(`  Total de violaciones encontradas: ${violacionesEncontradas}`);
  }

  // --- Verificación 2: vehiculo.kilometraje vs lectura más reciente ---
  console.log('\n--- Verificación de vehiculo.kilometraje vs última lectura ---');
  let descalcesEncontrados = 0;

  for (const vehiculo of vehiculos) {
    const ultima = await prisma.lecturaOdometro.findFirst({
      where: { vehiculoId: vehiculo.id },
      orderBy: { fechaHora: 'desc' },
    });

    if (!ultima) {
      console.log(`  Vehículo id=${vehiculo.id} (${vehiculo.dominio}): sin lecturas (no debería pasar).`);
      continue;
    }

    if (ultima.valorKm !== vehiculo.kilometraje) {
      descalcesEncontrados += 1;
      console.log(
        `  DESCALCE en vehículo id=${vehiculo.id} (${vehiculo.dominio}): ` +
          `vehiculo.kilometraje=${vehiculo.kilometraje}, última lectura (id=${ultima.id}, fechaHora=${ultima.fechaHora.toISOString()})=${ultima.valorKm}`
      );
    }
  }

  if (descalcesEncontrados === 0) {
    console.log('  Sin descalces: vehiculo.kilometraje coincide con la lectura más reciente en todos los vehículos.');
  } else {
    console.log(`  Total de descalces encontrados: ${descalcesEncontrados}`);
  }
}

main()
  .catch((err) => {
    console.error('Error en la migración de datos:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
