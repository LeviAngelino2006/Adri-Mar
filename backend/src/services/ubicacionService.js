const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');

const LIMITE_BUSQUEDA = 50;

// nombreNormalizado es un campo interno (solo para el índice único de abajo)
// y nunca debe salir por la API: todas las lecturas de este service usan
// este mismo select para no filtrarlo por accidente.
const SELECT_PUBLICO = { id: true, nombre: true, creadoEn: true };

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

async function buscar(texto) {
  const textoTrim = (texto || '').trim();

  return prisma.ubicacion.findMany({
    where: textoTrim ? { nombre: { contains: textoTrim, mode: 'insensitive' } } : undefined,
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Idempotente: si ya existe una ubicación cuyo nombre normalizado coincide,
// la devuelve tal cual (nunca crea una segunda). El nombre se compara
// normalizado pero se persiste tal cual lo tipeó el usuario.
//
// El chequeo findUnique+create de abajo es best effort para el camino feliz;
// la garantía dura contra la carrera entre dos requests simultáneos con el
// mismo nombre es el índice único de nombreNormalizado en la base (mismo
// patrón que el índice único parcial de viajes en curso, ver viajeService).
// Si ambas requests pasan el findUnique (ninguna ve todavía la fila de la
// otra) y las dos intentan crear, la segunda en llegar al INSERT choca
// contra ese índice (P2002) — se captura y se busca la fila que la primera
// ya creó, para que buscarOCrear nunca propague un 500 por la carrera.
async function buscarOCrear({ nombre }) {
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) {
    throw new ValidacionError({ nombre: 'El nombre es obligatorio' });
  }

  const nombreNormalizado = normalizarNombre(nombreTrim);

  const existente = await prisma.ubicacion.findUnique({
    where: { nombreNormalizado },
    select: SELECT_PUBLICO,
  });
  if (existente) {
    return existente;
  }

  try {
    return await prisma.ubicacion.create({
      data: { nombre: nombreTrim, nombreNormalizado },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const ganadora = await prisma.ubicacion.findUnique({
        where: { nombreNormalizado },
        select: SELECT_PUBLICO,
      });
      if (ganadora) {
        return ganadora;
      }
    }
    throw err;
  }
}

module.exports = {
  buscar,
  buscarOCrear,
  ValidacionError,
};
