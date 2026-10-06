Tarjeta del listado de viajes: chofer, estado, ruta, vehículo, fechas y kilómetros. Patrón de página (`Viajes.jsx`), armado con clases de `bundle.css` y componentes del bundle.

## Lo que provee quien lo usa
- Un `<button class="viajes-listado-card">` por viaje. El listado es una sola columna de ancho completo (`.viajes-listado-cards`, gap `space-4`) en todos los tamaños. No es una grilla.
- Encabezado `.viajes-listado-card-header`: el nombre del chofer en `.viajes-listado-card-titulo`, o "Chofer pendiente". A la derecha, `EstadoBadge` md con el tono del estado y debajo `IndicadorVencimiento` si corresponde.
- `.viajes-listado-card-ruta` con `RutaViaje`. Después, `.viajes-listado-card-vehiculo` ("Interno 12 (Mercedes-Benz O500)" o "Vehículo pendiente").
- `.viajes-listado-card-detalle`: rango de fechas y "N km estimados", o "Fechas pendientes" / "Km pendientes".

## Reglas
- Surface `color-surface`, borde `color-border`, `radius-md`, `shadow-sm`, padding `space-4`. En hover, borde `brand-500` y `shadow-md`.
- El pie se separa con un borde superior `color-border` y texto `caption` en `color-text-secondary`, con números tabulares.
