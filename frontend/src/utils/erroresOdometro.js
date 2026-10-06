// Errores 400 de comenzar/finalizar un viaje, listos para mostrar en el modal
// de odómetro. El backend rechaza el odómetro con la clave `valorKm` (viene de
// lecturaOdometroService), pero el modal muestra el error en el campo
// `odometroInicial` / `odometroFinal`: se remapea. Cualquier otra clave que el
// modal no muestre en un campo (por ejemplo `vehiculoId`) se junta en `general`
// para que un rechazo nunca quede en silencio.
export function normalizarErroresOdometro(errores, campo) {
  const mostradas = [campo, 'observacion'];
  const normalizados = {};
  const sinMostrar = [];

  for (const [clave, mensaje] of Object.entries(errores)) {
    const destino = clave === 'valorKm' ? campo : clave;
    if (mostradas.includes(destino)) {
      normalizados[destino] ??= mensaje;
    } else {
      sinMostrar.push(mensaje);
    }
  }

  if (sinMostrar.length > 0) {
    normalizados.general = sinMostrar.join(' ');
  }
  return normalizados;
}
