Botón "Filtros" con el contador de filtros activos y el panel desplegable de filtros. Va en la barra de herramientas de `Listado`, junto al buscador, en Viajes, Mis viajes, Flota, Mantenimiento (Service e Historial) y Documentación. Patrón de página.

## Lo que provee quien lo usa
- `.listado-toolbar` (antes `.viajes-listado-toolbar`) con `<button class="filtros-toggle-btn" aria-expanded>`: el ícono de filtro, "Filtros" y, si hay filtros activos, `.filtros-toggle-badge` con la cantidad.
- Al abrirlo, `<form class="listado-filtros">` con un `FormField` por filtro (select o input). No tiene botón de enviar: filtra al cambiar.
- En Viajes, al final del panel, un `Button` secondary "Limpiar filtros" (`.listado-filtros-limpiar`), visible solo si hay algún filtro o una búsqueda. Limpia los filtros y la búsqueda, pero no la vista (Próximos | Anteriores). El mismo botón va en el estado vacío con filtros ("No hay viajes con esos filtros.").

## Reglas
- El botón mide 44px de alto como el buscador: 14px, 600, borde `color-border`, `radius-md`. En hover (solo con mouse) y al tocar (`:active`), borde `brand-500`.
- Badge en píldora `brand-600`, texto blanco, 12px, 700.
- El panel es `color-surface`, borde `color-border`, `radius-md`, padding `space-4`. Desde 900px los campos van en fila.
- "Limpiar filtros" mide lo que su texto (no el ancho del panel): alineado a la izquierda en columna y, desde 900px, al final de la fila, alineado abajo con los campos.
