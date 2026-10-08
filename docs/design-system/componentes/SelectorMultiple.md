Selector de varias opciones con chips: se escribe para filtrar, se elige de la lista y cada elección queda como un chip que se puede quitar.

No está en `bundle.js`. A diferencia de `SelectorBuscarOCrear` no depende del cliente HTTP (recibe las opciones ya cargadas); la vista previa es una representación estática con sus clases CSS.

## Lo que provee quien lo usa
- `opciones`: `[{ id, etiqueta }]` con todo lo elegible. El componente es genérico: quien lo usa arma la etiqueta ("Ana Pérez", "12 - AE452KD").
- `valor`: la lista de ids elegidos. El componente es controlado y no guarda la selección.
- `onChange(ids)`: recibe la lista nueva completa, en el orden en que se eligió.
- `avisos`: `{ [id]: texto }`, opcional. Muestra el texto debajo del chip de ese id y le da tono de advertencia. Es informativo: el componente nunca bloquea.
- `placeholder` (por defecto "Agregar…"), `disabled`, y atributos del input (`id`, `aria-*`: `FormField` los inyecta).

## Reglas
- Un id de `valor` que no está en `opciones` no se descarta: se muestra como "#id", para no perder datos sin que se note.
- La lista solo ofrece lo que todavía no está elegido. El filtro ignora tildes y mayúsculas ("perez" encuentra "Pérez"). Sin opciones muestra "No hay opciones para elegir"; sin coincidencias, "Sin coincidencias".
- Elegir una opción agrega el chip, limpia el texto y cierra la lista.
- Teclado: ↑ y ↓ mueven la opción activa, Enter la elige (con la lista abierta nunca envía el formulario), Escape cierra. Click afuera también cierra.
- Accesibilidad: el input es un `combobox` con `aria-expanded`, `aria-controls` y `aria-activedescendant`; la lista es un `listbox` `aria-multiselectable`. Cada chip tiene un botón con `aria-label="Quitar …"`.
- No se borra el último chip con Backspace: en el celular se quitaría un chip sin querer.
- Chip: píldora (`radius-full`) con fondo `brand-50`, borde `brand-200` y texto `brand-700`; el botón de quitar es un área táctil de 28px. Con aviso pasa a `state-warning-bg`, `state-warning-border` y `state-warning-text`, y el aviso va debajo en 13px con `state-warning-text`.
- Lista: igual que `SelectorBuscarOCrear` (fondo `color-surface`, borde `color-border`, radio `radius-sm`, sombra `shadow-md`, máximo 240px). La opción activa y el toque van en `brand-50`.
- Un `FormField` lo rodea y le da el label y el error; no se marca `required` salvo que la lista sea obligatoria.
