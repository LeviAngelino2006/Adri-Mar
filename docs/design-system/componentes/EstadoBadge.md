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

## Reglas
- Píldora `radius-full`, 600, con un punto de 7px en el color del texto. Cada tono usa su trío `state-*-text` / `-bg` / `-border` (brand: `brand-700` / `brand-50` / `brand-200`); todos superan 4.5:1.
- En tablas y listas densas usá `EstadoDot`, con el mismo color de estado.
