// Cuánto dura en pantalla un Toast (el componente no se oculta solo: lo hace quien
// lo monta). Un toast con una acción para tocar (por ejemplo "Avisar por
// WhatsApp") necesita más tiempo, porque con 3,5 s no da para leerlo y tocarlo.
export const DURACION_TOAST_MS = 3500;
export const DURACION_TOAST_CON_ACCION_MS = 8000;
