Indicador de carga circular que hereda el color del texto. Va dentro de los botones en `loading` (y en el visor de PDF); para cargar una pantalla, un panel o un modal se usa `Cargando`.

## Lo que provee quien lo usa
- `size`: `sm` (16px, dentro de botones), `md` (22px, por defecto), `lg` (32px).
- `label`: texto para lectores de pantalla (por defecto "Cargando…").

## Reglas
- Toma `currentColor`: ponerlo dentro de un contenedor con el color deseado.
- Respeta `prefers-reduced-motion`.
