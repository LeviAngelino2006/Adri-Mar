// Etapas del estado de carga (componente Cargando): nada al principio para que
// una respuesta rápida no parpadee, después un esqueleto y, si tarda, el
// colectivo con "Conectando con el servidor…" (el backend en Render tarda en
// arrancar después de un rato sin uso).

export const UMBRAL_ESQUELETO_MS = 300;
export const UMBRAL_LENTO_MS = 3000;

// Etapa que corresponde a `ms` milisegundos desde que empezó la carga.
export function etapaPorTiempo(ms) {
  if (ms >= UMBRAL_LENTO_MS) return 'lento';
  if (ms >= UMBRAL_ESQUELETO_MS) return 'esqueleto';
  return 'oculto';
}

// Un solo colectivo por pantalla: cada Cargando que llega a 'lento' suma 1 a un
// contador del Layout y resta 1 al salir de esa etapa o al desmontarse. El
// Layout muestra el colectivo mientras el contador es mayor que 0.

// Reducer del contador. Nunca baja de 0.
export function contarCargasLentas(cantidad, accion) {
  if (accion === 'sumar') return cantidad + 1;
  if (accion === 'restar') return Math.max(0, cantidad - 1);
  return cantidad;
}

// Cuerpo del efecto de Cargando: si está lento, suma, y devuelve la limpieza que
// resta (React la llama al salir de 'lento' y al desmontar).
export function avisarCargaLenta(lento, sumar, restar) {
  if (!lento || !sumar || !restar) return undefined;
  sumar();
  return restar;
}
