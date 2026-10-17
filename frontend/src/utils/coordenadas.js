// Coordenadas pegadas desde Google Maps (click derecho sobre el mapa → copiar
// coordenadas da "-31.4201, -64.1888": latitud primero). Réplica de la
// validación del backend (backend/src/utils/coordenadas.js, mismos casos en los
// tests de los dos) para avisar mientras se escribe; la que manda es la del
// backend. Si cambia una, cambiar la otra.

// Argentina continental (incluye Tierra del Fuego y Malvinas). Un rectángulo
// alcanza: lo que se quiere atajar son errores al pegar, no fronteras exactas.
export const LIMITES_ARGENTINA = { latMin: -55.2, latMax: -21.7, lonMin: -73.7, lonMax: -53.5 };

const enArgentina = (lat, lon) =>
  lat >= LIMITES_ARGENTINA.latMin &&
  lat <= LIMITES_ARGENTINA.latMax &&
  lon >= LIMITES_ARGENTINA.lonMin &&
  lon <= LIMITES_ARGENTINA.lonMax;

export const MENSAJES_COORDENADAS = {
  formato: 'Pegalas como las copia Google Maps: -31.4201, -64.1888',
  noNumericas: 'La latitud y la longitud tienen que ser números.',
  invertidas: 'Parecen invertidas: primero va la latitud (≈ -31 en Córdoba) y después la longitud (≈ -64).',
  sinSigno: 'Faltan los signos menos: en Argentina la latitud y la longitud son negativas.',
  fueraDeArgentina: 'Las coordenadas quedan fuera de Argentina.',
};

// Mensaje de error para un par ya numérico, o null si es un punto de Argentina.
export function errorDePunto(latitud, longitud) {
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return MENSAJES_COORDENADAS.noNumericas;
  if (enArgentina(latitud, longitud)) return null;
  if (enArgentina(longitud, latitud)) return MENSAJES_COORDENADAS.invertidas;
  if (enArgentina(-Math.abs(latitud), -Math.abs(longitud)) || enArgentina(-Math.abs(longitud), -Math.abs(latitud))) {
    return MENSAJES_COORDENADAS.sinSigno;
  }
  return MENSAJES_COORDENADAS.fueraDeArgentina;
}

// Dos números con punto decimal, separados por coma, punto y coma o espacios,
// opcionalmente entre paréntesis.
const NUMERO = '([-+]?\\d+(?:\\.\\d+)?)';
const FORMATO = new RegExp(`^\\(?\\s*${NUMERO}\\s*(?:[,;]\\s*|\\s+)${NUMERO}\\s*\\)?$`);

// Texto pegado → { latitud, longitud } | { error } | { vacio: true }.
export function parsearCoordenadas(texto) {
  // El signo menos tipográfico (−) que a veces aparece al copiar de otro lado.
  const limpio = String(texto ?? '').replace(/−/g, '-').trim();
  if (!limpio) return { vacio: true };

  const coincidencia = limpio.match(FORMATO);
  if (!coincidencia) return { error: MENSAJES_COORDENADAS.formato };

  const latitud = Number(coincidencia[1]);
  const longitud = Number(coincidencia[2]);
  const error = errorDePunto(latitud, longitud);
  return error ? { error } : { latitud, longitud };
}

// Link para mirar un punto en Google Maps (sin API key).
export function urlPuntoGoogleMaps({ latitud, longitud }) {
  return `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`;
}
