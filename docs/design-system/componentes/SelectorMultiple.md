Selector de varias opciones con chips: se escribe para filtrar, se elige de la lista y cada elección queda como un chip que se puede quitar.

No está en `bundle.js`. A diferencia de `SelectorBuscarOCrear` no depende del cliente HTTP (recibe las opciones ya cargadas); la vista previa es una representación estática con sus clases CSS.

## Lo que provee quien lo usa
- `opciones`: `[{ id, etiqueta, detalle? }]` con todo lo elegible. El componente es genérico: quien lo usa arma la etiqueta ("Ana Pérez", "12 - AE452KD"). `detalle` es un texto secundario opcional que va después de la etiqueta, separado por " · ", en la lista (en `color-text-secondary`) y en el chip (mismo color del chip, peso 400); el filtro también busca en él. Lo usan las unidades de un presupuesto: "12 · AB123CD · Minibus de 17 pasajeros".
- `valor`: la lista de ids elegidos. El componente es controlado y no guarda la selección.
- `onChange(ids)`: recibe la lista nueva completa, en el orden en que se eligió.
- `avisos`: `{ [id]: texto }`, opcional. Muestra el texto debajo del chip de ese id y le da tono de advertencia. Es informativo: el componente nunca bloquea.
- `forma`: cómo se ven los elegidos. `pildora` (por defecto; la usan las unidades de un presupuesto) o `cuadro` (la usan los choferes y vehículos posibles de un viaje). En `cuadro` cada opción puede traer `tituloElegido` y `subtituloElegido` ("Interno 12" / "AE452KD"); si no, va la etiqueta.
- `placeholder` (por defecto "Agregar…"), `disabled`, y atributos del input (`id`, `aria-*`: `FormField` los inyecta).

## Reglas
- Un id de `valor` que no está en `opciones` no se descarta: se muestra como "#id", para no perder datos sin que se note.
- La lista solo ofrece lo que todavía no está elegido. El filtro ignora tildes y mayúsculas ("perez" encuentra "Pérez"). Sin opciones muestra "No hay opciones para elegir"; sin coincidencias, "Sin coincidencias".
- Orden: primero el buscador y debajo los chips elegidos, separados por `space-2`. La lista desplegable abre debajo del buscador y se superpone a los chips (posición absoluta, por encima): no los empuja. Los avisos van debajo de cada chip.
- Elegir una opción agrega el chip, limpia el texto y cierra la lista.
- Teclado: ↑ y ↓ mueven la opción activa, Enter la elige (con la lista abierta nunca envía el formulario), Escape cierra. Click afuera también cierra.
- Accesibilidad: el input es un `combobox` con `aria-expanded`, `aria-controls` y `aria-activedescendant`; la lista es un `listbox` `aria-multiselectable`. Cada chip tiene un botón con `aria-label="Quitar …"`.
- No se borra el último chip con Backspace: en el celular se quitaría un chip sin querer.
- Chip: píldora (`radius-full`) con fondo `brand-50`, borde `brand-200` y texto `brand-700`; el botón de quitar es un área táctil de 28px. Con aviso pasa a `state-warning-bg`, `state-warning-border` y `state-warning-text`, y el aviso va debajo en 13px con `state-warning-text`.
- Cuadradito (`forma="cuadro"`): radio `radius-md`, fondo `brand-50`, borde `brand-200`, texto `brand-700`, en una fila con wrap y separación `space-2`. Título en 13px (500) y subtítulo debajo en 12px `color-text-secondary`, con interlineado justo: mide lo mismo que la píldora (32px de alto mínimo) aunque lleve dos líneas. El botón de quitar es el mismo de la píldora, con `aria-label="Quitar <título>"` (o "Quitar <título>, <subtítulo>"). Con aviso pasa a los tonos `state-warning-*`, como la píldora. Si el elegido quedó deshabilitado (`disponible: false`, p. ej. documentación vencida después de elegirlo) pasa a `state-error-bg` / `state-error-border` / `state-error-text` y el motivo va debajo en 13px `state-error-text`: se puede quitar, pero no volver a agregar (la lista no deja elegir deshabilitados). Un aviso igual al motivo no se repite.
- Lista: igual que `SelectorBuscarOCrear` (fondo `color-surface`, borde `color-border`, radio `radius-sm`, sombra `shadow-md`, máximo 240px). La opción activa y el toque van en `brand-50`.
- Un `FormField` lo rodea y le da el label y el error; no se marca `required` salvo que la lista sea obligatoria.
