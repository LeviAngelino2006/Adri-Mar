import api from './api';

export function listarPlantillas() {
  return api.get('/mantenimientos/plantillas');
}

export function listarPlanesYAlertas({ soloAlertas = false, busqueda = '' } = {}) {
  const params = {};
  if (soloAlertas) params.soloAlertas = 'true';
  if (busqueda && busqueda.trim()) params.busqueda = busqueda.trim();
  return api.get('/mantenimientos/planes', { params });
}

export function asignarPlan(datos) {
  return api.post('/mantenimientos/planes', datos);
}

export function registrarMantenimiento(datos) {
  return api.post('/mantenimientos/realizados', datos);
}

export function obtenerHistorialVehiculo(vehiculoId, { categoria } = {}) {
  const params = {};
  if (categoria) params.categoria = categoria;
  return api.get(`/mantenimientos/vehiculos/${vehiculoId}/historial`, { params });
}

export function evaluarAdvertenciaViaje({ vehiculoId, kilometrosEstimados }) {
  return api.get('/mantenimientos/evaluar-viaje', {
    params: { vehiculoId, kilometrosEstimados },
  });
}
