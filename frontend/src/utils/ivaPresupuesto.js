// IVA de los presupuestos: el único lugar donde están la alícuota, la
// aclaración que va debajo del importe y la cuenta del precio con IVA. Lo usan
// el formulario, la ficha y el PDF (que también se arma en el front, con
// @react-pdf/renderer). El precio con IVA no se guarda en la base: se calcula
// del importe cada vez que se muestra.
import { formatearPesosConCentavos } from './moneda.js';

export const ALICUOTA_IVA = 10.5;

// 10,5% → 1050 (centésimos de punto porcentual), para que la cuenta sea entera.
const ALICUOTA_EN_CENTESIMOS = Math.round(ALICUOTA_IVA * 100);

// "10,5": el porcentaje como se escribe en los textos.
const ALICUOTA_TEXTO = ALICUOTA_IVA.toLocaleString('es-AR', { maximumFractionDigits: 2 });

export const ACLARACION_IVA = `Si es con factura, el precio es más IVA del ${ALICUOTA_TEXTO}%.`;

// Importe en centavos enteros → precio con IVA en centavos enteros, redondeado
// al centavo (el medio centavo, para arriba):
//
//   conIva = importe + Math.round(importe × 1050 / 10000)
//
// El producto es entero y exacto (hasta el importe máximo, 9.999.999.999,99,
// queda lejos de 2^53), así que no hay error de punto flotante: 100.000,00
// (10.000.000 centavos) da 11.050.000 centavos, $ 110.500,00 justos.
// null si el importe no es un entero mayor a 0 (vacío o inválido en el formulario).
export function calcularPrecioConIva(centavos) {
  if (!Number.isInteger(centavos) || centavos <= 0) return null;
  return centavos + Math.round((centavos * ALICUOTA_EN_CENTESIMOS) / 10000);
}

// "Con factura: $ 110.500,00 (IVA 10,5% incluido)." La línea que va debajo de
// la aclaración. null si el importe no es válido (no se muestra).
export function textoPrecioConIva(centavos) {
  const conIva = calcularPrecioConIva(centavos);
  if (conIva === null) return null;
  return `Con factura: ${formatearPesosConCentavos(conIva)} (IVA ${ALICUOTA_TEXTO}% incluido).`;
}
