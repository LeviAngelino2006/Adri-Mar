import api from './api';

export function listarTiposArreglo() {
  return api.get('/mantenimientos/tipos-arreglo');
}

// Estado del service de cada vehículo no dado de baja (SIN_PLAN si no tiene plan).
export function listarEstadoService() {
  return api.get('/mantenimientos/planes');
}

export function asignarPlan(datos) {
  return api.post('/mantenimientos/planes', datos);
}

export function registrarService(datos) {
  return api.post('/mantenimientos/services', datos);
}

export function registrarArreglo(datos) {
  return api.post('/mantenimientos/arreglos', datos);
}

// Los filtros vacíos no se mandan.
export function listarHistorial(filtros = {}) {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== '' && valor != null));
  return api.get('/mantenimientos/historial', { params });
}

export function evaluarAdvertenciaViaje({ vehiculoId, kilometrosEstimados }) {
  return api.get('/mantenimientos/evaluar-viaje', {
    params: { vehiculoId, kilometrosEstimados },
  });
}
