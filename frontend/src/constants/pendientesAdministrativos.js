// Badge de lo que le falta cargar a un viaje en lo administrativo. El valor lo
// calcula el backend (viaje.pendienteAdministrativo, ver viajeService) y solo
// lo manda a Administrador/Encargado; acá vive solo la etiqueta visible.
export const PENDIENTES_ADMINISTRATIVOS = {
  SIN_PRECIO: { label: 'Sin precio', tono: 'warning' },
  COBRO_PENDIENTE: { label: 'Cobro pendiente', tono: 'warning' },
};
