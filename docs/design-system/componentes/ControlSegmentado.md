Control para cambiar de vista dentro de la misma pantalla, con un botón por opción y una sola activa. Se usa en Documentación (Vehículos | Choferes).

## Cuándo usarlo
- Para alternar entre vistas hermanas de un mismo conjunto de datos, donde el cambio reemplaza el contenido de abajo y no cambia de ruta (Vehículos | Choferes).
- Con 2 a 4 opciones cortas. Más que eso, o cuando el cambio lleva a otra sección, usá la navegación o un `select`.
- No lo uses para filtrar (eso es `Filtros`) ni para acciones (eso es `Button`).

## Lo que provee quien lo usa
- `opciones`: arreglo de `{ valor, etiqueta }`. Etiquetas en sentence case y en plural cuando nombran un conjunto ("Vehículos", "Choferes").
- `valor`: el valor de la opción activa. Es un componente controlado.
- `onChange`: recibe el `valor` de la opción tocada.
- `ariaLabel`: nombre del grupo para lectores de pantalla ("Vista de documentación").
- Guardá la vista en la URL (`?tab=choferes`) para que se pueda enlazar y funcione el botón Atrás.

## Estilos
- Contenedor: `display: inline-flex`, gap `space-1`, padding `space-1`, `color-surface`, borde `color-border`, `radius-md` y margen inferior `space-4`.
- Botón: alto mínimo 44px, padding `0 space-5`, sin borde, `radius-sm`, 15px y 600 en `color-text-secondary`.
- Activo: fondo `brand-100` y texto `brand-700`.
- Hover (solo inactivos): `brand-50` y `brand-700`, dentro de `@media (hover: hover)`; el mismo estilo en `:active`, fuera de la media query. Foco: outline 2px `brand-600`, offset 2px.

## Accesibilidad
- Marcado: un `div` con `role="group"` y `aria-label`, y un `<button type="button">` por opción con `aria-pressed` (`true` en la activa). No es un `tablist`: no hay paneles asociados.
- Todos los botones se alcanzan con Tab y se activan con Enter o Espacio.
