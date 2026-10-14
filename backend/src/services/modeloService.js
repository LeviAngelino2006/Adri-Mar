const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');

// Catálogo de modelos de vehículo, siempre dentro de una marca. Mismo patrón
// "buscar o crear" que clienteService y marcaService, con una diferencia: el
// nombre es único por marca (@@unique([marcaId, nombreNormalizado])), así que
// "Daily" puede existir en dos marcas distintas y buscarOCrear deduplica solo
// dentro de la marca pedida.

const LIMITE_BUSQUEDA = 50;
const ENTERO_MAXIMO = 2147483647; // INTEGER de Postgres

const SELECT_PUBLICO = { id: true, nombre: true, marcaId: true, creadoEn: true };

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class MarcaNoEncontradaError extends Error {}

// marcaId llega del path (/marcas/:marcaId/modelos), como string. Un id que no
// es un entero positivo se trata igual que uno que no existe.
async function obtenerMarcaId(marcaId) {
  const id = Number(marcaId);
  if (!Number.isInteger(id) || id <= 0 || id > ENTERO_MAXIMO) {
    throw new MarcaNoEncontradaError();
  }
  const marca = await prisma.marca.findUnique({ where: { id }, select: { id: true } });
  if (!marca) {
    throw new MarcaNoEncontradaError();
  }
  return id;
}

async function buscar(marcaId, texto) {
  const id = await obtenerMarcaId(marcaId);
  const textoNormalizado = normalizarNombre(texto);

  return prisma.modelo.findMany({
    where: {
      marcaId: id,
      ...(textoNormalizado ? { nombreNormalizado: { contains: textoNormalizado } } : {}),
    },
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Idempotente dentro de la marca, con el mismo manejo de la carrera (P2002)
// que clienteService.buscarOCrear.
async function buscarOCrear({ marcaId, nombre }) {
  const id = await obtenerMarcaId(marcaId);

  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) {
    throw new ValidacionError({ nombre: 'El nombre es obligatorio' });
  }

  const nombreNormalizado = normalizarNombre(nombreTrim);
  const dondeUnico = { marcaId_nombreNormalizado: { marcaId: id, nombreNormalizado } };

  const existente = await prisma.modelo.findUnique({ where: dondeUnico, select: SELECT_PUBLICO });
  if (existente) {
    return existente;
  }

  try {
    return await prisma.modelo.create({
      data: { nombre: nombreTrim, nombreNormalizado, marcaId: id },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const ganador = await prisma.modelo.findUnique({ where: dondeUnico, select: SELECT_PUBLICO });
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
  MarcaNoEncontradaError,
};
