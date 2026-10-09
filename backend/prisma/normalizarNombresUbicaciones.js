// Migración de datos (one-off, idempotente): pasa los nombres de las
// ubicaciones existentes al formato de título (normalizarNombreUbicacion:
// "RIO TERCERO" y "rio tercero" -> "Rio Tercero") y fusiona las que, con ese
// formato, quedarían con el mismo nombre.
//
// Uso (desde backend/):
//   node prisma/normalizarNombresUbicaciones.js              -> dry-run (por defecto)
//   node prisma/normalizarNombresUbicaciones.js --dry-run    -> dry-run
//   node prisma/normalizarNombresUbicaciones.js --apply      -> escribe en la base
//
// El dry-run solo LEE: imprime qué cambiaría y no llama a ningún método de
// escritura. Escribir exige --apply explícito.
//
// Sobre el índice único: ubicaciones tiene un único sobre nombre_normalizado
// (el nombre plegado a minúsculas, sin acentos y con espacios colapsados). El
// formato de título no cambia ese valor, así que dos filas que hoy conviven no
// pueden colisionar al renombrarse; y dos filas con el mismo nombre plegado ya
// no pueden existir (el índice lo impide). La fusión queda como red de
// seguridad por si el índice no estuviera aplicado en alguna base. Al aplicar
// se borran primero las filas absorbidas (después de reasignar sus viajes) y
// recién después se actualiza la que se conserva, para no chocar con el índice.
//
// Idempotente: una segunda corrida no encuentra nada para cambiar.

const { normalizarNombre } = require('../src/utils/normalizarNombre');
const { normalizarNombreUbicacion } = require('../src/utils/normalizarNombreUbicacion');

// Arma el plan de cambios a partir de las filas actuales. Función pura: no toca
// la base.
//   ubicaciones: [{ id, nombre, nombreNormalizado, viajes }]  (viajes = origen + destino)
// Devuelve:
//   renombres: [{ id, de, a, nombreNormalizado }]   (nombreNormalizado solo si cambia)
//   fusiones:  [{ conservar: { id, nombre, nuevoNombre }, absorber: [{ id, nombre, viajes }] }]
//   sinCambios: cantidad de filas que no necesitan nada
function planificar(ubicaciones) {
  const porClave = new Map();
  for (const u of [...ubicaciones].sort((a, b) => a.id - b.id)) {
    const nuevoNombre = normalizarNombreUbicacion(u.nombre);
    const clave = normalizarNombre(nuevoNombre);
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push({ ...u, nuevoNombre, clave });
  }

  const renombres = [];
  const fusiones = [];
  let sinCambios = 0;

  for (const [clave, grupo] of porClave) {
    // Se conserva la más antigua (menor id), que es la que ya referencian los
    // viajes más viejos y la que más probablemente tenga el nombre "original".
    const [conservada, ...absorbidas] = grupo;

    if (absorbidas.length > 0) {
      fusiones.push({
        conservar: { id: conservada.id, nombre: conservada.nombre, nuevoNombre: conservada.nuevoNombre },
        absorber: absorbidas.map((a) => ({ id: a.id, nombre: a.nombre, viajes: a.viajes })),
      });
    }

    const cambiaNombre = conservada.nombre !== conservada.nuevoNombre;
    const cambiaClave = conservada.nombreNormalizado !== clave;
    if (cambiaNombre || cambiaClave) {
      renombres.push({
        id: conservada.id,
        de: conservada.nombre,
        a: conservada.nuevoNombre,
        ...(cambiaClave ? { nombreNormalizado: clave } : {}),
      });
    } else if (absorbidas.length === 0) {
      sinCambios += 1;
    }
  }

  return { renombres, fusiones, sinCambios };
}

// Aplica el plan con un cliente transaccional (tx). Orden: reasignar viajes,
// borrar las absorbidas y por último renombrar (ver nota del índice arriba).
async function aplicarPlan(tx, plan) {
  for (const { conservar, absorber } of plan.fusiones) {
    for (const { id } of absorber) {
      await tx.viaje.updateMany({ where: { origenId: id }, data: { origenId: conservar.id } });
      await tx.viaje.updateMany({ where: { destinoId: id }, data: { destinoId: conservar.id } });
      await tx.ubicacion.delete({ where: { id } });
    }
  }

  for (const { id, a, nombreNormalizado } of plan.renombres) {
    await tx.ubicacion.update({
      where: { id },
      data: { nombre: a, ...(nombreNormalizado ? { nombreNormalizado } : {}) },
    });
  }
}

function imprimirPlan(plan, total) {
  console.log(`Ubicaciones en la base: ${total}`);
  console.log(`Sin cambios: ${plan.sinCambios}`);

  console.log(`\nRenombres (${plan.renombres.length}):`);
  for (const r of plan.renombres) {
    const extra = r.nombreNormalizado ? `  [nombre_normalizado -> "${r.nombreNormalizado}"]` : '';
    console.log(`  id=${r.id}  "${r.de}"  ->  "${r.a}"${extra}`);
  }

  console.log(`\nFusiones (${plan.fusiones.length}):`);
  for (const f of plan.fusiones) {
    console.log(`  se conserva id=${f.conservar.id} "${f.conservar.nombre}" -> "${f.conservar.nuevoNombre}"`);
    for (const a of f.absorber) {
      console.log(`    se absorbe id=${a.id} "${a.nombre}" (${a.viajes} viajes se reasignan) y se borra`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run');
  if (apply && dryRun) {
    throw new Error('Usá --dry-run o --apply, no los dos.');
  }

  // Se crea acá y no al cargar el archivo: así los tests pueden importar
  // planificar/aplicarPlan sin un cliente de base de datos.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const filas = await prisma.ubicacion.findMany({
      select: {
        id: true,
        nombre: true,
        nombreNormalizado: true,
        _count: { select: { viajesOrigen: true, viajesDestino: true } },
      },
      orderBy: { id: 'asc' },
    });
    const ubicaciones = filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      nombreNormalizado: f.nombreNormalizado,
      viajes: f._count.viajesOrigen + f._count.viajesDestino,
    }));

    const plan = planificar(ubicaciones);
    console.log(apply ? 'MODO: --apply (escribe en la base)\n' : 'MODO: dry-run (solo lectura, no se modifica nada)\n');
    imprimirPlan(plan, ubicaciones.length);

    const hayCambios = plan.renombres.length > 0 || plan.fusiones.length > 0;
    if (!hayCambios) {
      console.log('\nNada para cambiar.');
      return;
    }
    if (!apply) {
      console.log('\nDry-run: no se escribió nada. Para aplicarlo, volvé a correr con --apply.');
      return;
    }

    await prisma.$transaction((tx) => aplicarPlan(tx, plan), { timeout: 60000 });
    console.log('\nListo: cambios aplicados en una sola transacción.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { planificar, aplicarPlan };
