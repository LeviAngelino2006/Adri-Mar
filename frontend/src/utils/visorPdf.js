// Reglas puras del visor de PDF (zoom y páginas). El componente es VisorPdf.jsx.

// El zoom es un porcentaje del ancho ajustado al área: 100 es "Ajustar al ancho".
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_PASO = 25;
export const ZOOM_AJUSTADO = 100;

// Relación alto/ancho que se reserva para una página que todavía no se midió (A4).
export const RELACION_PAGINA_POR_DEFECTO = 1.4142;

// Sube (+1) o baja (-1) un paso de zoom sin salirse de [ZOOM_MIN, ZOOM_MAX].
export function cambiarZoom(actual, direccion) {
  const siguiente = actual + direccion * ZOOM_PASO;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, siguiente));
}

// Página válida (1..total) más cercana a `numero`.
export function limitarPagina(numero, total) {
  return Math.min(Math.max(1, total), Math.max(1, numero));
}

// Página destino de una tecla del visor (flecha izquierda/derecha), o null si la
// tecla no cambia de página. Con teclas modificadoras no hace nada, para no pisar
// los atajos del navegador (Alt + flecha es Atrás/Adelante).
export function paginaPorTecla({ key, altKey, ctrlKey, metaKey, shiftKey }, actual, total) {
  if (altKey || ctrlKey || metaKey || shiftKey || !total) return null;
  if (key === 'ArrowLeft') return limitarPagina(actual - 1, total);
  if (key === 'ArrowRight') return limitarPagina(actual + 1, total);
  return null;
}

// De las alturas visibles de cada página (número de página → píxeles), la que
// más se ve; si hay empate, la primera. Devuelve null si no se ve ninguna.
export function paginaMasVisible(alturasVisibles) {
  let mejor = null;
  let mejorAltura = 0;
  for (const [pagina, altura] of alturasVisibles) {
    if (altura > mejorAltura || (altura === mejorAltura && altura > 0 && pagina < mejor)) {
      mejor = pagina;
      mejorAltura = altura;
    }
  }
  return mejor;
}

// Texto de la barra: "1 de 3" (o un guion mientras se carga el documento).
export function textoPagina(actual, total) {
  return total ? `${actual} de ${total}` : '–';
}
