Control para cambiar de vista dentro de la misma pantalla, con un botón por opción y una sola activa. Se usa en Documentación (Vehículos | Choferes), dentro de la barra del listado.

## Cuándo usarlo
- Para alternar entre vistas hermanas de un mismo conjunto de datos, donde el cambio reemplaza el contenido de abajo y no cambia de ruta (Vehículos | Choferes).
- Con 2 a 4 opciones cortas. Más que eso, o cuando el cambio lleva a otra sección, usá la navegación o un `select`.
- No lo uses para filtrar (eso es `Filtros`) ni para acciones (eso es `Button`).

## Lo que provee quien lo usa
- `opciones`: arreglo de `{ valor, etiqueta, icono?, cantidad? }`. Etiquetas en sentence case y en plural cuando nombran un conjunto ("Vehículos", "Choferes").
  - `icono`: SVG de 18px con `currentColor` y `aria-hidden`. En Documentación, colectivo para Vehículos (`IconoVehiculo` con `tamano={18}`) y persona para Choferes.
  - `cantidad`: el total de registros de la vista, sin aplicar búsqueda ni filtro de estado. Va en `<span class="control-segmentado-cantidad">14</span>`. Si es `null` o `undefined` no se muestra (por ejemplo, mientras la lista carga o si falló).
- `valor`: el valor de la opción activa. Es un componente controlado.
- `onChange`: recibe el `valor` de la opción tocada.
- `ariaLabel`: nombre del grupo para lectores de pantalla ("Vista de documentación").
- Guardá la vista en la URL (`?tab=choferes`) para que se pueda enlazar y funcione el botón Atrás.
- En un listado, pasalo a `ListadoToolbar` con la prop `vistas` (las mismas props): se renderiza después de Filtros.

## Estilos
- Neutro, sin azul. Contenedor: `inline-flex`, borde `color-border`, `radius-sm`, fondo `state-neutral-bg`. Sin margen propio.
- Botón: alto mínimo 44px, padding `0 space-4`, gap `space-2`, 15px y 500 en `state-neutral-text`. Las opciones se separan con un borde izquierdo `color-border`; la primera y la última llevan el radio del contenedor.
- Activa: fondo `color-surface`, texto `color-text` y 600.
- Cantidad: 400, `color-text-secondary` y números tabulares (`state-neutral-text` en las opciones inactivas).
- Hover (solo inactivas): texto `color-text` y fondo `color-bg`, dentro de `@media (hover: hover)`; el mismo estilo en `:active`, fuera de la media query. Foco: outline 2px `brand-600`, offset 2px.

## En la barra del listado
- Escritorio: va a la derecha de todo (`margin-left: auto`), después del buscador y de Filtros. Es también el orden en el DOM.
- Depende del ancho de la barra, no del de la pantalla: `.listado-toolbar` es un contenedor (`container: listado-toolbar / inline-size`) y las reglas van en `Listado.css` con `@container`.
- Barra de menos de 600px: el control pasa arriba (`order: -1`), a todo el ancho y con las opciones en partes iguales. El buscador y Filtros quedan en la línea de abajo. Pasa en mobile y también en escritorio angosto, con la sidebar abierta (por ejemplo, a 800px).
- Barra de menos de 400px: además se ocultan las cantidades.

## Accesibilidad
- Marcado: un `div` con `role="group"` y `aria-label`, y un `<button type="button">` por opción con `aria-pressed` (`true` en la activa). No es un `tablist`: no hay paneles asociados.
- Todos los botones se alcanzan con Tab y se activan con Enter o Espacio.
