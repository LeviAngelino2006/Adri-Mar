// Importes de los presupuestos en CENTAVOS ENTEROS: nunca se suma ni se
// multiplica plata con floats (0.1 + 0.2 !== 0.3). La API devuelve los Decimal
// como string con 2 decimales ("420000.00", "10.50"); acá se pasan a enteros
// cortando el string, sin parseFloat.

const IMPORTE_REGEX = /^(\d+)(?:[.,](\d{1,2}))?$/;

// "420000.00" | "1234,5" | "1234" | 1234.56 → centavos (123456). null si no es
// un importe válido (vacío, negativo, más de 2 decimales, separadores de miles).
// Acepta coma decimal porque es lo que tipea el usuario en es-AR.
export function aCentavos(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) return null;
    // toFixed(2) redondea el float al centavo más cercano antes de cortar.
    return aCentavos(valor.toFixed(2));
  }
  if (typeof valor !== 'string') return null;
  const coincidencia = IMPORTE_REGEX.exec(valor.trim());
  if (!coincidencia) return null;
  const [, enteros, decimales = ''] = coincidencia;
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

// Centavos → string para la API ("123456" → "1234.56"). El backend lo guarda
// en un Decimal(12,2) sin pasar por Number.
export function centavosAString(centavos) {
  const texto = String(centavos).padStart(3, '0');
  return `${texto.slice(0, -2)}.${texto.slice(-2)}`;
}

// Alícuota "10.50" → 1050 (centésimos de punto porcentual), para operar en enteros.
function alicuotaEnCentesimos(alicuotaIva) {
  const centesimos = aCentavos(typeof alicuotaIva === 'number' ? alicuotaIva : String(alicuotaIva ?? ''));
  if (centesimos === null) throw new Error(`Alícuota de IVA inválida: ${alicuotaIva}`);
  return centesimos;
}

// La única cuenta de importes del presupuesto: la usan el formulario (desglose
// en vivo), el listado (total) y el PDF. Devuelve centavos enteros.
//
//   iva = Math.round(neto × alícuota / 100), con la alícuota en centésimos
//   (10,50% → 1050) para que el producto sea entero y exacto: neto × 1050 / 10000.
//   total = neto + iva. Con recibo, iva = 0 y total = neto.
//
// `importeNeto` y `alicuotaIva` pueden venir como los string de la API o como
// número. Un importe inválido devuelve todo en null (el formulario lo usa
// mientras el usuario está tipeando).
export function calcularImportes({ importeNeto, conFactura, alicuotaIva }) {
  const neto = aCentavos(importeNeto);
  if (neto === null) return { neto: null, iva: null, total: null };
  const iva = conFactura ? Math.round((neto * alicuotaEnCentesimos(alicuotaIva)) / 10000) : 0;
  return { neto, iva, total: neto + iva };
}

// "10.50" → "10,5%": la etiqueta de la fila de IVA ("IVA 10,5%").
export function formatearAlicuota(alicuotaIva) {
  const centesimos = alicuotaEnCentesimos(alicuotaIva);
  const texto = (centesimos / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return `${texto}%`;
}
