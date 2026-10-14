import { formatearNombreArchivo } from './archivoFormato';

// Descarga un PDF a partir de su URL firmada. Es la única función de descarga
// de la documentación: aplica siempre formatearNombreArchivo al nombre y, si el
// navegador no deja bajarlo como blob, abre el PDF en una pestaña nueva.
// `nombreArchivo` es el del documento; `codigoTipo` (tipo.descripcion) sirve de
// nombre de respaldo cuando el documento no tiene nombre guardado.
export async function descargarPdf(url, { nombreArchivo, codigoTipo } = {}) {
  const nombre = formatearNombreArchivo(nombreArchivo) || `${codigoTipo || 'documento'}.pdf`;
  try {
    const respuesta = await fetch(url);
    const blob = await respuesta.blob();
    const enlaceBlob = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = enlaceBlob;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(enlaceBlob);
    document.body.removeChild(a);
  } catch {
    window.open(url, '_blank');
  }
}
