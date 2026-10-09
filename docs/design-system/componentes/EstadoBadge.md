Pastilla de estado para tarjetas y fichas de detalle, donde el estado es el dato principal.

## Lo que provee quien lo usa
- `tono`: `brand`, `success`, `warning`, `error` o `neutral`.
- `children`: la etiqueta del estado. Siempre presente: el color solo no comunica.
- `size`: `md` (14px, por defecto) en fichas y tarjetas de viaje; `sm` (13px) en tarjetas compactas.

## Tono por estado
| Estado | Tono |
| --- | --- |
| Viaje A confirmar | `neutral` |
| Viaje Programado | `brand` |
| Viaje En viaje | `warning` |
| Viaje Finalizado | `success` |
| Viaje Cancelado | `error` |
| Vehículo Operativo | `success` |
| Vehículo En taller | `warning` |
| Vehículo Dado de baja | `neutral` |
| Documento Vigente | `success` |
| Documento Por vencer | `warning` |
| Documento Vencido | `error` |
| Documento Pendiente | `neutral` |
| Documentación Al día | `success` |
| Documentación Por vencer | `warning` |
| Documentación Vencida | `error` |
| Documentación Incompleta | `neutral` |

## Reglas
- Píldora `radius-full`, 600, con un punto de 7px en el color del texto. Cada tono usa su trío `state-*-text` / `-bg` / `-border` (brand: `brand-700` / `brand-50` / `brand-200`); todos superan 4.5:1.
- La documentación de un vehículo o chofer (listado y encabezado de la ficha) toma el peor estado de sus documentos: Vencida, Por vencer, Incompleta (falta cargar algún tipo) o Al día. Cada documento se muestra con su propio estado en su `TarjetaDocumento`.
- En tablas y listas densas usá `EstadoDot`, con el mismo color de estado.
