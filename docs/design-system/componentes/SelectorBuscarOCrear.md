Campo de búsqueda con debounce que permite elegir un registro existente o crear uno nuevo con lo tipeado.

No está en `bundle.js`: depende del cliente HTTP de la app (`services/api`). La vista previa es una representación estática con sus clases CSS.

## Lo que provee quien lo usa
- `endpoint`: un recurso que soporte `GET ?busqueda=` y `POST { nombre }`, y responda con una sola clave (`{ ubicaciones: [...] }`, `{ ubicacion: {...} }`).
- `valor` / `valorNombre`: la selección actual (id y nombre).
- `onSeleccionar(item | null)`: recibe `{ id, nombre }`, o `null` cuando el usuario vuelve a escribir.
- `placeholder` (por defecto "Buscar…"), `disabled`, y atributos de input.

## Reglas
- La deduplicación es del backend: el componente siempre ofrece "+ Crear" cuando hay texto.
- Lista: fondo `color-surface`, borde `color-border`, radio `radius-sm`, sombra `shadow-md`, máximo 240px de alto. Hover de opción `brand-50` (solo con mouse; `:active` igual al tocar); la opción de crear va en `brand-600`, 500.
- Escape cierra la lista; click afuera también.
