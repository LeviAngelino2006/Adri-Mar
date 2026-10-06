Tarjeta del viaje en curso, arriba de todo en el Dashboard: ruta, horario y cuánto falta. Patrón de página (`Dashboard.jsx`).

## Lo que provee quien lo usa
- Una `Card` con `.viaje-en-curso`, solo si hay un viaje En viaje (si hay varios, una por viaje).
- `.viaje-en-curso-header`: `EstadoBadge` warning "En viaje" y, si corresponde, `IndicadorVencimiento` (Excedido).
- `.viaje-en-curso-ruta` con `RutaViaje` (18px).
- `.viaje-en-curso-progreso`: salida a la izquierda y llegada estimada a la derecha (`.viaje-en-curso-hora`, con un `<small>` "Salida" / "Llegada est."). En el medio, `.viaje-en-curso-barra` con `.viaje-en-curso-barra-fill` al porcentaje transcurrido entre `fechaInicio` y `fechaFin` (entre 0 y 100), con `role="progressbar"` y `aria-valuenow`.
- Si el viaje está excedido, agregar `.viaje-en-curso-barra-excedido`: la barra queda al 100% en `state-error-solid`.
- `.viaje-en-curso-pie`: chofer y vehículo.

## Reglas
- La barra mide 6px, `radius-full`, track `color-border` y relleno `brand-600`. El estado lo comunica el badge; la barra solo muestra el avance.
- Horas en 600 y números tabulares.
- Reemplaza al ítem destacado con borde izquierdo ámbar dentro de Próximos viajes.
