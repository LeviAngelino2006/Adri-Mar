Tabla de listado para escritorio (flota y usuarios), que en mobile se reemplaza por tarjetas. Patrón de página (`FlotaVehiculos.jsx`, `Usuarios.jsx`).

## Lo que provee quien lo usa
- `.flota-table-wrap > table.flota-table`, o el equivalente `usuarios-*`. Cada fila lleva `tabIndex=0`, abre la ficha con click, Enter o Espacio, y tiene la clase `.flota-row`.
- Columnas de flota: Interno, Dominio, Marca / Modelo, Tipo, Kilometraje, Estado. El dominio va en `.flota-row-dominio` y el estado con `EstadoDot` sm.
- Debajo de 768px la tabla se oculta y se muestran `.flota-cards` (ver `TarjetaVehiculo`).

## Reglas
- Superficie `color-surface`, borde `color-border`, `radius-md`. Celdas con padding `space-3` × `space-4` y separador `color-border`.
- Encabezado en `brand-50`, texto `color-text-secondary`, 13px, 600, en mayúsculas con letter-spacing 0.02em.
- Hover de fila `brand-50`. Foco: outline 2px `brand-600` con offset -2px.
- Dominio en `brand-600` con `.patente` (mono, mayúsculas, letter-spacing 0.06em). Las celdas usan números tabulares para que interno y kilometraje queden alineados.
- El estado va con `EstadoDot`: en tablas el punto alcanza.
