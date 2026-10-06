Botón "Filtros" con el contador de filtros activos y el panel desplegable de filtros. Va en la barra de herramientas de `Listado`, junto al buscador, en Viajes, Flota y Mis viajes. Patrón de página.

## Lo que provee quien lo usa
- `.listado-toolbar` (antes `.viajes-listado-toolbar`) con `<button class="filtros-toggle-btn" aria-expanded>`: el ícono de filtro, "Filtros" y, si hay filtros activos, `.filtros-toggle-badge` con la cantidad.
- Al abrirlo, `<form class="listado-filtros">` con un `FormField` por filtro (select o input). No tiene botón de enviar: filtra al cambiar.

## Reglas
- El botón mide 44px de alto como el buscador: 14px, 600, borde `color-border`, `radius-md`. En hover, borde `brand-500`.
- Badge en píldora `brand-600`, texto blanco, 12px, 700.
- El panel es `color-surface`, borde `color-border`, `radius-md`, padding `space-4`. Desde 900px los campos van en fila.
