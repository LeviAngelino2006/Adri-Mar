import api from './api';

// Hasta 5 sugerencias de Google Maps para el texto (Places API, del lado del
// backend): { sugerencias: [{ placeId, textoPrincipal, textoSecundario }] }.
export function sugerenciasGoogle(texto, sessionToken) {
  return api.get('/ubicaciones/sugerencias-google', { params: { texto, sessionToken } });
}

// Crea (o devuelve, si ese lugar ya está) la ubicación de una sugerencia de
// Google. frecuente false = PARTICULAR (la casa de un pasajero). nombre: el
// texto principal de la sugerencia, que se usa si se guarda como frecuente.
export function crearDesdeGoogle({ placeId, sessionToken, frecuente, nombre }) {
  return api.post('/ubicaciones/desde-google', { placeId, sessionToken, frecuente, nombre });
}

// Ubica con Google una ubicación existente que no está en el mapa.
export function ubicarDesdeGoogle(id, { placeId, sessionToken }) {
  return api.put(`/ubicaciones/${id}/ubicar-desde-google`, { placeId, sessionToken });
}
