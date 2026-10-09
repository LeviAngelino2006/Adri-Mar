// Precarga (one-off, idempotente) de ubicaciones: crea las de LISTA que todavía
// no existan en la tabla ubicaciones.
//
// Uso (desde backend/):
//   node prisma/precargarUbicaciones.js              -> dry-run (por defecto)
//   node prisma/precargarUbicaciones.js --dry-run    -> dry-run
//   node prisma/precargarUbicaciones.js --apply      -> escribe en la base
//
// El dry-run solo LEE (un findMany): imprime qué se crearía y qué ya existe, y
// no llama a ningún método de escritura ni a buscarOCrear. Escribir exige
// --apply explícito.
//
// Qué cuenta como "ya existe": se compara por nombreNormalizado (minúscula, sin
// acentos y con espacios colapsados), igual que buscarOCrear. Por eso "Rio
// Tercero" en la base cuenta como existente para "Río Tercero" de la lista. Esa
// fila NO se modifica: si su nombre guardado difiere del de la lista, se
// informa como advertencia para que se corrija a mano si hace falta.
//
// Con --apply cada ubicación nueva se crea con ubicacionService.buscarOCrear
// (que formatea el nombre, calcula nombreNormalizado y es idempotente), sin
// duplicar su lógica. Un error en una ubicación se informa y no frena a las
// demás.
//
// Si la lista tiene dos nombres con el mismo nombreNormalizado ("Córdoba" y
// "cordoba"), se aborta antes de leer o escribir nada en la base.
//
// Idempotente: una segunda corrida encuentra todo existente y no crea nada.

const { normalizarNombre } = require('../src/utils/normalizarNombre');
const { normalizarNombreUbicacion } = require('../src/utils/normalizarNombreUbicacion');

// Lista revisada y aprobada, en este orden. No cambiar nombres.
const LISTA = [
  'Río Tercero',
  'General Deheza',
  'Tancacha',
  'Río Cuarto',
  'Córdoba',
  'General Cabrera',
  'Villa María',
  'Hernando',
  'Aeropuerto de Córdoba',
  'Las Perdices',
  'Almafuerte',
  'Alcira Gigena',
  'Corralito',
  'Ticino',
  'Arroyo Cabral',
  'Dalmacio Vélez',
  'Embalse',
  'Las Higueras',
  'Coronel Moldes',
  'La Laguna',
  'Despeñaderos',
  'Berrotarán',
  'Vicuña Mackenna',
  'San Agustín',
  'Villa Nueva',
  'Adelia María',
  'Villa Carlos Paz',
  'Piedras Moras',
  'Pasco',
  'Villa Ascasubi',
  'Santa Rosa de Calamuchita',
  'Carnerillo',
  'Villa General Belgrano',
  'Elena',
  'La Carlota',
  'Santa Eufemia',
  'Villa del Dique',
  'Villa Rumipal',
  'Alta Gracia',
  'Oncativo',
  'Aeropuerto las Higueras',
];

class ListaInvalidaError extends Error {
  constructor(problemas) {
    super('La lista de ubicaciones no es válida');
    this.problemas = problemas;
  }
}

// Arma el plan a partir de la lista y de las filas actuales. Función pura: no
// toca la base.
//   lista:     [nombre, ...]
//   existentes: [{ nombre, nombreNormalizado }]
// Devuelve:
//   crear:      [{ nombre, nombreFormateado, nombreNormalizado }]  (no existen todavía)
//   existentes: [{ nombre, nombreNormalizado, nombreGuardado, advertencia }]
//               advertencia = true si el nombre guardado difiere del de la lista
//   formatos:   [{ nombre, nombreFormateado }]  (nombres de la lista que
//               buscarOCrear guardaría distinto; no debería haber ninguno)
// Lanza ListaInvalidaError si la lista tiene un nombre vacío o dos nombres con
// el mismo nombreNormalizado (en ese caso no se debe escribir nada).
function planificar(lista, existentes) {
  const problemas = [];
  const vistos = new Map();
  const items = [];

  for (const [indice, nombre] of lista.entries()) {
    const nombreFormateado = normalizarNombreUbicacion(nombre);
    if (!nombreFormateado) {
      problemas.push(`El nombre #${indice + 1} está vacío`);
      continue;
    }
    const nombreNormalizado = normalizarNombre(nombreFormateado);
    if (vistos.has(nombreNormalizado)) {
      problemas.push(`"${vistos.get(nombreNormalizado)}" y "${nombre}" tienen el mismo nombre normalizado ("${nombreNormalizado}")`);
      continue;
    }
    vistos.set(nombreNormalizado, nombre);
    items.push({ nombre, nombreFormateado, nombreNormalizado });
  }

  if (problemas.length > 0) {
    throw new ListaInvalidaError(problemas);
  }

  const porClave = new Map(existentes.map((e) => [e.nombreNormalizado, e]));

  const crear = [];
  const yaExisten = [];
  const formatos = [];

  for (const item of items) {
    if (item.nombreFormateado !== item.nombre) {
      formatos.push({ nombre: item.nombre, nombreFormateado: item.nombreFormateado });
    }

    const fila = porClave.get(item.nombreNormalizado);
    if (fila) {
      yaExisten.push({
        nombre: item.nombre,
        nombreNormalizado: item.nombreNormalizado,
        nombreGuardado: fila.nombre,
        advertencia: fila.nombre !== item.nombre,
      });
    } else {
      crear.push(item);
    }
  }

  return { crear, existentes: yaExisten, formatos };
}

function imprimirPlan(plan, totalLista, totalBase) {
  console.log(`Ubicaciones en la lista: ${totalLista}`);
  console.log(`Ubicaciones en la base: ${totalBase}`);

  console.log(`\nSe crearían (${plan.crear.length}):`);
  for (const c of plan.crear) {
    console.log(`  "${c.nombreFormateado}"`);
  }

  console.log(`\nYa existen (${plan.existentes.length}):`);
  for (const e of plan.existentes) {
    console.log(`  "${e.nombre}"  (guardada como "${e.nombreGuardado}")`);
  }

  const advertencias = plan.existentes.filter((e) => e.advertencia);
  if (advertencias.length > 0 || plan.formatos.length > 0) {
    console.log('\nADVERTENCIAS:');
    for (const e of advertencias) {
      console.log(`  La lista dice "${e.nombre}" pero la base tiene "${e.nombreGuardado}". No se modifica.`);
    }
    for (const f of plan.formatos) {
      console.log(`  La lista dice "${f.nombre}" pero se guardaría como "${f.nombreFormateado}".`);
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

  // Se cargan acá y no al importar el archivo: así los tests pueden importar
  // planificar sin un cliente de base de datos.
  const prisma = require('../src/services/prismaClient');

  try {
    // Valida la lista antes de tocar la base (lanza ListaInvalidaError).
    planificar(LISTA, []);

    const existentes = await prisma.ubicacion.findMany({
      select: { nombre: true, nombreNormalizado: true },
      orderBy: { id: 'asc' },
    });

    const plan = planificar(LISTA, existentes);
    console.log(apply ? 'MODO: --apply (escribe en la base)\n' : 'MODO: dry-run (solo lectura, no se modifica nada)\n');
    imprimirPlan(plan, LISTA.length, existentes.length);

    if (plan.crear.length === 0) {
      console.log('\nNada para crear.');
      return;
    }
    if (!apply) {
      console.log('\nDry-run: no se escribió nada. Para aplicarlo, volvé a correr con --apply.');
      return;
    }

    const ubicacionService = require('../src/services/ubicacionService');
    const errores = [];
    let creadas = 0;
    for (const item of plan.crear) {
      try {
        await ubicacionService.buscarOCrear({ nombre: item.nombre });
        creadas += 1;
      } catch (err) {
        errores.push({ nombre: item.nombre, mensaje: err.message });
      }
    }

    console.log('\nResumen:');
    console.log(`  Creadas: ${creadas}`);
    console.log(`  Ya existían: ${plan.existentes.length}`);
    for (const e of plan.existentes) {
      console.log(`    "${e.nombre}"  (guardada como "${e.nombreGuardado}")`);
    }
    console.log(`  Errores: ${errores.length}`);
    for (const e of errores) {
      console.log(`    "${e.nombre}": ${e.mensaje}`);
    }
    if (errores.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof ListaInvalidaError) {
      console.error('Lista inválida, no se escribió nada:');
      for (const p of err.problemas) console.error(`  - ${p}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

module.exports = { LISTA, planificar, ListaInvalidaError };
