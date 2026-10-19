// Lógica del buscador de direcciones de Google (sin React, para poder testearla
// con node:test). Las sugerencias las pide el backend
// (GET /ubicaciones/sugerencias-google): la key nunca llega al navegador.

// Desde cuántas letras se le pregunta a Google, y cuánto se espera después de
// la última tecla (cada sugerencia se cobra hasta que se elige una).
export const MIN_LETRAS_GOOGLE = 3;
export const DEMORA_GOOGLE_MS = 300;

export function debeBuscarEnGoogle(texto) {
  return String(texto ?? '').trim().length >= MIN_LETRAS_GOOGLE;
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Token de sesión de Google: un UUID por búsqueda, que se renueva después de
// elegir un lugar. Agrupa las sugerencias con el detalle que las cierra, y así
// Google no cobra cada tecla por separado. randomUUID solo existe en contextos
// seguros (https o localhost); si no está, se arma un UUID v4 con
// getRandomValues, que sí existe siempre.
export function nuevoSessionToken(cripto = globalThis.crypto) {
  if (typeof cripto?.randomUUID === 'function') return cripto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cripto?.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Mensaje para el usuario a partir del error de axios. El backend manda
// { error } (503 sin key, cuota, 409 lugar repetido…) o { errores } por campo.
export function mensajeErrorGoogle(err) {
  const datos = err?.response?.data;
  if (datos?.error) return datos.error;
  if (datos?.errores) {
    const mensajes = Object.values(datos.errores).filter(Boolean);
    if (mensajes.length > 0) return mensajes.join('. ');
  }
  if (!err?.response) return 'No se pudo conectar con el servidor.';
  return 'No se pudo buscar en Google Maps.';
}

// El lugar en el mapa de una ubicación elegida ({ id, nombre, placeId,
// latitud, longitud }): lo que necesita el link al recorrido.
export function lugarDe(ubicacion) {
  if (!ubicacion) return null;
  return { placeId: ubicacion.placeId ?? null, latitud: ubicacion.latitud ?? null, longitud: ubicacion.longitud ?? null };
}
