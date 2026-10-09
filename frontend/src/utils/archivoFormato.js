/**
 * Normaliza nombres de archivos subidos y repara secuencias de mojibake
 * (por ejemplo caracteres con tilde codificados en latin1 como 'GuiÌa' -> 'Guía').
 * Si el texto ya tiene tildes válidas en UTF-8 (como 'Guía'), lo respeta intacto.
 */
export function formatearNombreArchivo(nombre) {
  if (!nombre) return '';
  // Solo repara si contiene patrones específicos de doble codificación (mojibake)
  if (/[\u00C2-\u00C3\u00CC][\u0080-\u00BF]|\x81/.test(nombre)) {
    try {
      const bytes = new Uint8Array([...nombre].map((c) => c.charCodeAt(0) & 0xff));
      const dec = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return dec.normalize('NFC');
    } catch {
      // Si fatal=true falla, no era una secuencia válida; devuelve el texto normalizado
    }
  }
  return String(nombre).normalize('NFC');
}
