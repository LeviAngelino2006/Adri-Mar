Envuelve un control con su label, hint y mensaje de error accesibles.

## Lo que provee quien lo usa
- `id`: se inyecta al control hijo y enlaza el `<label>`.
- `label`: texto del label (estilo `label`).
- `children`: UN control (`input`, `select`, `textarea`). Recibe `id`, `aria-invalid` y `aria-describedby` automáticamente.
- `required` opcional: agrega un asterisco rojo (`.form-field-required`, `state-error-text`, `aria-hidden`) después del label y `aria-required` al control. No usa el atributo nativo `required`: los formularios validan por su cuenta (`noValidate`). Marcá solo lo obligatorio y no escribas "Opcional" en los campos que no lo son.
- `hint` opcional (estilo `caption`, color `color-text-secondary`). Se oculta cuando hay error.
- `error` opcional (estilo `caption`, color `state-error-text`, role="alert"). El borde del control pasa a `state-error-border`.

## Reglas
- Los controles miden mínimo 44px de alto, padding `space-2` × `space-3`, borde `color-border`, radio `radius-sm`.
- Foco (input, select y textarea por igual): outline 2px `brand-600` con offset -2px, por dentro del control, tapando el borde. Lo da la regla global de `index.css`, no `FormField`: vale también para los campos que no van en un `FormField` (el buscador de los listados). Por dentro y no por fuera porque, con offset 2px, el cuerpo con scroll de los modales recortaba el anillo: un textarea a todo el ancho mostraba solo el borde de abajo.
- Dentro de `.form-grid` los campos pasan a dos columnas desde 640px.
- Validá todo junto antes de enviar, así los errores salen en una sola vuelta (el backend valida igual). Al mostrar los errores, el foco y el scroll van al primer campo con error: `useFocoEnPrimerError` (`hooks/useFocoEnPrimerError.js`) busca el primer control con `aria-invalid` en el `<form>`; si el error es general, scrollea hasta el `Alert`.
