import api from './api';

export function obtenerReporteKmPorVehiculo({ desde, hasta } = {}) {
  const params = {};
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  return api.get('/reportes/km-por-vehiculo', { params });
}
