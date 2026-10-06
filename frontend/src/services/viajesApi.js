import api from './api';

export function comenzarViaje(id, odometroInicial) {
  return api.patch(`/viajes/${id}/comenzar`, { odometroInicial });
}

export function finalizarViaje(id, odometroFinal) {
  return api.patch(`/viajes/${id}/finalizar`, { odometroFinal });
}

export function confirmarViaje(id, datos) {
  return api.patch(`/viajes/${id}/confirmar`, datos);
}
