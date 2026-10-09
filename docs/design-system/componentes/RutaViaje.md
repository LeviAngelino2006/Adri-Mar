Muestra el recorrido de un viaje en dos variantes: un resumen de una línea para listados y la secuencia completa para el detalle.

## Lo que provee quien lo usa
- `origen` y `destino`: objetos con `nombre`. Si falta uno, se muestra "No registrado" en itálica y `color-text-secondary`, para que no parezca un lugar real.
- `paradas`: las de la API, `[{ orden, ubicacion: { nombre } }]`, ya ordenadas. Opcional.
- `variante`: `resumen` (por defecto) o `completa`.

## Resumen (tarjeta de viaje, Próximos viajes, Viaje en curso)
- "Río Tercero → Córdoba · 2 paradas", con la flecha en `brand-600`. Con una sola parada dice "1 parada"; sin paradas no muestra nada más.
- Los nombres van en 600 y `color-text`. "· 2 paradas" va atenuado (`color-text-secondary`, 400, un poco más chico) y no se parte a la mitad. Toma el tamaño de su contenedor: 16px en la tarjeta de viaje y 15px en Próximos viajes.
- Puede partirse en dos líneas. No le pongas `nowrap` al conjunto.

## Completa (ficha de detalle)
- La secuencia entera en vertical: Origen, Parada 1…n y Destino, cada uno con su rol en 13px y `color-text-secondary` y el nombre en 600.
- Misma línea de tiempo que el formulario: línea de 2px en `brand-200`, punto lleno en `brand-600` para origen y destino y punto vacío para las paradas.
- El botón "Ver recorrido en Google Maps" va debajo (ver `EditorRecorrido`).
