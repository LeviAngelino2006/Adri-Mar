// Precarga (one-off, idempotente) de clientes: crea los de LISTA que todavía no
// existan en la tabla clientes.
//
// Uso (desde backend/):
//   node prisma/precargarClientes.js              -> dry-run (por defecto)
//   node prisma/precargarClientes.js --dry-run    -> dry-run
//   node prisma/precargarClientes.js --apply      -> escribe en la base
//
// El dry-run solo LEE (un findMany): imprime qué se crearía y qué ya existe, y
// no llama a ningún método de escritura ni a buscarOCrear. Escribir exige
// --apply explícito.
//
// A diferencia de las ubicaciones, el nombre de un cliente NO se formatea: se
// guarda tal cual se escribe (solo con trim), así que el nombre guardado tiene
// que ser exactamente el de la lista ("AGD", "IPET 266", "Éxodo").
//
// Qué cuenta como "ya existe": se compara por nombreNormalizado (minúscula, sin
// acentos y con espacios colapsados), igual que buscarOCrear. Por eso "Exodo" o
// "CLUB CASINO" en la base cuentan como existentes para "Éxodo" y "Club Casino"
// de la lista. Esa fila NO se modifica: si su nombre guardado difiere del de la
// lista, se informa como advertencia para que se corrija a mano si hace falta.
//
// Con --apply cada cliente nuevo se crea con clienteService.buscarOCrear (que
// calcula nombreNormalizado y es idempotente), sin duplicar su lógica. Después
// de crearlo se verifica que el nombre devuelto sea idéntico al de la lista; si
// no lo es, se informa como advertencia. Un error en un cliente se informa y no
// frena a los demás.
//
// Si la lista tiene un nombre vacío o dos nombres con el mismo nombreNormalizado
// ("AGD" y "agd"), se aborta antes de leer o escribir nada en la base.
//
// Idempotente: una segunda corrida encuentra todo existente y no crea nada.

const { normalizarNombre } = require('../src/utils/normalizarNombre');

// Lista revisada y aprobada, en este orden. No cambiar nombres.
const LISTA = [
  'Club Acción Juvenil',
  'Club San Lorenzo',
  'Club Independiente Dolores',
  'Club Vecinos Unidos',
  'Marín',
  'Hidrogrubert',
  'Éxodo',
  'IPET 266',
  'Ascanelli',
  'Club Casino',
  'AGD',
  'Cotagro',
  'Bio 4',
];

class ListaInvalidaError extends Error {
  constructor(problemas) {
    super('La lista de clientes no es válida');
    this.problemas = problemas;
  }
}

// Arma el plan a partir de la lista y de las filas actuales. Función pura: no
// toca la base.
//   lista:      [nombre, ...]
//   existentes: [{ nombre, nombreNormalizado }]
// Devuelve:
//   crear:      [{ nombre, nombreNormalizado }]  (no existen todavía; nombre es
//               el de la lista con trim, que es lo que se guardaría)
//   existentes: [{ nombre, nombreNormalizado, nombreGuardado, advertencia }]
//               advertencia = true si el nombre guardado difiere del de la lista
// Lanza ListaInvalidaError si la lista tiene un nombre vacío o dos nombres con
// el mismo nombreNormalizado (en ese caso no se debe escribir nada).
function planificar(lista, existentes) {
  const problemas = [];
  const vistos = new Map();
  const items = [];

  for (const [indice, original] of lista.entries()) {
    const nombre = (original || '').trim();
    if (!nombre) {
      problemas.push(`El nombre #${indice + 1} está vacío`);
      continue;
    }
    const nombreNormalizado = normalizarNombre(nombre);
    if (vistos.has(nombreNormalizado)) {
      problemas.push(`"${vistos.get(nombreNormalizado)}" y "${nombre}" tienen el mismo nombre normalizado ("${nombreNormalizado}")`);
      continue;
    }
    vistos.set(nombreNormalizado, nombre);
    items.push({ nombre, nombreNormalizado });
  }

  if (problemas.length > 0) {
    throw new ListaInvalidaError(problemas);
  }

  const porClave = new Map(existentes.map((e) => [e.nombreNormalizado, e]));

  const crear = [];
  const yaExisten = [];

  for (const item of items) {
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

  return { crear, existentes: yaExisten };
}

function imprimirPlan(plan, totalLista, totalBase) {
  console.log(`Clientes en la lista: ${totalLista}`);
  console.log(`Clientes en la base: ${totalBase}`);

  console.log(`\nSe crearían (${plan.crear.length}):`);
  for (const c of plan.crear) {
    console.log(`  "${c.nombre}"`);
  }

  console.log(`\nYa existen (${plan.existentes.length}):`);
  for (const e of plan.existentes) {
    console.log(`  "${e.nombre}"  (guardado como "${e.nombreGuardado}")`);
  }

  const advertencias = plan.existentes.filter((e) => e.advertencia);
  if (advertencias.length > 0) {
    console.log('\nADVERTENCIAS:');
    for (const e of advertencias) {
      console.log(`  La lista dice "${e.nombre}" pero la base tiene "${e.nombreGuardado}". No se modifica.`);
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

    const existentes = await prisma.cliente.findMany({
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

    const clienteService = require('../src/services/clienteService');
    const advertencias = plan.existentes
      .filter((e) => e.advertencia)
      .map((e) => `La lista dice "${e.nombre}" pero la base tiene "${e.nombreGuardado}". No se modifica.`);
    const errores = [];
    let creados = 0;
    for (const item of plan.crear) {
      try {
        const cliente = await clienteService.buscarOCrear({ nombre: item.nombre });
        creados += 1;
        if (cliente.nombre !== item.nombre) {
          advertencias.push(`La lista dice "${item.nombre}" pero se guardó como "${cliente.nombre}".`);
        }
      } catch (err) {
        errores.push({ nombre: item.nombre, mensaje: err.message });
      }
    }

    console.log('\nResumen:');
    console.log(`  Creados: ${creados}`);
    console.log(`  Ya existían: ${plan.existentes.length}`);
    for (const e of plan.existentes) {
      console.log(`    "${e.nombre}"  (guardado como "${e.nombreGuardado}")`);
    }
    console.log(`  Advertencias: ${advertencias.length}`);
    for (const a of advertencias) {
      console.log(`    ${a}`);
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
