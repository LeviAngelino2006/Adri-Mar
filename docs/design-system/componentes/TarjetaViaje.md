Tarjeta de un viaje en el listado de Viajes. Es la tarjeta de `Listado` con este contenido. Patrón de página (`Viajes.jsx`).

## Contenido
- `.listado-card-marca` con el ícono de ruta.
- `.listado-card-top`: el chofer en `.listado-card-titulo` ("Chofer pendiente" si falta) y el `EstadoBadge` sm con el tono del estado.
- `.listado-card-sub` con `RutaViaje`.
- `.listado-card-detalle`: el vehículo ("2 - AB123CD (Mercedes-Benz OH 1618 L)" o "Vehículo pendiente").
- `.listado-card-pie`: a la izquierda día y rango horario ("11 oct · 10:00 - 14:00" o "Fechas pendientes") y a la derecha "26 km estimados" (o "Km pendientes").

## Variante de Mis viajes (vista del chofer)
- El título (`.listado-card-titulo`) es el vehículo: "2 - AB123CD", con solo el dominio en `.patente` ("Vehículo pendiente" si falta). No se muestra el chofer, que es el propio usuario, y se omite `.listado-card-detalle` porque el vehículo ya está en el título.
- Ruta, badge de estado y pie son los mismos.
- Los gestores (Administrador y Encargado) ven siempre la versión con el chofer como título, también cuando entran a Mis viajes.

## Reglas
- Estructura, medidas, hover y foco: ver `Listado`. No hay indicador de vencido: un viaje atrasado sigue Programado hasta que se comienza o se cancela.
- Las tarjetas se apilan en `.listado-cards`, una debajo de otra y a todo el ancho.
