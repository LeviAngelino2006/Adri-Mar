Lista de próximos viajes del Dashboard. El viaje en curso no va en esta lista: va arriba, en `ViajeEnCurso`. Patrón de página (`Dashboard.jsx`).

## Lo que provee quien lo usa
- Una `Card` con `.dashboard-panel`, un `h2` (17px) y un `<ul class="proximos-viajes-lista">`.
- Un `<li class="proximos-viajes-item">` por viaje: el ícono de calendario en `.proximos-viajes-icono` y luego `.proximos-viajes-info`, con la ruta (`RutaViaje`), la salida y el vehículo.
- Si hay más viajes, un `Button` secondary "Ver N más" / "Ver menos".

## Reglas
- Los ítems se separan con un borde superior `color-border`. El ícono va en 36×36, `radius-md`, `brand-50` / `brand-600`.
- Si no hay viajes, se muestra `.dashboard-empty` centrado, con la pista en `.dashboard-empty-hint` (`color-text-secondary`).
