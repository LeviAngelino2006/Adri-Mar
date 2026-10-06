Marca visual "Vencido" o "Excedido" junto a un viaje fuera de horario.

## Lo que provee quien lo usa
- `viaje`: el objeto serializado por el backend. Muestra "Vencido" si `viaje.vencido` (Programado pasado de hora) o "Excedido" si `viaje.excedido` (En viaje pasado de la hora de llegada). Si ninguno es true, no renderiza nada.
- `size`: `sm` (11px, en listas) o `md` (13px, en el detalle).

## Reglas
- Es solo visual: no es un estado ni bloquea acciones.
- Usa el trío de error: texto `state-error-text` sobre `state-error-bg` (5.3:1), borde `state-error-border`, con el ícono de alerta.
