import api from './api';

export async function obtenerAlertasVencimientos() {
  const { data } = await api.get('/documentos/alertas');
  return data;
}

export async function crearDocumentoVehiculo(payload) {
  const { data } = await api.post('/documentos/vehiculos', payload);
  return data;
}

export async function crearDocumentoUsuario(payload) {
  const { data } = await api.post('/documentos/usuarios', payload);
  return data;
}
