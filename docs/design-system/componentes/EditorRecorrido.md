Bloque "Recorrido" del formulario de viaje: el origen, las paradas intermedias y el destino como una línea de tiempo vertical, más el botón para ver la ruta en Google Maps.

No está en `bundle.js`: usa `SelectorBuscarOCrear`, que depende del cliente HTTP de la app. La vista previa es una representación estática con sus clases CSS.

```
● Origen        [Río Tercero      ]
│ Parada 1      [Alta Gracia      ]  ↑ ↓ ✕
│ Parada 2      [Museo del Kempes ]  ↑ ↓ ✕
│ + Agregar parada
● Destino       [Córdoba          ]
[Ver recorrido en Google Maps]
```

## Lo que provee quien lo usa
- `origen` y `destino`: `{ id, nombre }` (vacíos mientras no se elijan). `onCambiarOrigen` y `onCambiarDestino` reciben el item de `SelectorBuscarOCrear` (o `null`).
- `paradas`: la lista de filas `[{ clave, id, nombre }]` y `onCambiarParadas(lista)`. El componente no guarda estado: el formulario es el dueño de la lista y esta se transforma con las funciones puras de `utils/paradas` (agregar, quitar, mover, elegir ubicación).
- `errores`: `{ origenId, destinoId, paradas, filasParadas: { [clave]: texto } }`.

## Reglas
- Cada punto es un `FormField` con un `SelectorBuscarOCrear` sobre `/ubicaciones`, el mismo de origen y destino: las paradas nuevas se crean igual. Origen y destino llevan asterisco; las paradas no.
- La `clave` identifica a la FILA (una ubicación puede repetirse en un ida y vuelta) y es la `key` de React: al reordenar, cada selector viaja con su texto.
- Reordenar: botones ↑ y ↓ (funcionan bien en el celular y son accesibles; `aria-label` "Subir la parada 2"). ↑ está deshabilitado en la primera y ↓ en la última. ✕ quita la fila. Los tres son áreas táctiles de 44px: debajo del selector en pantallas angostas y a su derecha desde 640px.
- "+ Agregar parada" inserta una fila vacía antes del destino. Con 9 paradas (el límite de puntos intermedios de los links de Google Maps y del backend) se deshabilita y aparece el hint "Máximo 9 paradas".
- Una fila sin ubicación elegida NO se descarta al guardar: frena el envío y muestra "Elegí una ubicación o quitá la parada" en esa fila. El error desaparece cuando se elige una ubicación. El backend solo recibe ids válidos.
- Dos puntos consecutivos iguales en la secuencia completa [origen, ...paradas, destino] son un error ("La parada 2 es igual al punto anterior", "La parada 3 es igual al destino"), que se muestra debajo del bloque. Una ubicación puede repetirse si no es consecutiva. El mismo origen y destino es válido solo si hay al menos una parada (ida y vuelta).
- Línea de tiempo: línea de 2px en `brand-200`; punto lleno en `brand-600` para origen y destino, punto vacío (borde `brand-600`) para las paradas.

## Botón "Ver recorrido en Google Maps" (`BotonVerRecorrido`)
- Es un `<a href target="_blank" rel="noopener noreferrer">` con el aspecto de `Button` secondary, no un `window.open`: en el celular el enlace abre la app de Google Maps. Lleva un ícono de enlace externo y el texto "(se abre en una pestaña nueva)" solo para lectores de pantalla.
- Sin origen o sin destino no hay ruta: un enlace no se puede deshabilitar, así que se muestra un `Button` secondary deshabilitado con el mismo texto.
- En el formulario va debajo del bloque y se actualiza en vivo con los nombres elegidos en los selectores, aunque el viaje no esté guardado. En la ficha de detalle va debajo de la secuencia (`RutaViaje` completa).
- El link usa el formato oficial de Google Maps URLs (sin API key ni costo) con `utils/googleMaps.urlRecorrido`. Si un nombre no trae coma se le agrega ", Córdoba, Argentina" para que "Museo del Kempes" no se resuelva en otro lado. Google Maps admite 9 puntos intermedios en estos links; la app del celular puede mostrar menos.
