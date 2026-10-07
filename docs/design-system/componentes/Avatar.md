Iniciales de un usuario en un círculo, coloreadas por perfil. Se usa en el listado de usuarios y en el pie de la sidebar.

## Lo que provee quien lo usa
- Las iniciales: primera letra del nombre y del apellido, en mayúsculas.
- El color según el perfil: Administrador `brand-100` / `brand-700`, Encargado `perfil-encargado-bg` / `perfil-encargado-text`, Personal de Taller `state-warning-bg` / `state-warning-text`, Chofer `state-success-bg` / `state-success-text`. Van en línea (`style`), porque el color sale de `PERFIL_COLORS`.

## Reglas
- En el listado de usuarios, dentro de `.listado-card-marca`: 40px, 700, 14px, sin fondo propio. Ver `Listado`.
- En la sidebar, `.layout-user-avatar`: 32px, siempre en `brand-100` / `brand-700`, junto a `.layout-user-name` (13px, 600), `.layout-user-perfil` (12px) y el botón de cerrar sesión, que pasa a `state-error-text` en hover (solo con mouse) y al tocar.
