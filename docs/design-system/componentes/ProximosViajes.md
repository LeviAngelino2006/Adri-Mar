Lista de próximos viajes del Dashboard. El viaje en curso no va en esta lista: va arriba, en `ViajeEnCurso`. Patrón de página (`Dashboard.jsx`).

## Lo que provee quien lo usa
- Una `Card` con `.dashboard-panel`, un `h2` (17px) y un `<ul class="proximos-viajes-lista">`.
- Todos los viajes Programados del chofer, sin filtrar por fecha, del más antiguo al más nuevo. Si uno quedó atrasado sigue en la lista, sin marca especial, hasta que se comienza o un gestor lo cancela.
- Un `<li class="proximos-viajes-item">` por viaje con dos partes:
  - `.proximos-viajes-enlace`: un `<button>` sin estilo que envuelve el ícono de calendario (`.proximos-viajes-icono`) y `.proximos-viajes-info` (ruta con `RutaViaje`, salida y vehículo). Al hacer click abre la ficha del viaje en Mis viajes.
  - `.proximos-viajes-accion`: un `Button` secondary "Comenzar viaje", que abre el modal de odómetro (ver `ModalOdometro`).
- La salida va en `.proximos-viajes-salida` con día y hora, "06 oct 15:12" (`formatearDiaYHora`, el mismo formato de `ViajeEnCurso` y de los listados). Hay que mostrar siempre el día porque la lista puede traer viajes de fechas distintas.
- Si hay más viajes que el tope, un `Button` secondary "Ver N más" / "Ver menos".

## Reglas
- Los ítems se separan con un borde superior `color-border`. El ícono va en 36×36, `radius-md`, `brand-50` / `brand-600`.
- El área clickeable tiene hover (solo con mouse) y `:active` en `brand-50`, y `radius-sm`; el botón de acción queda a la derecha. Debajo de 480px el botón pasa a una línea propia a todo el ancho.
- Si no hay viajes, se muestra `.dashboard-empty` centrado, con la pista en `.dashboard-empty-hint` (`color-text-secondary`).
