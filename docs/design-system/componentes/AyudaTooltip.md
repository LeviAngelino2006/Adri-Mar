Ícono "?" que muestra un texto de ayuda en un popover (`components/ui/AyudaTooltip.jsx`). `FormField` lo usa con la prop `ayuda`; fuera de un `FormField`, se pone al lado de la etiqueta y se enlaza a mano el control con `aria-describedby` = `id`.

## Lo que provee quien lo usa
- `texto`: la ayuda, una oración corta.
- `id` opcional: id del span con el texto (si falta, se genera uno).

## Comportamiento
- Botón `type="button"` con `aria-label="Más información"`, ícono SVG de 16px en `color-text-secondary` y área de toque de 28px.
- Se abre al pasar el mouse (solo con `(hover: hover)`), al llegar con el teclado y al tocarlo (alterna). Se cierra con Escape, al tocar afuera y al salir del botón con el foco.
- El texto vive siempre en un span `.sr-only` con el `id`: los lectores de pantalla lo leen desde el control aunque el popover esté cerrado. El popover es solo visual (`aria-hidden`).
- Popover `position: fixed` (no lo recortan los modales), a 8px como mínimo de los bordes de la pantalla; abajo del ícono y, si no entra, arriba.

## Estilo
Fondo `color-inverse-bg`, texto `color-inverse-text`, radio `radius-sm`, sombra `shadow-md`, texto `body-sm`, padding `space-2` × `space-3`, ancho máximo 280px.
