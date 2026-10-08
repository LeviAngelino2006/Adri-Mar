/**
 * Decodifica y normaliza nombres de archivos subidos para corregir mojibake
 * (por ejemplo caracteres con tilde codificados en latin1 como 'GuiÌa' -> 'Guía').
 */
export function formatearNombreArchivo(nombre) {
  if (!nombre) return '';
  try {
    if (/[\u0080-\u00FF]/.test(nombre)) {
      const bytes = new Uint8Array([...nombre].map((c) => c.charCodeAt(0)));
      return new TextDecoder('utf-8').decode(bytes).normalize('NFC');
    }
  } catch {
    // Si falla la decodificación, continúa con el fallback
  }
  return String(nombre).normalize('NFC');
}
