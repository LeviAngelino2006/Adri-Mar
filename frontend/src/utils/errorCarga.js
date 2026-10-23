// Mensaje para un error al cargar datos ("los viajes", "los vehículos"). Sin
// respuesta del servidor es un problema de conexión (o el backend no está); con
// respuesta, el servidor falló y no tiene sentido pedir que revisen la conexión.
export function mensajeErrorCarga(error, que) {
  const sinRespuesta = !error?.response;
  return sinRespuesta
    ? `No pudimos cargar ${que}. Revisá tu conexión.`
    : `No pudimos cargar ${que}. Intentá de nuevo en unos minutos.`;
}
