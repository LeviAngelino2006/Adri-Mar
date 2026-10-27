// IVA de los presupuestos: el único lugar donde están la alícuota y la
// aclaración que va debajo del importe. La usan el formulario, la ficha y el
// PDF (que también se arma en el front, con @react-pdf/renderer). No se
// calcula ni se muestra el precio con IVA: solo se aclara que se suma.

export const ALICUOTA_IVA = 10.5;

// "10,5": el porcentaje como se escribe en el texto.
const ALICUOTA_TEXTO = ALICUOTA_IVA.toLocaleString('es-AR', { maximumFractionDigits: 2 });

export const ACLARACION_IVA = `Si es con factura, el precio es más IVA del ${ALICUOTA_TEXTO}%.`;
