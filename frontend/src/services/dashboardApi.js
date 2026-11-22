import api from './api';

export function obtenerIndicadoresDashboard({ periodo = 'mes' } = {}) {
  return api.get('/dashboard/indicadores', { params: { periodo } });
}
