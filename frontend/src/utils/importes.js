// Importes de los presupuestos en CENTAVOS ENTEROS: nunca se suma ni se
// multiplica plata con floats (0.1 + 0.2 !== 0.3). La API devuelve los Decimal
// como string con 2 decimales ("420000.00"); acá se pasan a enteros cortando el
// string, sin parseFloat. La cuenta del precio con IVA está en ivaPresupuesto.js.

// Formato de la API: punto decimal y nada más ("420000.00", "1234").
const IMPORTE_API_REGEX = /^(\d+)(?:\.(\d{1,2}))?$/;

// Formato que tipea el usuario (es-AR), con regex estricta:
//  - dígitos solos: "420000", y con coma decimal: "420000,50";
//  - con puntos de miles: "420.000", "420.000,50", "1.234.567,5" (el primer
//    grupo de 1 a 3 dígitos y después grupos de exactamente 3).
// Cualquier otra cosa es inválida: "420.00" o "42.0000" (punto que no separa
// miles), "1234.56" (punto decimal), "420.000,123" (3 decimales).
const IMPORTE_INGRESADO_REGEX = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;

function centavosDe(enteros, decimales = '') {
  return Number(enteros.replaceAll('.', '')) * 100 + Number(decimales.padEnd(2, '0'));
}

// Importe de la API ("420000.00") o número → centavos (42000000). null si no
// es un importe válido.
export function aCentavos(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) return null;
    // toFixed(2) redondea el float al centavo más cercano antes de cortar.
    return aCentavos(valor.toFixed(2));
  }
  if (typeof valor !== 'string') return null;
  const coincidencia = IMPORTE_API_REGEX.exec(valor.trim());
  return coincidencia ? centavosDe(coincidencia[1], coincidencia[2]) : null;
}

// Lo que tipeó el usuario en el campo Importe ("420.000,50") → centavos
// (42000050). null si no respeta el formato (ver IMPORTE_INGRESADO_REGEX).
export function importeIngresadoACentavos(texto) {
  if (typeof texto !== 'string') return null;
  const coincidencia = IMPORTE_INGRESADO_REGEX.exec(texto.trim());
  return coincidencia ? centavosDe(coincidencia[1], coincidencia[2]) : null;
}

// Centavos → texto para precargar el campo Importe al duplicar, en el mismo
// formato que acepta importeIngresadoACentavos: "420.000", "1.234,50" (dos
// decimales si tiene centavos, igual que formatearPesos).
export function centavosAImporteIngresado(centavos) {
  const enteros = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavosSueltos = centavos % 100;
  return centavosSueltos === 0 ? enteros : `${enteros},${String(centavosSueltos).padStart(2, '0')}`;
}

// Centavos → string para la API ("123456" → "1234.56"). El backend lo guarda
// en un Decimal(12,2) sin pasar por Number.
export function centavosAString(centavos) {
  const texto = String(centavos).padStart(3, '0');
  return `${texto.slice(0, -2)}.${texto.slice(-2)}`;
}
