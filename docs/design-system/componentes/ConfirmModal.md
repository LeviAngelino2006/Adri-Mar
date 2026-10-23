Diálogo de confirmación para acciones importantes o destructivas.

## Lo que provee quien lo usa
- `open`, `onConfirm`, `onCancel`.
- `title`: la pregunta ("¿Cancelar este viaje?").
- `description`: consecuencia en una o dos frases; puede incluir un `FormField` (por ejemplo un motivo).
- `confirmLabel` (y `cancelLabel`, por defecto "Cancelar").
- `icon`: un SVG de 20–24px.
- `tone`: `danger` (ícono sobre `state-error-bg`, botón danger) o `brand` (ícono sobre `brand-100`, botón primario).
- `size`: `default` (360px) o `wide` (460px), para modales con opciones largas como Confirmar viaje.

## Reglas
- 360px de ancho (460px con `size="wide"`), radio `radius-lg`, padding `space-6`, sombra `shadow-lg`, backdrop `overlay`.
- Nunca es más alto que la pantalla. Tiene tres partes: encabezado (`.confirm-modal-encabezado`, con el ícono y el título), cuerpo (`.confirm-modal-cuerpo` > `.confirm-modal-description`, con la `description`) y pie (`.confirm-modal-actions`, con los botones). Encabezado y pie quedan fijos; si el contenido no entra, solo el cuerpo scrollea por dentro. Así los botones siempre se ven, también en Confirmar viaje a 390px o a 1280 × 800.
- Mientras queda contenido por ver más abajo, el borde de abajo del cuerpo lleva un degradé de `space-8` de alto, de transparente a `color-surface` (`.confirm-modal-cuerpo.hay-mas-abajo::after`). Al llegar al final, o si todo entra, no se muestra. Lo calcula el hook `useHayMasAbajo`: mide al renderizar, al scrollear, cuando el cuerpo cambia de tamaño y cuando cambia su contenido.
- El cuerpo tiene `space-1` de padding (con el mismo margen negativo) para que el scroll no recorte el anillo de foco de los campos.
- Cerrar al hacer click fuera llama a `onCancel`.
