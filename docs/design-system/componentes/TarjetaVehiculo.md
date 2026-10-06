Tarjeta de un vehículo en el listado de Flota. Es la tarjeta de `Listado` con este contenido. Patrón de página (`FlotaVehiculos.jsx`).

## Contenido
- `.listado-card-marca` con el ícono de colectivo o combi según el tipo.
- `.listado-card-top`: título `.listado-card-titulo` con "interno - dominio" (por ejemplo "12 - AE452KD"; solo el dominio lleva `.patente`) y el `EstadoBadge` sm: Operativo (success), En taller (warning) o Dado de baja (neutral).
- `.listado-card-sub`: marca y modelo.
- `.listado-card-pie`: a la izquierda el tipo ("Colectivo") y a la derecha el kilometraje con separador de miles es-AR ("57.345 km").

## Reglas
- Estructura, medidas, hover y foco: ver `Listado`.
- El orden del listado es por número de interno, de menor a mayor.
- La versión de usuarios usa la misma tarjeta con el `Avatar` de 40px en lugar del ícono.
