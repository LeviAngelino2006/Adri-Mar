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

export async function eliminarDocumentoVehiculo(vehiculoId, documentoId) {
  const { data } = await api.delete(`/documentos/vehiculos/${vehiculoId}/${documentoId}`);
  return data;
}

export async function eliminarDocumentoChofer(choferId, documentoId) {
  const { data } = await api.delete(`/documentos/choferes/${choferId}/${documentoId}`);
  return data;
}
