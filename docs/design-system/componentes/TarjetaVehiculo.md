Tarjeta de vehículo del listado de flota. Se usa en todos los tamaños: reemplazó a la tabla. Patrón de página (`FlotaVehiculos.jsx`).

## Lo que provee quien lo usa
- `.flota-cards`: una grilla que arma columnas de al menos 300px (`repeat(auto-fill, minmax(300px, 1fr))`, gap `space-4`): 1 columna en mobile, 2 y 3 en pantallas anchas.
- `<button class="flota-card">` por vehículo, con dos partes. `.flota-card-icon` es una franja de 58px en `brand-600` con el ícono de colectivo o combi en `brand-100`. `.flota-card-content` lleva el título `.flota-card-dominio` con "interno - dominio" (por ejemplo "12 - AE452KD") y un `EstadoBadge` sm en `.flota-card-top`, y debajo dos `.flota-card-body`: marca y modelo, y en la línea siguiente tipo y kilometraje ("Colectivo · 57.310 km", separador de miles es-AR).
- El click o Enter abre la ficha del vehículo.

## Reglas
- `radius-md`, borde `color-border`, `shadow-sm`; en hover, borde `brand-500` y `shadow-md`. Foco visible: outline 2px `brand-600`.
- El título va en `color-text` y 600; solo el dominio lleva `.patente` (el interno va en la fuente normal). El cuerpo en 13px, `color-text-secondary` y números tabulares.
- Estados: Operativo (success), En taller (warning) y Dado de baja (neutral), siempre con `EstadoBadge`.
- Encabezado, filtros y estado vacío no cambian. Con muchos vehículos la grilla mantiene el orden de lectura de izquierda a derecha.
- La versión de usuarios (`.usuarios-card`) sigue la misma estructura con el avatar en lugar de la franja (ver `Avatar`).
