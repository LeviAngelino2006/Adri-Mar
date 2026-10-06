Ficha de detalle de un registro. Patrón de página con dos variantes: la ficha de viaje, agrupada en secciones dentro de una sola `Card`, y la ficha simple de vehículo y usuario, en lista de definiciones.

## Ficha de viaje (agrupada)
Estructura:
- `.back-link` ("← Volver al listado"), y `.viajes-detalle-header` con el `h1` y el `EstadoBadge` md.
- Una `Card` con `.detalle-card` y una `<section class="detalle-seccion">` por bloque. Cada sección tiene `<h2 class="detalle-seccion-titulo">` (13px, 600, mayúsculas, `color-text-secondary`) y un `<dl class="detalle-grid">` con un `.detalle-item` (`dt` + `dd`) por dato. Las secciones se separan con un borde `color-border`.
- Debajo, `.viajes-detalle-actions` con los `Button`.

Secciones, en este orden y con estos pares (los mismos del formulario `FormularioViaje`):
1. **Viaje**: Cliente (`.detalle-item-ancho`, `.detalle-item-destacado`) · Origen | Destino.
2. **Programación**: Inicio | Fin (día y hora, "07 oct 08:00").
3. **Asignación**: Chofer | Vehículo ("2 - AB123CD (Mercedes-Benz OH 1618 L)") · Kilómetros estimados.
4. **Recorrido real**: solo si el viaje ya empezó. Hora real de inicio | Hora real de fin · Odómetro inicial | Odómetro final · Km realizados. Los viajes En viaje muestran solo lo que ya existe.
5. **Observación**: solo si hay texto; ancho completo, respeta los saltos de línea.
Los datos administrativos (solo Administrador y Encargado) siguen en su propio bloque debajo de la Card, con la misma estética de secciones.

Reglas:
- Una columna en mobile y dos desde 640px. Padding de sección `space-5` × `space-6`; gap de la grilla `space-4` × `space-6`.
- `dt` en 14px y `color-text-secondary`; `dd` en 16px y `color-text`, con números tabulares. Fechas siempre "07 oct 08:00" (`formatearDiaYHora`), nunca "07/10/2026, 08:00 a. m.".
- Un dato sin valor se muestra como "No registrado". Una sección sin ningún dato no se muestra.
- En la ficha de un viaje no va "Kilometraje actual del vehículo": es un dato del vehículo, cambia con cada viaje y confunde en un viaje ya finalizado. Se reemplaza por el odómetro inicial y final del viaje.

## Ficha simple (vehículo y usuario)
- `.flota-detalle` o `.usuarios-detalle`, con el mismo header, `<dl class="viajes-detalle-list">` (1 columna, 2 desde 640px y 3 desde 900px) y `.viajes-detalle-actions`. En vehículo, el dominio va con `.patente`.
- El texto libre va en `.detalle-item-ancho`.
