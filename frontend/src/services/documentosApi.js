import api from './api';

export async function obtenerAlertasVencimientos() {
  const { data } = await api.get('/documentos/alertas');
  return data;
}

// URL firmada (5 minutos) del PDF de una versión. Se pide en el momento de ver
// o descargar el archivo: así no vence con la página abierta.
export async function obtenerUrlArchivo(documentoId) {
  const { data } = await api.get(`/documentos/${documentoId}/archivo`);
  return data.url;
}
