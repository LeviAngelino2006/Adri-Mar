Grupo de casillas (checkboxes) para elegir varias opciones de una lista corta y fija, todas a la vista. Cada opción es una tarjeta con la casilla, la etiqueta y, debajo, un detalle opcional. Lo usan los tipos de trabajo de un arreglo (Mantenimiento → Arreglos).

No está en `bundle.js`. Para listas largas o que hay que filtrar (choferes, unidades de un presupuesto) se usa `SelectorMultiple`. `GrupoCasillas` es para hasta ~10 opciones donde conviene ver todo de una vez y marcar con un toque.

## Lo que provee quien lo usa
- `id`: id del `fieldset`. Cada casilla es `${id}-${opcion.id}` y el error, `${id}-error`.
- `legend`: el título del grupo ("Tipos de trabajo").
- `opciones`: `[{ id, etiqueta, detalle? }]`. `detalle` es un texto secundario que va debajo de la etiqueta (la descripción del tipo).
- `valor`: la lista de ids marcados. El componente es controlado y no guarda la selección.
- `onChange(ids)`: recibe la lista nueva completa, **en el orden de `opciones`** (no en el orden en que se marcó).
- `required` (pone el asterisco y, para lectores de pantalla, " (obligatorio)" en `.sr-only` dentro del legend: `aria-required` no vale en un grupo), `hint` (texto debajo del grupo, por ejemplo "Cargando…" mientras no hay opciones; no se muestra si hay error), `error` (texto) y `disabled` (deshabilita todas las casillas).
- `contenidoMarcada(opcion)`, opcional: lo que va debajo de una opción **cuando está marcada** (devolver `null` para las demás). Lo usa "Otro" para su campo "¿Qué trabajo?".

## Reglas
- No va dentro de `FormField`: un grupo no tiene un único `label` sino un `fieldset` con `legend`. El legend tiene el mismo estilo que el label de `FormField` y el asterisco usa `form-field-required`.
- El error va debajo del grupo, igual que en `FormField` (`form-field-error`, `role="alert"`), y el `fieldset` lo referencia con `aria-describedby` (o al hint, si no hay error). La primera casilla lleva `aria-invalid` y `aria-describedby` al error: así `useFocoEnPrimerError` lleva el foco al grupo y el lector de pantalla lee el error al enfocarla. Con error, el borde de todas las opciones pasa a `state-error-border`.
- Grilla de una columna en el celular y dos desde 640px, como `.form-grid`. Dentro de un formulario va a ancho completo (`.form-field-ancho`).
- Opción: una celda con fondo `color-surface`, borde `color-border` y radio `radius-sm`; adentro, el label (casilla + texto) de alto mínimo 44px es el área táctil. Marcada: la celda pasa a fondo `brand-50` y borde `brand-200`, como el chip de `SelectorMultiple`. El hover (solo con mouse) y el toque (`:active`) marcan el borde en `brand-200`.
- `contenidoMarcada` va dentro de la celda y **fuera del label** (un clic en el campo no desmarca la opción), alineado con el texto de la opción. Un campo con error adentro (por ejemplo, "¿Qué trabajo?" vacío) muestra su propio error y no marca en rojo todo el grupo.
- La casilla mide 18px, con `accent-color` `brand-600`. El foco usa el anillo global (2px `brand-600`, offset 2px).
- Detalle en 14px y `color-text-secondary`.
