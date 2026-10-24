Panel del Dashboard de Administrador y Encargado con los viajes del día: qué sale, qué está en la ruta y qué ya terminó. Va a todo el ancho, arriba de las dos columnas (ver `Dashboard`). Componente de la app (`PanelViajesDeHoy.jsx`); no está en `bundle.js` porque pide los viajes al backend.

## Qué viajes muestra
- Los Programados, En viaje y Finalizados cuya fecha de inicio es hoy (día de Córdoba).
- Además, cualquier viaje En viaje aunque haya salido antes (por ejemplo, ayer a la noche).
- Sin A confirmar ni Cancelados.
- Orden: por fecha de inicio, del más temprano al más tarde.
- Arriba, y solo si hay alguno, el grupo **Sin cerrar**: los viajes de días anteriores que siguen A confirmar, Programado o En viaje, con el mismo criterio que la vista Próximos del listado de Viajes. Lo decide el backend (`sinCerrar` en la respuesta de `vista=proximos`); el front no recalcula la regla. Un En viaje que empezó ayer aparece una sola vez, en Sin cerrar.

## Cómo se cargan
Tres consultas a `GET /viajes` (el endpoint acepta un solo estado):
- `vista=proximos&fechaHasta=` hoy: los sin cerrar, ya marcados, y los abiertos de hoy.
- `vista=proximos&estado=EN_VIAJE`: todos los En viaje, también los comenzados antes de su día.
- `fechaDesde` y `fechaHasta` iguales a hoy (`hoyCordobaISO()`), por los Finalizados de hoy. El backend toma una fecha suelta como el día entero de Córdoba (de 00:00 a 23:59:59.999).

Se unen sin duplicados (queda la copia con `sinCerrar`) y se sacan de los de hoy los A confirmar y los Cancelados (`utils/viajesDeHoy.js`). Un A confirmar sin cerrar sí queda.

## Estructura
- `Card` con `.dashboard-panel`.
- `.dashboard-panel-header`: el `h2` "Viajes de hoy" y, a la derecha, `.dashboard-resumen` con "5 viajes · 1 en viaje · 2 finalizados" (14px, `color-text-secondary`, números tabulares). Se omiten las partes en cero, salvo el total, y el singular va bien escrito ("1 viaje", "1 finalizado"). Cuenta solo los de hoy, no los sin cerrar. Sin viajes de hoy, el resumen no se muestra.
- Con sin cerrar, el panel tiene dos partes, sin color ni badge para el atraso:
  1. `<section aria-label="Sin cerrar">` con `<h3 class="dashboard-grupo-dia">` "Sin cerrar" y un grupo por día, del más viejo al más nuevo, cada uno con su `<h4 class="viajes-hoy-dia">` ("Ayer · vie 23 oct", "mié 21 oct"; 13px, 500, `color-text-secondary`, sin mayúsculas) y su `dashboard-lista`. En esas filas la hora va sola cuando es de ese día (el día lo dice el título), y una hora de hoy lleva "hoy" ("hoy 06:00").
  2. `<section aria-label="Hoy">` con `<h3 class="dashboard-grupo-dia">` "Hoy · sáb 24 oct" y la lista de hoy, o "No hay viajes para hoy" si no hay.

  Sin sin cerrar, el panel es solo la lista de hoy, sin títulos de grupo.
- `<ul class="dashboard-lista">` con un `<li>` y un `<button class="dashboard-fila">` por viaje. Cada fila tiene:
  1. `<span class="hora-col">07:30<small>10:00</small></span>`: la salida y, debajo, la llegada. Si una de las dos cae otro día, lleva el día relativo: "ayer 22:00", "mañana 02:00".
  2. `<span class="dashboard-fila-info">` con `.dashboard-fila-titulo` (`RutaViaje`) y `.dashboard-fila-meta` ("Martín Gómez · 12 - AE452KD", dominio con `.patente`; "Chofer pendiente" / "Vehículo pendiente" si faltan).
     - Si el viaje está En viaje, debajo va la barra de avance: `<span class="viajes-hoy-barra" role="progressbar" aria-label="Avance del viaje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="…">` con `.viajes-hoy-barra-fill` al porcentaje (`porcentajeProgresoViaje`). Se recalcula cada 60 segundos, como en `ViajeEnCurso`.
  3. `EstadoBadge` sm con el estado.
- Click o Enter en la fila abre la ficha del viaje en Viajes (`navigate('/viajes', { state: { viajeId } })`); un Finalizado, en la vista Anteriores (`/viajes?tab=anteriores`), que es donde está en el listado. No hay botones de acción.

## Estados
- Cargando: `Cargando` en filas (vía `EstadoCarga`).
- Error: `EstadoCarga` con "No pudimos cargar los viajes de hoy. Revisá tu conexión." y "Reintentar".
- Vacío: `.dashboard-empty` con "No hay viajes para hoy".

## Reglas
- La barra mide 4px (máximo 240px de ancho), `radius-full`, track `color-border` y relleno `brand-600`. El estado lo dice el badge: la barra solo muestra el avance y pasado el 100% queda llena, sin estado "Excedido".
- Fila, hover, foco y mobile: ver `.dashboard-fila` en `Dashboard`.
