// Estado de la documentación completa de un vehículo o chofer (la que muestran
// el listado y el encabezado de la ficha). Lo calcula el backend; el orden es el
// de las opciones del filtro "Estado".
export const ESTADOS_DOCUMENTACION = {
  VENCIDA: { label: 'Vencida', tono: 'error' },
  POR_VENCER: { label: 'Por vencer', tono: 'warning' },
  INCOMPLETA: { label: 'Incompleta', tono: 'neutral' },
  AL_DIA: { label: 'Al día', tono: 'success' },
};

// Estado de un documento puntual (la tarjeta de la ficha).
export const ESTADOS_DOCUMENTO = {
  VIGENTE: { label: 'Vigente', tono: 'success' },
  POR_VENCER: { label: 'Por vencer', tono: 'warning' },
  VENCIDO: { label: 'Vencido', tono: 'error' },
  PENDIENTE: { label: 'Pendiente', tono: 'neutral' },
};
