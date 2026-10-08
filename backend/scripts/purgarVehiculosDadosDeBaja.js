/**
 * Script de limpieza puntual: elimina documentación residual de vehículos en
 * estado DADO_DE_BAJA que todavía tengan registros en documentos_vehiculo y
 * archivos en Supabase Storage.
 *
 * Ejecutar manualmente una sola vez:
 *   node scripts/purgarVehiculosDadosDeBaja.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../src/services/prismaClient');
const storageService = require('../src/services/storageService');

async function main() {
  // 1. Buscar todos los vehículos DADO_DE_BAJA con documentos pendientes
  const vehiculos = await prisma.vehiculo.findMany({
    where: {
      estadoVehiculo: { descripcion: 'DADO_DE_BAJA' },
      documentos: { some: {} }, // al menos un documento
    },
    include: {
      documentos: true,
      estadoVehiculo: true,
    },
  });

  if (vehiculos.length === 0) {
    console.log('✅ No se encontraron vehículos dados de baja con documentación residual.');
    return;
  }

  for (const v of vehiculos) {
    console.log(`\n🚌 Vehículo ID ${v.id} — ${v.dominio} (${v.estadoVehiculo.descripcion})`);
    console.log(`   ${v.documentos.length} documento(s) a purgar...`);

    for (const doc of v.documentos) {
      if (doc.archivoPath) {
        const ok = await storageService.eliminarArchivo(doc.archivoPath).catch(() => false);
        console.log(`   📄 doc #${doc.id}: ${doc.archivoPath} → Storage: ${ok ? 'eliminado' : 'error/no encontrado'}`);
      } else {
        console.log(`   📄 doc #${doc.id}: sin archivo en Storage`);
      }
    }

    await prisma.documentoVehiculo.deleteMany({
      where: { vehiculoId: v.id },
    });

    console.log(`   🗑️  Registros de DB eliminados.`);
  }

  console.log('\n✅ Limpieza completa.');
}

main()
  .catch((err) => {
    console.error('Error en purga:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
