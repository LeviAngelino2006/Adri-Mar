// ¿Hay otro viaje En viaje que impide comenzar este? Es el mismo chequeo que
// hace viajeService.comenzarViaje (vehículo y chofer con otro viaje EN_VIAJE),
// adelantado en el front para no dejar cargar el odómetro de un viaje que el
// backend va a rechazar. El backend sigue siendo la garantía: si acá no se sabe
// (por ejemplo, porque no se pudieron cargar los viajes en curso), el botón queda
// habilitado y responde él.
//
// `enCurso` son los viajes EN_VIAJE que la pantalla conoce. Devuelve
// { viaje, motivo: 'chofer' | 'vehiculo' } con el viaje que bloquea, o null.
// Se mira primero el chofer: es lo que el chofer puede resolver (terminar su
// viaje), y el backend rechaza igual cualquiera de los dos.
export function viajeEnCursoQueBloquea(viaje, enCurso = []) {
  if (!viaje || viaje.estado !== 'PROGRAMADO') return null;
  const otros = enCurso.filter((v) => v.id !== viaje.id && v.estado === 'EN_VIAJE');

  const choferId = viaje.choferId ?? viaje.chofer?.id;
  const delChofer = choferId != null && otros.find((v) => (v.choferId ?? v.chofer?.id) === choferId);
  if (delChofer) return { viaje: delChofer, motivo: 'chofer' };

  const vehiculoId = viaje.vehiculoId ?? viaje.vehiculo?.id;
  const delVehiculo = vehiculoId != null && otros.find((v) => (v.vehiculoId ?? v.vehiculo?.id) === vehiculoId);
  if (delVehiculo) return { viaje: delVehiculo, motivo: 'vehiculo' };

  return null;
}

export const MOTIVOS_BLOQUEO_COMENZAR = {
  chofer: 'Terminá el viaje en curso antes de comenzar otro.',
  vehiculo: 'El vehículo está en otro viaje en curso. Tiene que terminar antes de comenzar este.',
};
