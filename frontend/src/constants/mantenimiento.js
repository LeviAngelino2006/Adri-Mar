// Mantenimiento (ver docs/design-system/componentes/Mantenimiento.md).

// Lo que incluye siempre el service: es un paquete fijo. El formulario
// "Registrar service" lo muestra en una oración, como ayuda de la observación (ver
// textoIncluyeService); no se tilda. Si algún día cambia, se cambia acá.
export const TAREAS_SERVICE = [
  'Cambio de aceite',
  'Filtros de gasoil, aceite y habitáculo (aire acondicionado)',
  'Alineado y balanceado',
  'Revisión general del motor',
];

// Arreglos: cuánto se espera sin teclear el km para preguntar si es un
// arreglo anterior (debounce).
export const DEMORA_KM_MS = 700;

// Estado del service de un vehículo (calcularEstadoService en el backend).
export const ESTADOS_SERVICE = {
  VENCIDO: { label: 'Vencido', tono: 'error' },
  PROXIMO: { label: 'Próximo', tono: 'warning' },
  AL_DIA: { label: 'Al día', tono: 'success' },
  SIN_PLAN: { label: 'Sin plan', tono: 'neutral' },
};

export const ORDENES_SERVICE = [
  { value: 'urgencia', label: 'Más urgente' },
  { value: 'interno', label: 'Número de interno' },
  { value: 'tipo', label: 'Tipo de vehículo' },
  { value: 'km', label: 'Km desde el último service' },
];

// Historial de un vehículo en su panel: de a 10, con "Ver más".
export const POR_PAGINA_HISTORIAL = 10;

// Mismos topes que valida el backend (mantenimientoService). Acá solo
// alimentan los contadores y la validación previa: el que rechaza es el backend.
export const MAX_TEXTO_MANTENIMIENTO = 500;
// "¿Qué trabajo?" de "Otro" (va en el badge del historial).
export const MAX_DETALLE_TIPO = 60;
