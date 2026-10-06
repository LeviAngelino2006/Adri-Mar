Ficha de detalle de un registro (viaje, vehículo o usuario) en forma de lista de definiciones. Patrón de página.

## Lo que provee quien lo usa
- `.viajes-detalle` (o `flota-` / `usuarios-`). Arriba, `.viajes-detalle-header` con el `h1` (700) y el estado en `EstadoBadge` md. Después, `<dl class="viajes-detalle-list">` con un `.detalle-item` (`dt` + `dd`) por dato, y al final `.viajes-detalle-actions` con los `Button`.
- Un dato sin valor se muestra como "No registrado".
- El texto libre (observaciones) va en `.detalle-item-ancho`: ocupa todo el ancho y respeta los saltos de línea.

## Reglas
- Grilla de 1 columna, 2 desde 640px y 3 desde 900px. Gap `space-4` × `space-6`.
- `dt` en 14px, 600, `color-text-secondary`. `dd` en 16px y `color-text`, con números tabulares. En la ficha de vehículo, el dominio va con `.patente`.
- Encima va el `.back-link` ("← Volver") en `brand-600` y 600.
