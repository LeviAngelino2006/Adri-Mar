Panel del Dashboard de Administrador y Encargado con los viajes A confirmar que hay que resolver hoy y mañana. Los demás perfiles no lo ven. Va en la columna izquierda de `.dashboard-columnas` (ver `Dashboard`).

No está en `bundle.js`: pide los viajes al backend. La vista previa es una representación estática con sus clases CSS.

## Estructura
- `Card` con `.dashboard-panel` y el título "Viajes por confirmar" (`h2`).
- Dos grupos con subtítulo `<h3 class="dashboard-grupo-dia">` **Hoy** y **Mañana** (13px, 600, mayúsculas, `color-text-secondary`, como los títulos de sección de la ficha). Un grupo vacío no se muestra.
- Cada grupo es un `<ul class="dashboard-lista">` con un `<li>` por viaje, separados por un borde superior `color-border`. Dentro, `<div class="por-confirmar-fila">` (grilla de 56px, contenido y botón):
  - `.hora-col` con la hora de salida ("08:00"). El día lo da el subtítulo del grupo.
  - `.dashboard-fila-info`, con la ruta (`RutaViaje`) en `.dashboard-fila-titulo` y el cliente en `.dashboard-fila-meta`.
  - El `Button` **secondary** "Confirmar".
- Sin ícono de calendario en las filas.
- "Confirmar" abre el mismo `ModalConfirmarViaje` de la pantalla de Viajes, con el viaje tal cual lo devolvió la API (con sus candidatos): radios con "Elegir otro…" si el viaje tiene candidatos, o los selects con un texto que lo explica si no tiene. Al confirmar, el panel se recarga y un `Toast` ofrece "Avisar por WhatsApp" (ver `AvisarPorWhatsApp`).

## Reglas
- Hoy y mañana son los días de Córdoba. "Mañana" se calcula sobre la fecha calendario de Córdoba (no sumando 24 h ni con la fecha UTC), así entre las 21:00 y las 24:00 no se adelanta un día.
- Los atrasados de días anteriores no entran, ni los de pasado mañana en adelante. Dentro de cada grupo van del más temprano al más tarde.
- Sin viajes en ninguno de los dos días: `.dashboard-empty` con "Nada pendiente para hoy ni mañana". Los estados vacíos del Dashboard son solo texto, sin ícono.
- Mientras carga: `Spinner` y "Cargando…". Si la consulta falla: `Alert` error "No se pudieron cargar los viajes por confirmar".
- Debajo de 480px la fila pasa a dos columnas (48px y contenido) y el botón ocupa una línea propia a todo el ancho.
