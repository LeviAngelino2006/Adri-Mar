const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');
const { normalizarNombreUbicacion } = require('../utils/normalizarNombreUbicacion');
const { leerCoordenadas } = require('../utils/coordenadas');
const openRouteService = require('./openRouteService');

const LIMITE_BUSQUEDA = 50;

// nombreNormalizado es un campo interno (solo para el índice único de abajo)
// y nunca debe salir por la API: todas las lecturas de este service usan
// este mismo select para no filtrarlo por accidente.
const SELECT_PUBLICO = { id: true, nombre: true, creadoEn: true };
// Para decidir si a una existente le faltan coordenadas; no se devuelve tal cual.
const SELECT_CON_COORDENADAS = { ...SELECT_PUBLICO, latitud: true, longitud: true };

const publico = ({ id, nombre, creadoEn }) => ({ id, nombre, creadoEn });
const sinCoordenadas = (u) => u.latitud == null || u.longitud == null;

const MIN_TEXTO_MAPA = 3;
const MAX_TEXTO_MAPA = 200;

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradaError extends Error {}

// Busca contra nombreNormalizado (ya en minúscula y sin acentos) pasando el
// texto por la misma normalizarNombre, así "rio" encuentra "Río Tercero" sin
// necesidad de mode: 'insensitive' ni de la extensión unaccent de Postgres.
async function buscar(texto) {
  const textoNormalizado = normalizarNombre(texto);

  return prisma.ubicacion.findMany({
    where: textoNormalizado ? { nombreNormalizado: { contains: textoNormalizado } } : undefined,
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Idempotente: si ya existe una ubicación cuyo nombre normalizado coincide
// (sin distinguir mayúsculas, acentos ni espacios repetidos), la devuelve tal
// cual (nunca crea una segunda). Lo que se persiste es el nombre con formato de
// título (normalizarNombreUbicacion: "RIO TERCERO" y "rio tercero" quedan como
// "Rio Tercero"); para comparar se usa normalizarNombre, que no cambia con ese
// formato, así que el índice único de abajo sigue siendo el mismo.
//
// Coordenadas (opcionales, juntas): el punto que el usuario eligió en el mapa
// al crearla (SelectorUbicacion). Si la ubicación ya existía sin coordenadas,
// se le completan con estas; si ya tenía, no se tocan (para corregir un punto
// está actualizarCoordenadas).
//
// El chequeo findUnique+create de abajo es best effort para el camino feliz;
// la garantía dura contra la carrera entre dos requests simultáneos con el
// mismo nombre es el índice único de nombreNormalizado en la base (mismo
// patrón que el índice único parcial de viajes en curso, ver viajeService).
// Si ambas requests pasan el findUnique (ninguna ve todavía la fila de la
// otra) y las dos intentan crear, la segunda en llegar al INSERT choca
// contra ese índice (P2002) — se captura y se busca la fila que la primera
// ya creó, para que buscarOCrear nunca propague un 500 por la carrera.
async function buscarOCrear({ nombre, latitud, longitud }) {
  const errores = {};
  const nombreFormateado = normalizarNombreUbicacion(nombre);
  if (!nombreFormateado) errores.nombre = 'El nombre es obligatorio';
  const { coordenadas, error: errorCoordenadas } = leerCoordenadas({ latitud, longitud });
  if (errorCoordenadas) errores.coordenadas = errorCoordenadas;
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  const nombreNormalizado = normalizarNombre(nombreFormateado);

  const existente = await prisma.ubicacion.findUnique({
    where: { nombreNormalizado },
    select: SELECT_CON_COORDENADAS,
  });
  if (existente) {
    return completarCoordenadas(existente, coordenadas);
  }

  try {
    return await prisma.ubicacion.create({
      data: { nombre: nombreFormateado, nombreNormalizado, ...(coordenadas ?? {}) },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const ganadora = await prisma.ubicacion.findUnique({
        where: { nombreNormalizado },
        select: SELECT_CON_COORDENADAS,
      });
      if (ganadora) {
        return completarCoordenadas(ganadora, coordenadas);
      }
    }
    throw err;
  }
}

// Una existente que todavía no estaba en el mapa toma las coordenadas que
// vinieron al "crearla" de nuevo; una que ya tenía queda como estaba.
async function completarCoordenadas(existente, coordenadas) {
  if (!coordenadas || !sinCoordenadas(existente)) return publico(existente);
  return prisma.ubicacion.update({
    where: { id: existente.id },
    data: coordenadas,
    select: SELECT_PUBLICO,
  });
}

// Ubica en el mapa una ubicación existente (la que el cálculo de km informó sin
// coordenadas) o corrige su punto. Las coordenadas son obligatorias acá.
async function actualizarCoordenadas(id, { latitud, longitud } = {}) {
  const ubicacionId = Number(id);
  if (!Number.isInteger(ubicacionId) || ubicacionId <= 0) throw new NoEncontradaError();

  const { coordenadas, error } = leerCoordenadas({ latitud, longitud });
  if (error) throw new ValidacionError({ coordenadas: error });
  if (!coordenadas) throw new ValidacionError({ coordenadas: 'Elegí el lugar en el mapa o pegá sus coordenadas.' });

  try {
    return await prisma.ubicacion.update({
      where: { id: ubicacionId },
      data: coordenadas,
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2025') throw new NoEncontradaError();
    throw err;
  }
}

// Candidatos del mapa para el texto que escribió el usuario (geocoding de ORS):
// [{ etiqueta, latitud, longitud }], hasta 5. Solo aportan coordenadas: el
// nombre de la ubicación lo sigue eligiendo el usuario.
async function buscarEnMapa(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (limpio.length < MIN_TEXTO_MAPA) {
    throw new ValidacionError({ texto: `Escribí al menos ${MIN_TEXTO_MAPA} letras para buscar en el mapa.` });
  }
  if (limpio.length > MAX_TEXTO_MAPA) {
    throw new ValidacionError({ texto: 'El texto a buscar es demasiado largo.' });
  }
  return openRouteService.buscarLugares(limpio);
}

module.exports = {
  buscar,
  buscarOCrear,
  actualizarCoordenadas,
  buscarEnMapa,
  ValidacionError,
  NoEncontradaError,
  ErrorMapa: openRouteService.ErrorMapa,
};
