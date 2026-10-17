// Validación de las coordenadas de una ubicación (grados decimales, WGS84). El
// front tiene una réplica para avisar mientras se escribe
// (frontend/src/utils/coordenadas.js, con los mismos casos en sus tests); la que
// manda es esta. Si cambia una, cambiar la otra.
//
// La empresa opera en Córdoba, pero un viaje puede salir de la provincia: se
// acepta cualquier punto de Argentina continental (incluye Tierra del Fuego y
// Malvinas). Un rectángulo alcanza: lo que se quiere atajar son errores de
// tipeo, no fronteras exactas.
const LIMITES_ARGENTINA = { latMin: -55.2, latMax: -21.7, lonMin: -73.7, lonMax: -53.5 };

const enArgentina = (lat, lon) =>
  lat >= LIMITES_ARGENTINA.latMin &&
  lat <= LIMITES_ARGENTINA.latMax &&
  lon >= LIMITES_ARGENTINA.lonMin &&
  lon <= LIMITES_ARGENTINA.lonMax;

const MENSAJES = {
  incompletas: 'Faltan la latitud o la longitud.',
  noNumericas: 'La latitud y la longitud tienen que ser números.',
  invertidas: 'Parecen invertidas: primero va la latitud (≈ -31 en Córdoba) y después la longitud (≈ -64).',
  sinSigno: 'Faltan los signos menos: en Argentina la latitud y la longitud son negativas.',
  fueraDeArgentina: 'Las coordenadas quedan fuera de Argentina.',
};

// Mensaje de error para un par latitud/longitud ya numérico, o null si es un
// punto válido de Argentina. Distingue los errores típicos al copiar de Google
// Maps para poder decir cómo arreglarlos.
function errorDePunto(latitud, longitud) {
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return MENSAJES.noNumericas;
  if (enArgentina(latitud, longitud)) return null;
  if (enArgentina(longitud, latitud)) return MENSAJES.invertidas;
  if (enArgentina(-Math.abs(latitud), -Math.abs(longitud)) || enArgentina(-Math.abs(longitud), -Math.abs(latitud))) {
    return MENSAJES.sinSigno;
  }
  return MENSAJES.fueraDeArgentina;
}

// Para el body de la API: { latitud, longitud } opcionales, pero juntas.
//  - { coordenadas: null } si no vino ninguna (la ubicación queda sin ubicar).
//  - { coordenadas: { latitud, longitud } } si son válidas.
//  - { error } si vino una sola, no son números o caen fuera de Argentina.
// Acepta números o strings numéricos ("-31.42"); nunca strings vacíos.
function leerCoordenadas({ latitud, longitud } = {}) {
  const vacia = (v) => v === undefined || v === null || v === '';
  if (vacia(latitud) && vacia(longitud)) return { coordenadas: null };
  if (vacia(latitud) || vacia(longitud)) return { error: MENSAJES.incompletas };

  const aNumero = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const lat = aNumero(latitud);
  const lon = aNumero(longitud);
  const error = errorDePunto(lat, lon);
  return error ? { error } : { coordenadas: { latitud: lat, longitud: lon } };
}

module.exports = { leerCoordenadas, errorDePunto, enArgentina, LIMITES_ARGENTINA, MENSAJES };
