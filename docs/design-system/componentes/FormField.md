Envuelve un control con su label, hint y mensaje de error accesibles.

## Lo que provee quien lo usa
- `id`: se inyecta al control hijo y enlaza el `<label>`.
- `label`: texto del label (estilo `label`).
- `children`: UN control (`input`, `select`, `textarea`). Recibe `id`, `aria-invalid` y `aria-describedby` automáticamente.
- `hint` opcional (estilo `caption`, color `color-text-secondary`). Se oculta cuando hay error.
- `error` opcional (estilo `caption`, color `state-error-text`, role="alert"). El borde del control pasa a `state-error-border`.

## Reglas
- Los controles miden mínimo 44px de alto, padding `space-2` × `space-3`, borde `color-border`, radio `radius-sm`.
- Dentro de `.form-grid` los campos pasan a dos columnas desde 640px.
