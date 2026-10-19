const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');
const { normalizarNombreUbicacion } = require('../utils/normalizarNombreUbicacion');
const googleMapsService = require('./googleMapsService');

const LIMITE_BUSQUEDA = 50;

// nombreNormalizado es un campo interno (solo para el índice único de abajo)
// y nunca debe salir por la API: todas las lecturas de este service usan
// este mismo select para no filtrarlo por accidente. placeId y las
// coordenadas sí salen: con ellos el front arma el link al recorrido en Google
// Maps (utils/googleMaps.urlRecorrido).
const SELECT_PUBLICO = { id: true, nombre: true, creadoEn: true, placeId: true, latitud: true, longitud: true };
// Para decidir qué hacer con una existente; no se devuelve tal cual.
const SELECT_INTERNO = { ...SELECT_PUBLICO, esFrecuente: true };

const publico = ({ id, nombre, creadoEn, placeId, latitud, longitud }) => ({ id, nombre, creadoEn, placeId, latitud, longitud });
const estaUbicada = (u) => Boolean(u.placeId) || (u.latitud != null && u.longitud != null);

const MIN_TEXTO_GOOGLE = 3;
const MAX_TEXTO_GOOGLE = 200;
const MAX_NOMBRE = 200;
// Place IDs y session tokens de Google: texto URL-safe (letras, números, - y _).
// El session token es un UUID (36 caracteres) generado por el front.
const FORMATO_PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;
const FORMATO_SESSION_TOKEN = /^[A-Za-z0-9_-]{1,36}$/;

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradaError extends Error {}

// 409: el pedido choca con otra ubicación (mismo lugar o mismo nombre).
// `extra` va en la respuesta: con un nombre repetido, la frecuente que ya
// existe ({ frecuenteExistente }), para que el front ofrezca usarla.
class ConflictoError extends Error {
  constructor(mensaje, extra = {}) {
    super(mensaje);
    this.extra = extra;
  }
}

// Busca contra nombreNormalizado (ya en minúscula y sin acentos) pasando el
// texto por la misma normalizarNombre, así "rio" encuentra "Río Tercero" sin
// necesidad de mode: 'insensitive' ni de la extensión unaccent de Postgres.
// Solo FRECUENTES: la casa de un pasajero (PARTICULAR) no se ofrece para otros
// viajes; se vuelve a elegir desde Google (y el placeId evita duplicarla).
async function buscar(texto) {
  const textoNormalizado = normalizarNombre(texto);

  return prisma.ubicacion.findMany({
    where: {
      esFrecuente: true,
      ...(textoNormalizado ? { nombreNormalizado: { contains: textoNormalizado } } : {}),
    },
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
    take: LIMITE_BUSQUEDA,
  });
}

// Alta por nombre de una FRECUENTE (sin lugar en el mapa). Ya no la usa el
// formulario (ahí se elige desde Google), pero sí la precarga de ubicaciones.
//
// Idempotente: si ya existe una ubicación cuyo nombre normalizado coincide
// (sin distinguir mayúsculas, acentos ni espacios repetidos), la devuelve tal
// cual (nunca crea una segunda). Lo que se persiste es el nombre con formato de
// título (normalizarNombreUbicacion: "RIO TERCERO" y "rio tercero" quedan como
// "Rio Tercero"); para comparar se usa normalizarNombre, que no cambia con ese
// formato, así que el índice único de abajo sigue siendo el mismo.
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
  const nombreFormateado = normalizarNombreUbicacion(nombre);
  if (!nombreFormateado) {
    throw new ValidacionError({ nombre: 'El nombre es obligatorio' });
  }

  const nombreNormalizado = normalizarNombre(nombreFormateado);

  const existente = await prisma.ubicacion.findUnique({
    where: { nombreNormalizado },
    select: SELECT_PUBLICO,
  });
  if (existente) {
    return existente;
  }

  try {
    return await prisma.ubicacion.create({
      data: { nombre: nombreFormateado, nombreNormalizado },
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

// --- Google -----------------------------------------------------------------

function validarTexto(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (limpio.length < MIN_TEXTO_GOOGLE) {
    return { error: `Escribí al menos ${MIN_TEXTO_GOOGLE} letras para buscar en Google.` };
  }
  if (limpio.length > MAX_TEXTO_GOOGLE) return { error: 'El texto a buscar es demasiado largo.' };
  return { texto: limpio };
}

// El session token es opcional (sin él Google cobra cada sugerencia por
// separado), pero si viene tiene que tener el formato de Google.
function validarSessionToken(sessionToken, errores) {
  if (sessionToken === undefined || sessionToken === null || sessionToken === '') return undefined;
  if (typeof sessionToken !== 'string' || !FORMATO_SESSION_TOKEN.test(sessionToken)) {
    errores.sessionToken = 'La sesión de búsqueda no es válida.';
    return undefined;
  }
  return sessionToken;
}

function validarPlaceId(placeId, errores) {
  if (typeof placeId !== 'string' || !FORMATO_PLACE_ID.test(placeId)) {
    errores.placeId = 'Elegí un lugar de las sugerencias de Google.';
    return undefined;
  }
  return placeId;
}

// Sugerencias de Google para lo que el usuario va escribiendo:
// [{ placeId, textoPrincipal, textoSecundario }].
async function sugerenciasGoogle({ texto, sessionToken } = {}) {
  const errores = {};
  const { texto: limpio, error } = validarTexto(texto);
  if (error) errores.texto = error;
  const token = validarSessionToken(sessionToken, errores);
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  return googleMapsService.sugerencias(limpio, token);
}

// Nombre de una frecuente que viene de Google: el texto principal de la
// sugerencia ("Colegio Nacional de Monserrat"), tal cual lo escribe Google
// (sin pasar por el formato de título, que rompería siglas como "L.V.").
function nombreFrecuente(nombre) {
  return String(nombre ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

// 409 por nombre repetido, con la frecuente que ya existe para ofrecer usarla.
function conflictoDeNombre(otra) {
  return new ConflictoError(
    `Ya hay una ubicación frecuente llamada "${otra.nombre}". Usala o elegí otro nombre.`,
    { frecuenteExistente: publico(otra) }
  );
}

// La frecuente con ese nombre, si hay una que choca con guardar `placeId`:
// una que ya está ubicada (coordenadas de Georef u otro placeId) es otro
// lugar o el mismo cargado de otra forma, y la decisión es del usuario (409
// con la existente). Una SIN ubicar (ej. "Colegio Nacional de Monserrat" del
// Excel) no choca: es el mismo sitio cargado a mano y se le completa el placeId.
async function frecuenteQueChoca(nombreNormalizado, placeId) {
  const otra = await prisma.ubicacion.findUnique({ where: { nombreNormalizado }, select: SELECT_INTERNO });
  if (!otra || otra.placeId === placeId || !estaUbicada(otra)) return null;
  return otra;
}

async function frecuenteConMismoNombre(nombreNormalizado, placeId) {
  const choca = await frecuenteQueChoca(nombreNormalizado, placeId);
  if (choca) throw conflictoDeNombre(choca);
  const otra = await prisma.ubicacion.findUnique({ where: { nombreNormalizado }, select: SELECT_INTERNO });
  if (!otra) return null;
  if (otra.placeId === placeId) return publico(otra);
  return prisma.ubicacion.update({ where: { id: otra.id }, data: { placeId }, select: SELECT_PUBLICO });
}

// Una PARTICULAR que se vuelve a elegir marcando "Guardar como frecuente" pasa a
// ser FRECUENTE, con el nombre del lugar en vez de la dirección.
async function promoverAFrecuente(particular, nombre) {
  const nombreNormalizado = normalizarNombre(nombre);
  const otra = await prisma.ubicacion.findUnique({ where: { nombreNormalizado }, select: SELECT_INTERNO });
  if (otra && otra.id !== particular.id) throw conflictoDeNombre(otra);
  return prisma.ubicacion.update({
    where: { id: particular.id },
    data: { esFrecuente: true, nombre, nombreNormalizado },
    select: SELECT_PUBLICO,
  });
}

// Alta desde una sugerencia de Google, con upsert por placeId: elegir dos veces
// la misma dirección devuelve la misma fila (y no vuelve a llamar a Google).
//  - PARTICULAR (frecuente false): nombre = la dirección formateada de Google,
//    nombreNormalizado null (no choca con nadie por nombre) y fuera del buscador.
//  - FRECUENTE: nombre = el que confirma el usuario (`nombre`; el front lo
//    precarga con el texto principal de la sugerencia). No se usa displayName
//    del detalle: dispara el SKU Pro. Si ese nombre ya es otra frecuente
//    ubicada, 409 con la existente ANTES de llamar a Google.
// De Google solo se guarda el placeId (ver googleMapsService): latitud,
// longitud y direccion quedan en null.
async function crearDesdeGoogle({ placeId, sessionToken, frecuente, nombre } = {}) {
  const errores = {};
  const id = validarPlaceId(placeId, errores);
  const token = validarSessionToken(sessionToken, errores);
  const esFrecuente = frecuente === true;
  if (frecuente !== undefined && typeof frecuente !== 'boolean') errores.frecuente = 'Tiene que ser verdadero o falso.';
  const nombreLimpio = nombreFrecuente(nombre);
  if (esFrecuente && !nombreLimpio) errores.nombre = 'El nombre es obligatorio para guardarla como frecuente.';
  if (nombreLimpio.length > MAX_NOMBRE) errores.nombre = 'El nombre es demasiado largo.';
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  const existente = await prisma.ubicacion.findUnique({ where: { placeId: id }, select: SELECT_INTERNO });
  if (existente) {
    if (esFrecuente && !existente.esFrecuente) return promoverAFrecuente(existente, nombreLimpio);
    return publico(existente);
  }

  if (esFrecuente) {
    const choca = await frecuenteQueChoca(normalizarNombre(nombreLimpio), id);
    if (choca) throw conflictoDeNombre(choca);
  }

  // Valida el placeId con Google, trae la dirección y cierra la sesión de
  // búsqueda. Google puede devolver un id más nuevo para el mismo lugar.
  const detalle = await googleMapsService.detalleLugar(id, token);
  const placeIdFinal = detalle.placeId;
  if (placeIdFinal !== id) {
    const conIdNuevo = await prisma.ubicacion.findUnique({ where: { placeId: placeIdFinal }, select: SELECT_INTERNO });
    if (conIdNuevo) return publico(conIdNuevo);
  }

  let data;
  if (esFrecuente) {
    const nombreNormalizado = normalizarNombre(nombreLimpio);
    const mismoNombre = await frecuenteConMismoNombre(nombreNormalizado, placeIdFinal);
    if (mismoNombre) return mismoNombre;
    data = { nombre: nombreLimpio, nombreNormalizado, esFrecuente: true, placeId: placeIdFinal };
  } else {
    data = { nombre: detalle.direccion || nombreLimpio || 'Dirección sin nombre', nombreNormalizado: null, esFrecuente: false, placeId: placeIdFinal };
  }

  try {
    return await prisma.ubicacion.create({ data, select: SELECT_PUBLICO });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    // Carrera: otra request creó el mismo lugar (o la misma frecuente) recién.
    const ganadora = await prisma.ubicacion.findUnique({ where: { placeId: placeIdFinal }, select: SELECT_PUBLICO });
    if (ganadora) return ganadora;
    const mismoNombre = await prisma.ubicacion.findUnique({ where: { nombreNormalizado: data.nombreNormalizado }, select: SELECT_INTERNO });
    if (mismoNombre) throw conflictoDeNombre(mismoNombre);
    throw err;
  }
}

// Ubica con Google una ubicación existente que todavía no está en el mapa (la
// que el cálculo de km informó sin coordenadas, ej. un colegio del Excel): le
// completa el placeId. Si ya está ubicada, o si ese lugar ya es otra ubicación,
// 409.
async function ubicarDesdeGoogle(id, { placeId, sessionToken } = {}) {
  const ubicacionId = Number(id);
  if (!Number.isInteger(ubicacionId) || ubicacionId <= 0) throw new NoEncontradaError();

  const errores = {};
  const lugar = validarPlaceId(placeId, errores);
  const token = validarSessionToken(sessionToken, errores);
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  const fila = await prisma.ubicacion.findUnique({ where: { id: ubicacionId }, select: SELECT_INTERNO });
  if (!fila) throw new NoEncontradaError();
  if (estaUbicada(fila)) throw new ConflictoError(`"${fila.nombre}" ya está ubicada en el mapa.`);

  const detalle = await googleMapsService.detalleLugar(lugar, token);
  const otra = await prisma.ubicacion.findUnique({ where: { placeId: detalle.placeId }, select: SELECT_INTERNO });
  if (otra) {
    throw new ConflictoError(`Ese lugar ya está cargado como "${otra.nombre}". Elegí esa ubicación en el recorrido.`);
  }

  try {
    return await prisma.ubicacion.update({
      where: { id: ubicacionId },
      data: { placeId: detalle.placeId },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') throw new ConflictoError('Ese lugar ya está cargado como otra ubicación.');
    throw err;
  }
}

module.exports = {
  buscar,
  buscarOCrear,
  sugerenciasGoogle,
  crearDesdeGoogle,
  ubicarDesdeGoogle,
  ValidacionError,
  NoEncontradaError,
  ConflictoError,
  ErrorMapa: googleMapsService.ErrorMapa,
};
