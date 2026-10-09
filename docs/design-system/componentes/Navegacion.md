Sidebar con el logo, la navegación principal y el usuario. Patrón de layout (`Layout.jsx`).

## Lo que provee quien lo usa
- `<aside class="layout-sidebar">` con `.layout-sidebar-brand` (el logo, `.layout-logo`, 36px de alto), `<nav class="layout-nav">` con un `.layout-nav-link` por sección y `.layout-sidebar-footer` (ver `Avatar`).
- Ítems: Dashboard, Mis viajes, Viajes, Flota de vehículos y Usuarios, con sus íconos de `assets/Icons`. Se muestran según el perfil.
- El ítem actual lleva `.is-active`.

## Reglas
- 232px de ancho, `color-surface`, borde derecho `color-border`, padding `space-6` × `space-4`.
- Ítem de 44px, `radius-sm`, texto `nav` (15px, 600) en `color-text-secondary`, ícono de 20px que toma el color del texto. En hover (solo con mouse) y al tocar (`:active`), `brand-50` con `brand-700`. Activo: `brand-100` con `brand-700`.
- Desde 768px la sidebar queda fija a la izquierda. Debajo de 768px se oculta, y aparece una topbar sticky (logo de 32px y botón de menú de 44px) que la abre sobre un backdrop rgba(15, 23, 42, 0.4).
