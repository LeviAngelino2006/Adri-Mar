Panel del Dashboard de Administrador y Encargado con los viajes del día: qué sale, qué está en la ruta y qué ya terminó. Va a todo el ancho, arriba de las dos columnas (ver `Dashboard`). Componente de la app (`PanelViajesDeHoy.jsx`); no está en `bundle.js` porque pide los viajes al backend.

## Qué viajes muestra
- Los Programados, En viaje y Finalizados cuya fecha de inicio es hoy (día de Córdoba).
- Además, cualquier viaje En viaje aunque haya salido antes (por ejemplo, ayer a la noche).
- Sin A confirmar ni Cancelados.
- Orden: por fecha de inicio, del más temprano al más tarde.

## Cómo se cargan
- `GET /viajes` con `fechaDesde` y `fechaHasta` iguales a hoy (`hoyCordobaISO()`). El backend toma una fecha suelta como el día entero de Córdoba (de 00:00 a 23:59:59.999).
- Aparte, `GET /viajes?estado=EN_VIAJE` (el endpoint acepta un solo estado).
- Se unen sin duplicados y se filtran en el front los A confirmar y los Cancelados (`utils/viajesDeHoy.js`).

## Estructura
- `Card` con `.dashboard-panel`.
- `.dashboard-panel-header`: el `h2` "Viajes de hoy" y, a la derecha, `.dashboard-resumen` con "5 viajes · 1 en viaje · 2 finalizados" (14px, `color-text-secondary`, números tabulares). Se omiten las partes en cero, salvo el total, y el singular va bien escrito ("1 viaje", "1 finalizado"). Sin viajes, el resumen no se muestra.
- `<ul class="dashboard-lista">` con un `<li>` y un `<button class="dashboard-fila">` por viaje. Cada fila tiene:
  1. `<span class="hora-col">07:30<small>10:00</small></span>`: la salida y, debajo, la llegada. Si una de las dos cae otro día, lleva el día relativo: "ayer 22:00", "mañana 02:00".
  2. `<span class="dashboard-fila-info">` con `.dashboard-fila-titulo` (`RutaViaje`) y `.dashboard-fila-meta` ("Martín Gómez · 12 - AE452KD", dominio con `.patente`; "Chofer pendiente" / "Vehículo pendiente" si faltan).
     - Si el viaje está En viaje, debajo va la barra de avance: `<span class="viajes-hoy-barra" role="progressbar" aria-label="Avance del viaje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="…">` con `.viajes-hoy-barra-fill` al porcentaje (`porcentajeProgresoViaje`). Se recalcula cada 60 segundos, como en `ViajeEnCurso`.
  3. `EstadoBadge` sm con el estado.
- Click o Enter en la fila abre la ficha del viaje en Viajes (`navigate('/viajes', { state: { viajeId } })`). No hay botones de acción.

## Estados
- Cargando: `.loading-state` con `Spinner`.
- Error: `Alert` error "No se pudieron cargar los viajes de hoy."
- Vacío: `.dashboard-empty` con "No hay viajes para hoy".

## Reglas
- La barra mide 4px (máximo 240px de ancho), `radius-full`, track `color-border` y relleno `brand-600`. El estado lo dice el badge: la barra solo muestra el avance y pasado el 100% queda llena, sin estado "Excedido".
- Fila, hover, foco y mobile: ver `.dashboard-fila` en `Dashboard`.
