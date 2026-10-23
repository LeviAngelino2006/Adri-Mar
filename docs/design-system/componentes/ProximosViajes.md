Panel "Tus viajes pendientes" del chofer en el Dashboard: sus viajes Programados, también los atrasados de días anteriores. El viaje en curso no va en esta lista: va arriba, destacado en `ViajeEnCurso`. Patrón de página (`Dashboard.jsx`, componente `ProximosViajes`).

## Lo que provee quien lo usa
- Una `Card` con `.dashboard-panel`, el `h2` "Tus viajes pendientes" (17px) y los viajes agrupados por día de inicio: un `<section class="proximos-viajes-grupo">` por día con un `<h3 class="proximos-viajes-dia">` y un `<ul class="proximos-viajes-lista">`.
- Todos los viajes Programados del chofer, sin filtrar por fecha, del más antiguo al más nuevo (`ordenarPorInicio` de `utils/misViajes.js`, el mismo orden que Próximos de Mis viajes). Si uno quedó atrasado sigue en la lista hasta que se comienza o un gestor lo cancela: va primero, bajo el título de su día ("Ayer · dom 18 oct"), sin color ni badge que marque el atraso.
- El título del día es el mismo del listado (`agruparViajesPorDia`): "Ayer · dom 18 oct", "Hoy · lun 19 oct", "Mañana · mar 20 oct" o "mar 27 oct". `.proximos-viajes-dia` copia el estilo de `.listado-dia` (13px, 600, mayúsculas, letter-spacing 0.04em, `color-text-secondary`), con margen inferior `space-1`; entre grupos, `space-4`. Con el tope de 3, se agrupan los visibles.
- Un `<li class="proximos-viajes-item">` por viaje con dos partes:
  - `.proximos-viajes-enlace`: un `<button>` sin estilo que envuelve el bloque de fecha (`.fecha-tile`, el mismo de `TarjetaViaje`, con el día de inicio) y `.proximos-viajes-info` (ruta con `RutaViaje`, horario y vehículo). Al hacer click abre la ficha del viaje en Mis viajes.
  - `.proximos-viajes-accion`: un `Button` secondary "Comenzar viaje", que abre el modal de odómetro (ver `ModalOdometro`).
- El horario va en `.proximos-viajes-salida`, con el mismo formato del sub de `TarjetaViaje`: "15:12 – 18:00", o "22:00 – 10 oct 02:00" si el fin cae otro día. El día lo da el bloque de fecha.
- El vehículo va en `.proximos-viajes-vehiculo`: "12 - AE452KD", con el dominio en `.patente` y sin prefijo.
- Si hay más viajes que el tope (3), un `Button` secondary "Ver N más" / "Ver menos".

## Reglas
- Los ítems se separan con un borde superior `color-border`.
- El área clickeable tiene hover (solo con mouse) y `:active` en `brand-50`, y `radius-sm`; el botón de acción queda a la derecha. Debajo de 480px el botón pasa a una línea propia a todo el ancho.
- Si no hay viajes, se muestra `.dashboard-empty` con "No tenés viajes pendientes", en texto gris centrado. Los estados vacíos del Dashboard son solo texto, sin ícono.
