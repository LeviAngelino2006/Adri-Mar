Sidebar con el logo, la navegación principal y el usuario. Patrón de layout (`Layout.jsx`).

## Lo que provee quien lo usa
- `<aside class="layout-sidebar">` con `.layout-sidebar-brand` (el logo, `.layout-logo`, 36px de alto), `<nav class="layout-nav">` con un `.layout-nav-link` por sección y `.layout-sidebar-footer` (ver `Avatar`).
- Ítems: Dashboard, Mis viajes, Viajes, Flota de vehículos, Documentación y Usuarios, con sus íconos de `assets/Icons`. Se muestran según el perfil: Documentación, solo para Administrador y Encargado (Personal de Taller no entra, ni a la pantalla ni a las alertas del Dashboard).
- El ítem actual lleva `.is-active`.
- En `.layout-sidebar-footer`, el usuario (avatar, nombre y perfil) es un botón `.layout-user` que abre su menú (`aria-expanded`, `aria-controls="layout-menu-usuario"`), con un chevron que mira hacia arriba cuando está abierto. El menú, `#layout-menu-usuario.layout-user-menu`, va arriba del pie con ítems `.layout-nav-link` (ícono de 20px): "Cambiar mi contraseña". "Cerrar sesión" sigue siendo el botón aparte, a la derecha. Navegar cierra el menú.

## Reglas
- 232px de ancho, `color-surface`, borde derecho `color-border`, padding `space-6` × `space-4`.
- Ítem de 44px, `radius-sm`, texto `nav` (15px, 600) en `color-text-secondary`, ícono de 20px que toma el color del texto. En hover (solo con mouse) y al tocar (`:active`), `brand-50` con `brand-700`. Activo: `brand-100` con `brand-700`.
- Desde 768px la sidebar queda fija a la izquierda. Debajo de 768px se oculta, y aparece una topbar sticky (logo de 32px y botón de menú de 44px) que la abre sobre un backdrop rgba(15, 23, 42, 0.4).
- A la derecha de la topbar, `.layout-topbar-seccion` dice en qué sección estás (15px, 600, `color-text-secondary`, una línea con elipsis), porque los listados no tienen título visible. El texto sale de los mismos ítems que arma la sidebar, con el mismo criterio de coincidencia que `NavLink`. Las fichas y los formularios muestran la sección a la que pertenecen. Si la ruta no coincide con ningún ítem, no se muestra.
