Mensaje en línea de éxito, error, advertencia o información dentro de una vista.

## Cuándo usarlo
- `error` (role="alert"): falló una operación o la carga de datos.
- `success` (role="status"): confirmación persistente en la vista. Para confirmaciones breves usar `Toast`.
- `warning` (role="status"): algo a tener en cuenta que no es un error ni bloquea la tarea (por ejemplo, una vista en la que no se puede modificar nada).
- `info` (role="status"): contexto o aclaraciones.

## Lo que provee quien lo usa
- `variant` y `children` (el mensaje, una o dos frases).

## Reglas
- Usa los tríos `state-*-text` / `state-*-bg` / `state-*-border`, radio `radius-sm`, padding `space-3` × `space-4`, texto `body-sm`.
- `info` usa la escala de marca (`state-info-*` son alias de `brand-700`, `brand-50` y `brand-200`): no hay un segundo azul.
- `warning` usa los tríos `state-warning-text` / `state-warning-bg` / `state-warning-border`, los mismos que `EstadoBadge` warning.
