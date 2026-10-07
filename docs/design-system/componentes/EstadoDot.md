Etiqueta de estado con un punto de color, para tablas y listas densas. En tarjetas y fichas usá `EstadoBadge`.

## Lo que provee quien lo usa
- `color`: el token del estado (`viaje-*` o `vehiculo-*`), por ejemplo `var(--viaje-programado)`.
- `children`: la etiqueta del estado ("Programado", "En taller"). Siempre presente: el color solo no comunica.
- `size`: `sm` (punto 7px, texto 14px) o `md` (punto 8px, texto 15px).

## Reglas
- Etiqueta en 600, `color-text`. El punto mide al menos 3:1 sobre blanco.
- Viajes: A confirmar `viaje-a-confirmar`, Programado `viaje-programado`, En viaje `viaje-en-viaje`, Finalizado `viaje-finalizado`, Cancelado `viaje-cancelado`.
- Vehículos: Operativo `vehiculo-operativo`, En taller `vehiculo-en-taller`, Dado de baja `vehiculo-dado-de-baja`.
