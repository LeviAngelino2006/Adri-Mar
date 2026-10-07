Indicador de carga circular que hereda el color del texto.

## Lo que provee quien lo usa
- `size`: `sm` (16px, dentro de botones), `md` (22px, por defecto), `lg` (32px).
- `label`: texto para lectores de pantalla (por defecto "Cargando…").

## Reglas
- Toma `currentColor`: ponerlo dentro de un contenedor con el color deseado (por ejemplo `.loading-state`, que usa `color-text-secondary`).
- Respeta `prefers-reduced-motion`.
