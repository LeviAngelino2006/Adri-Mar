Paneles del Dashboard de Administrador y Encargado con los viajes del día y los que quedaron abiertos de días anteriores:

- **Viajes de hoy**: qué sale hoy, qué está en la ruta y qué ya terminó. Va a todo el ancho, arriba de las dos columnas (ver `Dashboard`). Componente de la app (`PanelViajesDeHoy.jsx`).
- **Sin cerrar**: los viajes de días anteriores que siguen abiertos. Va en la columna derecha, arriba de Documentación, y solo si hay alguno. Componente de la app (`PanelViajesSinCerrar.jsx`).

Ninguno de los dos está en `bundle.js` porque piden los viajes al backend.

# Viajes de hoy

## Qué viajes muestra
- Solo lo de hoy: los Programados, En viaje y Finalizados cuya fecha de inicio es hoy (día de Córdoba).
- Además, un En viaje que se comenzó antes de su día (sale más tarde, pero el chofer ya lo comenzó).
- Sin A confirmar ni Cancelados.
- Sin los **sin cerrar** (de días anteriores y todavía abiertos, también un En viaje que empezó ayer): esos van en su propio panel, abajo. Lo decide el backend (`sinCerrar`); el front no recalcula la regla. Así cada viaje aparece una sola vez en el Dashboard.
- Orden: por fecha de inicio, del más temprano al más tarde.

## Cómo se cargan
Dos consultas a `GET /viajes` (el endpoint acepta un solo estado):
- `fechaDesde` y `fechaHasta` iguales a hoy (`hoyCordobaISO()`): los de hoy en cualquier estado, también los Finalizados. El backend toma una fecha suelta como el día entero de Córdoba (de 00:00 a 23:59:59.999).
- `vista=proximos&estado=EN_VIAJE`: todos los En viaje, marcados con `sinCerrar` por la vista.

Se unen sin duplicados y se sacan los A confirmar, los Cancelados y los marcados `sinCerrar` (`utils/viajesDeHoy.js`).

## Estructura
- `Card` con `.dashboard-panel`.
- `.dashboard-panel-header`: el `h2` "Viajes de hoy" y, a la derecha, `.dashboard-resumen` con "5 viajes · 1 en viaje · 2 finalizados" (14px, `color-text-secondary`, números tabulares). Se omiten las partes en cero, salvo el total, y el singular va bien escrito ("1 viaje", "1 finalizado"). Sin viajes, el resumen no se muestra.
- Una sola lista, sin grupos ni subtítulos: `<ul class="dashboard-lista">` con un `<li>` y un `<button class="dashboard-fila">` por viaje. Cada fila tiene:
  1. `<span class="hora-col">07:30<small>10:00</small></span>`: la salida y, debajo, la llegada. Si una de las dos cae otro día, lleva el día relativo: "ayer 22:00", "mañana 02:00".
  2. `<span class="dashboard-fila-info">` con `.dashboard-fila-titulo` (`RutaViaje`) y `.dashboard-fila-meta` ("Martín Gómez · 12 - AE452KD", dominio con `.patente`; "Chofer pendiente" / "Vehículo pendiente" si faltan).
     - Si el viaje está En viaje, debajo va la barra de avance: `<span class="viajes-hoy-barra" role="progressbar" aria-label="Avance del viaje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="…">` con `.viajes-hoy-barra-fill` al porcentaje (`porcentajeProgresoViaje`). Se recalcula cada 60 segundos, como en `ViajeEnCurso`.
  3. `EstadoBadge` sm con el estado.
- Click o Enter en la fila abre la ficha del viaje en Viajes (`navigate('/viajes', { state: { viajeId } })`); un Finalizado, en la vista Anteriores (`/viajes?tab=anteriores`), que es donde está en el listado. No hay botones de acción. Lo arma `destinoFichaViaje` (`utils/vistasViajes.js`), igual para los dos paneles.

## Estados
- Cargando: `Cargando` en filas (vía `EstadoCarga`).
- Error: `EstadoCarga` con "No pudimos cargar los viajes de hoy. Revisá tu conexión." y "Reintentar".
- Vacío: `.dashboard-empty` con "No hay viajes para hoy".

## Reglas
- La barra mide 4px (máximo 240px de ancho), `radius-full`, track `color-border` y relleno `brand-600`. El estado lo dice el badge: la barra solo muestra el avance y pasado el 100% queda llena, sin estado "Excedido".
- Fila, hover, foco y mobile: ver `.dashboard-fila` en `Dashboard`.

# Sin cerrar

## Qué viajes muestra
- Los viajes de días anteriores que siguen A confirmar, Programado o En viaje: el mismo grupo "Sin cerrar" de la vista Próximos del listado de Viajes. Lo decide el backend: `GET /viajes?vista=proximos` marca cada viaje con `sinCerrar` y el panel toma esos, sin recalcular la regla (`utils/viajesSinCerrar.js`). Se pide con `fechaHasta=` hoy, porque los sin cerrar son todos de días anteriores.
- Del más viejo al más nuevo. Se muestran 5 (`MAX_SIN_CERRAR`).
- El panel **aparece solo si hay alguno**. Cargado y sin ninguno, no se renderiza (ni la `Card`): la columna derecha queda con Documentación sola.

## Estructura
- `Card` con `.dashboard-panel`, `role="region"` y `aria-label="Sin cerrar"`, el mismo estilo que Viajes por confirmar y Documentación.
- `.dashboard-panel-header`: el `h2` "Sin cerrar" y, a la derecha, `.dashboard-resumen` con la cantidad total ("1 viaje", "7 viajes"), aunque se muestren 5.
- `<ul class="dashboard-lista">` con un `<button class="dashboard-fila sin-hora">` por viaje:
  1. `.dashboard-fila-info` con `.dashboard-fila-titulo` (`RutaViaje`) y `.dashboard-fila-meta` con la fecha: el día como en los títulos del listado de Viajes y la hora de salida ("Ayer · vie 23 oct · 08:00", "mié 21 oct · 13:00"; el año solo si no es el año en curso).
  2. `EstadoBadge` sm con el estado (A confirmar, Programado o En viaje).
  - Sin color ni badge para el atraso: el viaje sigue en su estado y el día ya dice que es de antes (ver README, "Los viajes no tienen estados Vencido ni Excedido").
- Click o Enter en la fila abre la ficha del viaje en Viajes (Próximos), con `destinoFichaViaje`.
- Si hay más de 5, debajo de la lista un `Button` secondary `.dashboard-ver-mas` "Ver todos", que lleva a Viajes (`/viajes`, la vista Próximos), donde están todos arriba de todo, en su grupo "Sin cerrar".

## Estados
- Cargando: el panel se ve con `Cargando` en filas (vía `EstadoCarga`), porque todavía no se sabe si hay.
- Error: el panel se ve con `EstadoCarga`, "No pudimos cargar los viajes sin cerrar. Revisá tu conexión." y "Reintentar", sin la cantidad en el encabezado. Nunca se oculta por un error.
- Vacío: no hay panel.
