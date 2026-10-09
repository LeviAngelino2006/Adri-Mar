import api from './api';

export function comenzarViaje(id, odometroInicial) {
  return api.patch(`/viajes/${id}/comenzar`, { odometroInicial });
}

export function finalizarViaje(id, odometroFinal, observacion) {
  return api.patch(`/viajes/${id}/finalizar`, { odometroFinal, observacion });
}

export function confirmarViaje(id, datos) {
  return api.patch(`/viajes/${id}/confirmar`, datos);
}

export function actualizarDatosAdministrativos(id, datos) {
  return api.patch(`/viajes/${id}/datos-administrativos`, datos);
}
