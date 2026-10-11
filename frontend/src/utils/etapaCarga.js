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
