import api from './api';

// Hasta 5 lugares del mapa (OpenRouteService, del lado del backend) para el
// texto: { candidatos: [{ etiqueta, latitud, longitud }] }.
export function buscarEnMapa(texto) {
  return api.get('/ubicaciones/buscar-en-mapa', { params: { texto } });
}

// Ubica en el mapa una ubicación existente (o corrige su punto).
export function ubicarEnMapa(id, { latitud, longitud }) {
  return api.put(`/ubicaciones/${id}/coordenadas`, { latitud, longitud });
}
