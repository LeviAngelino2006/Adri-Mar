Muestra el recorrido de un viaje en dos variantes: un resumen de una línea para listados y la secuencia completa para el detalle.

## Lo que provee quien lo usa
- `origen` y `destino`: objetos con `nombre`. Si falta uno, se muestra "No registrado" en itálica y `color-text-secondary`, para que no parezca un lugar real.
- `paradas`: las de la API, `[{ orden, ubicacion: { nombre } }]`, ya ordenadas. Opcional.
- `variante`: `resumen` (por defecto) o `completa`.

## Resumen (tarjeta de viaje, Próximos viajes, Viaje en curso)
- "Río Tercero → Córdoba · 2 paradas", con la flecha en `brand-600`. Con una sola parada dice "1 parada"; sin paradas no muestra nada más.
- Los nombres van en 600 y `color-text`. "· 2 paradas" va atenuado (`color-text-secondary`, 400, un poco más chico) y no se parte a la mitad. Toma el tamaño de su contenedor: 16px en la tarjeta de viaje y 15px en Próximos viajes.
- Puede partirse en dos o más líneas. No le pongas `nowrap` al conjunto. El corte tiene que ser prolijo:
  - La flecha va pegada a la primera palabra del destino con un espacio que no se corta (U+00A0): la línea se corta antes de la flecha, nunca después. "Río Tercero" / "→ Aeropuerto Internacional…".
  - "· 2 paradas" va pegada a la última palabra del destino (U+00A0, también entre el punto y el número): nunca queda sola en una línea ni empieza una línea con el punto. "Río Tercero → Villa General" / "Belgrano · 1 parada".
  - Por eso `.ruta-viaje` es texto corrido (`display: inline`), no flex. La flecha lleva `0.125em` de margen a cada lado.

## Completa (ficha de detalle)
- La secuencia entera en vertical: Origen, Parada 1…n y Destino, cada uno con su rol en 13px y `color-text-secondary` y el nombre en 600.
- Misma línea de tiempo que el formulario: línea de 2px en `brand-200`, punto lleno en `brand-600` para origen y destino y punto vacío para las paradas.
- El botón "Ver recorrido en Google Maps" va debajo (ver `EditorRecorrido`).
