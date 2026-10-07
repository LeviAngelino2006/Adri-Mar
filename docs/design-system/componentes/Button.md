Botón de acción con cuatro variantes y estado de carga.

## Cuándo usarlo
- `primary`: la acción principal de la vista o del formulario (una por bloque). Fondo `brand-600`, texto `color-on-brand`; hover `brand-700` (solo con mouse; al tocar, `:active` con el mismo color).
- `secondary`: acciones alternativas y "Cancelar". Fondo `color-surface`, borde `color-border`; hover `brand-50` con borde `brand-500`.
- `danger`: acciones destructivas o irreversibles (cancelar un viaje, dar de baja). Fondo `state-error-text`, texto `color-on-brand`; hover `state-error-strong`.
- `ghost`: acciones terciarias o en línea, sin borde. Texto `brand-600`.

## Lo que provee quien lo usa
- `children`: la etiqueta, en infinitivo o imperativo corto ("Guardar cambios", "Confirmar viaje").
- `loading`: mientras corre una petición. Muestra un `Spinner` sm, deshabilita el botón y marca `aria-busy`.
- `type="submit"` dentro de formularios; por defecto es `button`.
- Cualquier atributo nativo (`onClick`, `aria-*`) pasa al `<button>`.

## Reglas
- Altura mínima 44px (área táctil). No reducirla.
- Texto `button` (16px, 600, line-height 1), padding `space-2` × `space-4`, radio `radius-sm`.
- En pares, el secundario va primero y el primario/danger a la derecha (como en `ConfirmModal`).
