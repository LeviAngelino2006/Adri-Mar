Tarjeta de un documento en la ficha de un vehículo o chofer (pantalla Documentación). Una por tipo de documento, apiladas dentro de la sección "Con vencimiento" o "Sin vencimiento" según el tipo. Patrón de página (`TarjetaDocumento.jsx`, `Documentacion.jsx`).

## Anatomía
- `.doc-tarjeta`: `color-surface`, borde `color-border`, `radius-md`, `shadow-sm` y padding `space-4`. Entre tarjetas, gap `space-3`. Es un flex con wrap: a la izquierda la información (`flex: 999 1 260px`) y a la derecha las acciones (`justify-content: flex-end`, gap `space-2`).
- Nombre del documento: la etiqueta de `constants/tiposDocumento.js` en 600 (si el tipo no está en la constante se muestra su código), con un `EstadoBadge` sm al lado.
- Línea de fechas debajo: 14px, `color-text-secondary` y números tabulares.

## Estado del documento
| Estado | Tono |
| --- | --- |
| Vigente | `success` |
| Por vencer | `warning` |
| Vencido | `error` |
| Pendiente | `neutral` |

"Por vencer" depende del tipo: cada tipo de documento tiene sus días de aviso (5 para el comprobante de pago del seguro, 30 para el resto).

## Línea de fechas
- Vigente con vencimiento: "Vence el 22 dic 2026".
- Por vencer: "Vence el 13 oct 2026, en 4 días"; el mismo día, "Vence hoy, 13 oct 2026".
- Vencido: "Venció el 02 oct 2026, hace 7 días", en `state-error-text` y 600.
- Sin vencimiento: "Cargado el 12 mar 2026".
- Tipo sin PDF: se suma " · Solo se registra la vigencia".
- Pendiente: "Todavía no se cargó".
- Las fechas son días de calendario en hora de Córdoba y llevan siempre el año.

## Acciones
Todas `Button` secondary, en este orden:
1. "Ver PDF", solo si el documento tiene archivo. Pide la URL firmada en el momento de tocar (dura 5 minutos).
2. "Actualizar": carga una versión nueva que pasa a ser la vigente; la anterior queda en el historial.
3. "Historial", solo si hay más de una versión (se conservan la vigente y hasta dos anteriores).

Un documento pendiente tiene un solo `Button` primary, "Cargar documento".

## Reglas
- No hay "Eliminar": una carga equivocada se corrige con "Actualizar".
- En un vehículo dado de baja o un chofer inactivo la ficha es de solo consulta: no se muestran "Actualizar" ni "Cargar documento", y un `Alert` info lo avisa arriba de las secciones. "Ver PDF" e "Historial" se mantienen.
- Por debajo de 480px las acciones ocupan todo el ancho de la tarjeta y cada botón usa `flex: 1`.
- Cada botón mide al menos 44px de alto, como todo control (ver `Button`).
