import api from './api';

export function listarPresupuestos({ cliente } = {}) {
  return api.get('/presupuestos', { params: cliente ? { cliente } : undefined });
}

export function obtenerPresupuesto(id) {
  return api.get(`/presupuestos/${id}`);
}

export function crearPresupuesto(datos) {
  return api.post('/presupuestos', datos);
}
