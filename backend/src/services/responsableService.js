const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');

// Catálogo de responsables de arreglos (mecánico, chapista o taller). Mismo
// patrón "buscar o crear" que marcaService (ver los comentarios de ahí): se
// busca y deduplica por nombreNormalizado y se guarda el nombre tal cual lo
// tipeó el usuario.

const LIMITE_BUSQUEDA = 50;
const MAX_NOMBRE = 120;

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

  return prisma.responsableMantenimiento.findMany({
    where: textoNormalizado ? { nombreNormalizado: { contains: textoNormalizado } } : undefined,
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Idempotente; la carrera entre dos requests con el mismo nombre la resuelve
// el índice único (P2002), como en marcaService.buscarOCrear.
async function buscarOCrear({ nombre }) {
  const nombreTrim = typeof nombre === 'string' ? nombre.trim() : '';
  if (!nombreTrim) {
    throw new ValidacionError({ nombre: 'El nombre es obligatorio' });
  }
  if ([...nombreTrim].length > MAX_NOMBRE) {
    throw new ValidacionError({ nombre: `El nombre admite hasta ${MAX_NOMBRE} caracteres` });
  }

  const nombreNormalizado = normalizarNombre(nombreTrim);

  const existente = await prisma.responsableMantenimiento.findUnique({
    where: { nombreNormalizado },
    select: SELECT_PUBLICO,
  });
  if (existente) {
    return existente;
  }

  try {
    return await prisma.responsableMantenimiento.create({
      data: { nombre: nombreTrim, nombreNormalizado },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const ganador = await prisma.responsableMantenimiento.findUnique({
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
