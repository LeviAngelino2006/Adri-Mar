Panel del Dashboard de Administrador y Encargado con los viajes A confirmar que hay que resolver hoy y mañana. Los demás perfiles no lo ven.

No está en `bundle.js`: pide los viajes al backend. La vista previa es una representación estática con sus clases CSS.

## Estructura
- `Card` con el título "Viajes por confirmar" (`h2`), arriba de los viajes propios del chofer en el Dashboard.
- Dos grupos con subtítulo **Hoy** y **Mañana** (13px, 600, mayúsculas, `color-text-secondary`, como los títulos de sección de la ficha). Un grupo vacío no se muestra.
- Cada viaje es una fila: ícono de calendario sobre `brand-50`, `RutaViaje` en variante resumen ("Río Tercero → Córdoba · 2 paradas"), la salida ("20 oct 08:00") y el cliente, y a la derecha el botón primary **Confirmar** (de ancho completo en pantallas angostas).
- "Confirmar" abre el mismo `ModalConfirmarViaje` de la pantalla de Viajes, con el viaje tal cual lo devolvió la API (con sus candidatos): radios con "Elegir otro…" si el viaje tiene candidatos, o los selects con un texto que lo explica si no tiene. Al confirmar, el panel se recarga y un `Toast` ofrece "Avisar por WhatsApp" (ver `AvisarPorWhatsApp`).

## Reglas
- Hoy y mañana son los días de Córdoba. "Mañana" se calcula sobre la fecha calendario de Córdoba (no sumando 24 h ni con la fecha UTC), así entre las 21:00 y las 24:00 no se adelanta un día.
- Los atrasados de días anteriores no entran, ni los de pasado mañana en adelante. Dentro de cada grupo van del más temprano al más tarde.
- Sin viajes en ninguno de los dos días: "Nada pendiente para hoy ni mañana".
- Mientras carga: `Spinner` y "Cargando…". Si la consulta falla: `Alert` error "No se pudieron cargar los viajes por confirmar".
