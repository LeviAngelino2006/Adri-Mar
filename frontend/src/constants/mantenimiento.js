// Mantenimiento (ver docs/design-system/componentes/Mantenimiento.md).

// Lo que incluye siempre el service: es un paquete fijo. El modal "Registrar
// service" lo muestra en una oración, debajo de la observación (ver
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

export const VISTAS_MANTENIMIENTO = [
  { valor: 'service', etiqueta: 'Service' },
  { valor: 'arreglos', etiqueta: 'Arreglos' },
  { valor: 'historial', etiqueta: 'Historial' },
];

export const ORDENES_SERVICE = [
  { value: 'urgencia', label: 'Más urgente' },
  { value: 'interno', label: 'Número de interno' },
  { value: 'tipo', label: 'Tipo de vehículo' },
  { value: 'km', label: 'Km desde el último service' },
];

export const TIPOS_REGISTRO = [
  { value: '', label: 'Todos' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'ARREGLO', label: 'Arreglos' },
];

// Los valores son los `orden` que acepta GET /mantenimientos/historial.
export const ORDENES_HISTORIAL = [
  { value: 'fecha_desc', label: 'Más reciente' },
  { value: 'fecha_asc', label: 'Más antiguo' },
  { value: 'interno', label: 'Número de interno' },
  { value: 'km_desc', label: 'Km' },
];

export const POR_PAGINA_HISTORIAL = 30;

// Mismos topes que valida el backend (mantenimientoService). Acá solo
// alimentan los contadores y la validación previa: el que rechaza es el backend.
export const MAX_TEXTO_MANTENIMIENTO = 500;
// "¿Qué trabajo?" de "Otro" (va en el badge del historial).
export const MAX_DETALLE_TIPO = 60;
