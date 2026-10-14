const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');

// Catálogo de marcas de vehículo. Mismo patrón "buscar o crear" que
// clienteService (ver los comentarios de ahí): se busca y deduplica por
// nombreNormalizado y se guarda el nombre tal cual lo tipeó el usuario.

const LIMITE_BUSQUEDA = 50;

// nombreNormalizado es interno (solo para el índice único) y nunca sale por la
// API: todas las lecturas de este service usan este select.
const SELECT_PUBLICO = { id: true, nombre: true, creadoEn: true };

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

async function buscar(texto) {
  const textoNormalizado = normalizarNombre(texto);

  return prisma.marca.findMany({
    where: textoNormalizado ? { nombreNormalizado: { contains: textoNormalizado } } : undefined,
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Idempotente. El findUnique+create es best effort; la garantía dura contra
// dos requests simultáneos con el mismo nombre es el índice único de
// nombreNormalizado: el que pierde la carrera recibe P2002 y devuelve la fila
// que creó el otro.
async function buscarOCrear({ nombre }) {
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) {
    throw new ValidacionError({ nombre: 'El nombre es obligatorio' });
  }

  const nombreNormalizado = normalizarNombre(nombreTrim);

  const existente = await prisma.marca.findUnique({
    where: { nombreNormalizado },
    select: SELECT_PUBLICO,
  });
  if (existente) {
    return existente;
  }

  try {
    return await prisma.marca.create({
      data: { nombre: nombreTrim, nombreNormalizado },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const ganador = await prisma.marca.findUnique({
        where: { nombreNormalizado },
        select: SELECT_PUBLICO,
      });
      if (ganador) {
        return ganador;
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
