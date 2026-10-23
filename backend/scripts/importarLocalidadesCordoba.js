// Importación (idempotente) de las localidades de la provincia de Córdoba desde
// la API Georef (datos.gob.ar) a la tabla ubicaciones, con sus coordenadas. NO
// es una migración: se corre a mano, una vez por base, después de aplicar la
// migración que agrega latitud, longitud y georef_id.
//
// Uso (desde backend/, con DATABASE_URL apuntando a la base que corresponda):
//   node scripts/importarLocalidadesCordoba.js              -> dry-run (por defecto)
//   node scripts/importarLocalidadesCordoba.js --dry-run    -> dry-run
//   node scripts/importarLocalidadesCordoba.js --aplicar    -> escribe en la base
//
// El dry-run solo LEE (la API y un findMany) e imprime el resumen; escribir
// exige --aplicar. Al aplicar, todo va en una sola transacción: o se aplica el
// plan entero o nada.
//
// Reglas (ver planificar):
//  - Coincidencia con las ubicaciones existentes por nombreNormalizado (igual
//    que buscarOCrear). Si la existente no tiene coordenadas, se le completan
//    con el centroide de Georef y su georefId, y si el nombre está escrito
//    distinto ("Cosquin"), se lo corrige al oficial ("Cosquín"). Si ya está
//    ubicada (coordenadas o lugar de Google), no se toca.
//  - Solo se miran las FRECUENTES: las particulares (casas de pasajeros
//    elegidas en Google) no tienen nombreNormalizado y nunca coinciden.
//  - Las que no coinciden con ninguna se crean.
//  - Georef lista a veces una "Entidad" con el mismo nombre y departamento que
//    su localidad (ej. "Córdoba" Entidad y "Córdoba" Componente, ambas en
//    Capital): son el mismo lugar y se importa una sola (la que no es Entidad).
//  - Homónimos de verdad (mismo nombre en distintos departamentos, ej. "La
//    Puerta" en Colón y en Río Primero): como nombreNormalizado es único, se
//    desambiguan con el departamento entre paréntesis: "La Puerta (Colón)". Sin
//    coma: la regla conContexto del link de Google Maps trata una coma como "ya
//    trae provincia". Una existente con el nombre pelado ("La Puerta") es
//    ambigua: no se toca y se lista para resolverla a mano.
//  - Idempotente: una localidad ya importada se reconoce por georefId (aunque
//    después le hayan cambiado el nombre); una segunda corrida no crea nada.

const { normalizarNombre } = require('../src/utils/normalizarNombre');

const URL_GEOREF = 'https://apis.datos.gob.ar/georef/api/localidades?provincia=cordoba&max=1000';
const CATEGORIA_ENTIDAD = 'Entidad';

class RespuestaGeorefInvalidaError extends Error {}

// Descarga las localidades y controla que vengan todas (sin paginar) y con lo
// que el plan necesita. fetchFn se inyecta para los tests.
async function obtenerLocalidades(fetchFn = globalThis.fetch) {
  const respuesta = await fetchFn(URL_GEOREF, { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) throw new RespuestaGeorefInvalidaError(`Georef respondió ${respuesta.status}`);
  const datos = await respuesta.json();

  const localidades = datos?.localidades;
  if (!Array.isArray(localidades) || localidades.length === 0) {
    throw new RespuestaGeorefInvalidaError('La respuesta de Georef no trae localidades');
  }
  if (Number.isInteger(datos.total) && datos.total > localidades.length) {
    throw new RespuestaGeorefInvalidaError(`Georef tiene ${datos.total} localidades y devolvió ${localidades.length}: subir max`);
  }
  const incompletas = localidades.filter(
    (l) => !l?.id || !l?.nombre?.trim() || !Number.isFinite(l?.centroide?.lat) || !Number.isFinite(l?.centroide?.lon) || !l?.departamento?.nombre
  );
  if (incompletas.length > 0) {
    throw new RespuestaGeorefInvalidaError(`${incompletas.length} localidades sin id, nombre, centroide o departamento`);
  }
  return localidades;
}

// La que se queda entre dos registros del mismo lugar: primero la que no es
// Entidad, después la de id más corto (la localidad, no su entidad) y menor.
const rankearDuplicado = (a, b) =>
  (a.categoria === CATEGORIA_ENTIDAD) - (b.categoria === CATEGORIA_ENTIDAD) ||
  a.id.length - b.id.length ||
  a.id.localeCompare(b.id);

function agruparPor(lista, clave) {
  const grupos = new Map();
  for (const item of lista) {
    const k = clave(item);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(item);
  }
  return grupos;
}

// Arma el plan. Función pura: no toca la base ni la red.
//   localidades: respuesta de Georef ([{ id, nombre, categoria, centroide, departamento, municipio }])
//   existentes:  [{ id, nombre, nombreNormalizado, latitud, longitud, georefId, placeId }] (solo frecuentes)
// Devuelve:
//   crear:          [{ georefId, nombre, nombreNormalizado, latitud, longitud, categoria }]
//   completar:      [{ id, nombreActual, nombre, latitud, longitud, georefId, categoria, renombrar }]
//                   (renombrar: el nombre cambia al oficial)
//   conCoordenadas: [{ id, nombre, georefId, categoria }]  coinciden pero ya están ubicadas (coordenadas o placeId): no se tocan
//   yaImportadas:   [{ id, nombre, georefId, categoria }]  ya tienen ese georefId
//   conflictos:     [{ id, nombre, georefIdGuardado, georefId }]  mismo nombre, otro georefId: no se tocan
//   homonimos:      [{ nombre, localidades: [{ georefId, nombreFinal, departamento, categoria }] }]
//   descartadas:    [{ georefId, nombre, departamento, categoria, mismaQue }]  (Entidad = su localidad)
//   sinCoincidencia:[{ id, nombre, tieneCoordenadas, ambigua }]  existentes que no son ninguna localidad
//   porCategoria:   { [categoria]: { enGeoref, nuevas, coinciden, descartadas } }
function planificar(localidades, existentes) {
  // Nombres en NFC (como los guarda normalizarNombreUbicacion), por si Georef
  // manda alguna tilde descompuesta.
  localidades = localidades.map((l) => ({
    ...l,
    nombre: l.nombre.normalize('NFC').trim(),
    departamento: { ...l.departamento, nombre: l.departamento.nombre.normalize('NFC').trim() },
  }));

  // 1. Un registro por lugar: misma localidad listada como Entidad y como
  //    localidad en el mismo departamento.
  const descartadas = [];
  const unicas = [];
  for (const grupo of agruparPor(localidades, (l) => `${normalizarNombre(l.nombre)}|${l.departamento.id ?? l.departamento.nombre}`).values()) {
    const [conservada, ...resto] = [...grupo].sort(rankearDuplicado);
    unicas.push(conservada);
    for (const l of resto) {
      descartadas.push({ georefId: l.id, nombre: l.nombre, departamento: l.departamento.nombre, categoria: l.categoria, mismaQue: conservada.id });
    }
  }

  // 2. Homónimos en distintos departamentos: "Nombre (Departamento)".
  const homonimos = [];
  const nombreFinal = new Map();
  for (const grupo of agruparPor(unicas, (l) => normalizarNombre(l.nombre)).values()) {
    if (grupo.length === 1) {
      nombreFinal.set(grupo[0].id, grupo[0].nombre.trim());
      continue;
    }
    const ordenadas = [...grupo].sort((a, b) => a.departamento.nombre.localeCompare(b.departamento.nombre, 'es'));
    for (const l of ordenadas) nombreFinal.set(l.id, `${l.nombre.trim()} (${l.departamento.nombre.trim()})`);
    homonimos.push({
      nombre: ordenadas[0].nombre.trim(),
      localidades: ordenadas.map((l) => ({ georefId: l.id, nombreFinal: nombreFinal.get(l.id), departamento: l.departamento.nombre, categoria: l.categoria })),
    });
  }

  // 3. Contra las existentes.
  const porGeorefId = new Map(existentes.filter((e) => e.georefId).map((e) => [e.georefId, e]));
  const porClave = new Map(existentes.map((e) => [e.nombreNormalizado, e]));
  const usadas = new Set();

  const crear = [];
  const completar = [];
  const conCoordenadas = [];
  const yaImportadas = [];
  const conflictos = [];

  for (const l of unicas) {
    const nombre = nombreFinal.get(l.id);
    const nombreNormalizado = normalizarNombre(nombre);
    const punto = { latitud: l.centroide.lat, longitud: l.centroide.lon };

    const importada = porGeorefId.get(l.id);
    if (importada) {
      usadas.add(importada.id);
      yaImportadas.push({ id: importada.id, nombre: importada.nombre, georefId: l.id, categoria: l.categoria });
      continue;
    }

    const existente = porClave.get(nombreNormalizado);
    if (!existente) {
      crear.push({ georefId: l.id, nombre, nombreNormalizado, ...punto, categoria: l.categoria });
      continue;
    }

    usadas.add(existente.id);
    if (existente.georefId) {
      conflictos.push({ id: existente.id, nombre: existente.nombre, georefIdGuardado: existente.georefId, georefId: l.id });
    } else if ((existente.latitud != null && existente.longitud != null) || existente.placeId) {
      conCoordenadas.push({ id: existente.id, nombre: existente.nombre, georefId: l.id, categoria: l.categoria });
    } else {
      completar.push({
        id: existente.id,
        nombreActual: existente.nombre,
        nombre,
        ...punto,
        georefId: l.id,
        categoria: l.categoria,
        // Mismo nombreNormalizado (por eso coincidió): el renombre nunca choca
        // con el índice único de otra fila.
        renombrar: existente.nombre !== nombre,
      });
    }
  }

  const clavesHomonimas = new Set(homonimos.map((h) => normalizarNombre(h.nombre)));
  const sinCoincidencia = existentes
    .filter((e) => !usadas.has(e.id))
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      tieneCoordenadas: (e.latitud != null && e.longitud != null) || Boolean(e.placeId),
      ambigua: clavesHomonimas.has(e.nombreNormalizado),
    }));

  const porCategoria = {};
  const sumar = (categoria, campo) => {
    porCategoria[categoria] ??= { enGeoref: 0, nuevas: 0, coinciden: 0, descartadas: 0 };
    porCategoria[categoria][campo] += 1;
  };
  for (const l of localidades) sumar(l.categoria, 'enGeoref');
  for (const c of crear) sumar(c.categoria, 'nuevas');
  for (const c of [...completar, ...conCoordenadas, ...yaImportadas]) sumar(c.categoria, 'coinciden');
  for (const d of descartadas) sumar(d.categoria, 'descartadas');

  return { crear, completar, conCoordenadas, yaImportadas, conflictos, homonimos, descartadas, sinCoincidencia, porCategoria };
}

function imprimirResumen(plan, { totalGeoref, totalBase }, log = console.log) {
  const renombres = plan.completar.filter((c) => c.renombrar);

  log(`Localidades en Georef (Córdoba): ${totalGeoref}`);
  log(`Ubicaciones en la base: ${totalBase}`);
  log('');
  log(`Nuevas (se crean): ${plan.crear.length}`);
  log(`Coinciden con existentes: ${plan.completar.length + plan.conCoordenadas.length + plan.yaImportadas.length}`);
  log(`  sin coordenadas, se completan: ${plan.completar.length} (con renombre: ${renombres.length})`);
  log(`  ya estaban ubicadas, no se tocan: ${plan.conCoordenadas.length}`);
  log(`  ya importadas (mismo georefId): ${plan.yaImportadas.length}`);
  log(`Mismo lugar listado dos veces en Georef (se importa uno): ${plan.descartadas.length}`);

  log('\nPor categoría de Georef:');
  log('  categoría                            en Georef  nuevas  coinciden  descartadas');
  for (const [categoria, c] of Object.entries(plan.porCategoria).sort()) {
    log(`  ${categoria.padEnd(36)} ${String(c.enGeoref).padStart(9)}  ${String(c.nuevas).padStart(6)}  ${String(c.coinciden).padStart(9)}  ${String(c.descartadas).padStart(11)}`);
  }

  log(`\nHomónimos (${plan.homonimos.length}), desambiguados con el departamento:`);
  for (const h of plan.homonimos) log(`  ${h.nombre}: ${h.localidades.map((l) => `"${l.nombreFinal}"`).join(', ')}`);

  log(`\nRenombres al nombre oficial (${renombres.length}):`);
  for (const r of renombres) log(`  #${r.id} "${r.nombreActual}" -> "${r.nombre}"`);

  log(`\nExistentes que coinciden y se completan con coordenadas (${plan.completar.length}):`);
  for (const c of plan.completar) log(`  #${c.id} "${c.nombre}" (${c.latitud.toFixed(4)}, ${c.longitud.toFixed(4)})`);

  if (plan.conCoordenadas.length > 0) {
    log(`\nCoinciden pero ya estaban ubicadas, no se tocan (${plan.conCoordenadas.length}):`);
    for (const c of plan.conCoordenadas) log(`  #${c.id} "${c.nombre}"`);
  }

  log(`\nExistentes sin coincidencia (${plan.sinCoincidencia.length}) — puntos de interés u otros nombres; se ubican desde la app:`);
  for (const s of plan.sinCoincidencia) {
    const notas = [s.tieneCoordenadas ? 'con coordenadas' : 'sin coordenadas', s.ambigua ? 'AMBIGUA: hay homónimos, elegí a mano' : null].filter(Boolean);
    log(`  #${s.id} "${s.nombre}" (${notas.join('; ')})`);
  }

  if (plan.conflictos.length > 0) {
    log(`\nCONFLICTOS (${plan.conflictos.length}): mismo nombre que otra localidad de Georef ya importada. No se tocan:`);
    for (const c of plan.conflictos) log(`  #${c.id} "${c.nombre}" tiene georefId ${c.georefIdGuardado}, Georef propone ${c.georefId}`);
  }
}

// Escribe el plan en una sola transacción. Devuelve lo que hizo.
async function aplicarPlan(prisma, plan) {
  const operaciones = [];
  if (plan.crear.length > 0) {
    operaciones.push(
      prisma.ubicacion.createMany({
        data: plan.crear.map(({ nombre, nombreNormalizado, latitud, longitud, georefId }) => ({ nombre, nombreNormalizado, latitud, longitud, georefId })),
      })
    );
  }
  for (const c of plan.completar) {
    operaciones.push(
      prisma.ubicacion.update({
        where: { id: c.id },
        data: { latitud: c.latitud, longitud: c.longitud, georefId: c.georefId, ...(c.renombrar ? { nombre: c.nombre } : {}) },
      })
    );
  }
  if (operaciones.length > 0) await prisma.$transaction(operaciones);
  return { creadas: plan.crear.length, completadas: plan.completar.length, renombradas: plan.completar.filter((c) => c.renombrar).length };
}

// Todo el flujo, con dependencias inyectables para los tests.
async function ejecutar({ aplicar = false, prisma, fetchFn = globalThis.fetch, log = console.log }) {
  const localidades = await obtenerLocalidades(fetchFn);
  const existentes = await prisma.ubicacion.findMany({
    where: { esFrecuente: true },
    select: { id: true, nombre: true, nombreNormalizado: true, latitud: true, longitud: true, georefId: true, placeId: true },
    orderBy: { id: 'asc' },
  });

  const plan = planificar(localidades, existentes);
  log(aplicar ? 'MODO: --aplicar (escribe en la base)\n' : 'MODO: dry-run (solo lectura, no se modifica nada)\n');
  imprimirResumen(plan, { totalGeoref: localidades.length, totalBase: existentes.length }, log);

  if (plan.crear.length === 0 && plan.completar.length === 0) {
    log('\nNada para escribir.');
    return { plan, resultado: null };
  }
  if (!aplicar) {
    log('\nDry-run: no se escribió nada. Para aplicarlo, volvé a correr con --aplicar.');
    return { plan, resultado: null };
  }

  const resultado = await aplicarPlan(prisma, plan);
  log(`\nAplicado: ${resultado.creadas} creadas, ${resultado.completadas} completadas con coordenadas (${resultado.renombradas} renombradas).`);
  return { plan, resultado };
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  if (aplicar && args.includes('--dry-run')) throw new Error('Usá --dry-run o --aplicar, no los dos.');
  const desconocidos = args.filter((a) => a !== '--aplicar' && a !== '--dry-run');
  if (desconocidos.length > 0) throw new Error(`Argumentos desconocidos: ${desconocidos.join(' ')}`);

  // Prisma toma DATABASE_URL de backend/.env, salvo que ya esté exportada en la
  // terminal. Se carga acá y no al importar el archivo, para que los tests usen
  // planificar sin un cliente de base de datos.
  const prisma = require('../src/services/prismaClient');
  try {
    await ejecutar({ aplicar, prisma });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof RespuestaGeorefInvalidaError ? `Georef: ${err.message}. No se escribió nada.` : err);
    process.exit(1);
  });
}

module.exports = { URL_GEOREF, obtenerLocalidades, planificar, aplicarPlan, ejecutar, RespuestaGeorefInvalidaError };
