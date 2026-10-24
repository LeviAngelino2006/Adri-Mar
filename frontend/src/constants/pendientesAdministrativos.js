// Lo que le falta cargar a un viaje en lo administrativo, como texto gris en la
// tarjeta (sin badge: el color queda para el estado del viaje). El valor lo
// calcula el backend (viaje.pendienteAdministrativo, ver viajeService) y solo
// lo manda a Administrador/Encargado; acá vive solo la etiqueta visible.
export const PENDIENTES_ADMINISTRATIVOS = {
  SIN_PRECIO: { label: 'Sin precio' },
  COBRO_PENDIENTE: { label: 'Cobro pendiente' },
};
