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
- Nunca es más alto que la pantalla: si el contenido no entra, el modal scrollea por dentro.
- Cerrar al hacer click fuera llama a `onCancel`.
