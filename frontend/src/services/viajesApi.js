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

// Disponibilidad (informativa, nunca bloquea): para el alta, con lo que el
// formulario tiene en pantalla...
export function consultarDisponibilidad(datos) {
  return api.post('/viajes/disponibilidad', datos);
}

// ...y para un viaje que ya existe. Con `todos` suma a todos los choferes y
// vehículos elegibles, no solo a los candidatos (para "Elegir otro…").
export function disponibilidadDeViaje(id, { todos = false } = {}) {
  return api.get(`/viajes/${id}/disponibilidad`, { params: todos ? { todos: true } : undefined });
}
