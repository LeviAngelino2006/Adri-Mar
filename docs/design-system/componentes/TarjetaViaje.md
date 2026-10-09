Tarjeta de un viaje en el listado de Viajes y Mis viajes. Es la tarjeta de `Listado` con este contenido. Las tarjetas van agrupadas por día de inicio (ver "Agrupado por día" en `Listado`). Patrón de página (`TarjetaViaje.jsx`, usada por `Viajes.jsx` y `MisViajes.jsx`).

## Contenido
- **Marca:** el bloque de fecha (`.fecha-tile`) con el día de inicio, en día de Córdoba, en lugar de un ícono. Marcado: `<div class="listado-card-marca fecha-tile" aria-hidden="true"><span class="fecha-tile-dia">09</span><span class="fecha-tile-mes">oct</span></div>`. El día va con dos dígitos. Todo viaje tiene fecha de inicio (es obligatoria): no hay caso "sin fecha". `ListadoCard` recibe la clase con la prop `marcaClassName`.
- **Título (`.listado-card-titulo`):** la ruta con `RutaViaje` (paradas incluidas). A la derecha, el `EstadoBadge` sm con el tono del estado.
- **Sub (`.listado-card-sub`):** el horario y el chofer, separados por " · ": "07:30 – 10:00 · Martín Gómez".
  - El separador del horario es una raya (–) con espacios.
  - Si el fin cae otro día, el fin lleva el día: "22:00 – 11 oct 02:00".
  - Sin fecha de fin, solo la hora de inicio: "07:30".
  - Sin chofer: "Chofer pendiente".
- **Sin línea de detalle** (`.listado-card-detalle`).
- **Pie (`.listado-card-pie`):** a la izquierda el vehículo, "12 - AE452KD · Mercedes-Benz O500", con solo el dominio en `.patente` ("Vehículo pendiente" si falta). A la derecha "110 km estimados" o "Km pendientes".

## Variante chofer (Mis viajes de un chofer)
- Igual a la de los gestores, pero el sub es solo el horario: el chofer es el propio usuario.
- El chofer no ve viajes A confirmar: los filtra el backend.
- Los gestores (Administrador y Encargado) ven siempre la versión con el chofer, también cuando entran a Mis viajes.

## Bloque de fecha (`.fecha-tile`)
- 48px de ancho, alto mínimo 48px, padding vertical `space-1`, `radius-md`, fondo `brand-50` y texto `brand-700`, interlineado 1.1 y números tabulares.
- Día (`.fecha-tile-dia`) en 19px y 600; mes (`.fecha-tile-mes`) en 12px, mayúsculas y letter-spacing 0.04em.
- Es decorativo (`aria-hidden`): la fecha ya está en el título del grupo. Lo comparten la tarjeta de viaje y `ProximosViajes` (`FechaTile.jsx` / `FechaTile.css`).

## Reglas
- Estructura, medidas, hover y foco: ver `Listado`. No hay indicador de vencido: un viaje atrasado sigue Programado hasta que se comienza o se cancela.
- Fechas y horas en hora de Córdoba (`formatearHorarioViaje` y `partesFechaTile` en `utils/viajeFormato.js`).
