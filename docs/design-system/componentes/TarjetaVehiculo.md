Tarjeta de vehículo para mobile: reemplaza a la tabla de flota debajo de 768px. Patrón de página (`FlotaVehiculos.jsx`).

## Lo que provee quien lo usa
- `<button class="flota-card">` con dos partes. `.flota-card-icon` es una franja de 58px en `brand-600` con el ícono de colectivo o combi en `brand-100`. `.flota-card-content` lleva el dominio (`.patente`) y un `EstadoBadge` sm en `.flota-card-top`, y debajo `.flota-card-body` (interno, marca y modelo, km).

## Reglas
- `radius-md`, borde `color-border`, `shadow-sm`; en hover, borde `brand-500` y `shadow-md`.
- Dominio con `.patente` en `color-text`. El cuerpo en 13px, `color-text-secondary` y números tabulares.
- La versión de usuarios (`.usuarios-card`) sigue la misma estructura con el avatar en lugar de la franja (ver `Avatar`).
- Desde 768px `.flota-cards` se oculta y se muestra `TablaListado`. La vista previa la fuerza visible.
