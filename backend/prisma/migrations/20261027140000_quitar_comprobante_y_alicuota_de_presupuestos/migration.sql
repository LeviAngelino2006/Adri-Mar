-- Los presupuestos ya no eligen tipo de comprobante (con factura / con recibo).
-- La pantalla y el PDF muestran siempre, debajo del importe, la aclaración "Si
-- es con factura, el precio es más IVA del 10,5%." y el precio con IVA, que el
-- front calcula a partir de importe_neto cada vez que lo muestra (no se guarda).
--
-- - con_factura: el tipo de comprobante elegido.
-- - alicuota_iva: solo servía para el desglose con factura. El backend la fijaba
--   siempre en 10.50 (el cliente no la podía cambiar), así que no se pierde
--   información. La alícuota queda en un solo lugar:
--   frontend/src/utils/ivaPresupuesto.js.
--
-- No hay enums que eliminar: con_factura era BOOLEAN.

-- AlterTable
ALTER TABLE "presupuestos" DROP COLUMN "alicuota_iva",
DROP COLUMN "con_factura";
