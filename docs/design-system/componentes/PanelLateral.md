Panel lateral (drawer) en `components/ui/PanelLateral.jsx`: el detalle de un elemento de una lista y lo que se puede hacer con él, sin salir de la lista. Hoy lo usa Mantenimiento (panel de cada vehículo, en su variante `centrado`). Solo tokens.

## Cuándo usarlo
- Cuando el usuario primero elige un elemento de una lista y después decide qué hacer con él (registrar algo, ver su historial), y la lista tiene que seguir ahí al cerrar.
- No para confirmar una acción (eso es `ConfirmModal`) ni para un formulario suelto que no depende de un elemento de la lista (eso es un modal o una página).
- Un formulario que se abre desde el panel se muestra **dentro del panel**, con "← Volver"; nunca un modal encima del panel.

## Anatomía
- Fondo `overlay` sobre toda la pantalla (z-index 50, como los modales; el `Toast` queda por encima).
- `<aside role="dialog" aria-modal="true">` nombrado por su título (`aria-labelledby`), fondo `color-surface` y `shadow-lg`.
- Encabezado fijo con borde inferior `color-border`:
  - opcional, "← Volver" (`.back-link`) arriba del título, para volver a la vista anterior del panel;
  - título `h2` (18px, 600) y subtítulo en `color-text-secondary`;
  - botón ✕ de 44 × 44 a la derecha ("Cerrar"), igual que el de `ModalMarco`.
- Cuerpo con scroll propio (`overscroll-behavior: contain`): la página de atrás no se mueve.

## Medidas
- Celular (< 640px): ocupa toda la pantalla, con el safe area arriba y abajo. Padding del encabezado `space-4` y del cuerpo `space-4`.
- Desde 640px: anclado a la derecha, alto completo, ancho `min(480px, 100vw)` y borde izquierdo `color-border`. Padding `space-5` / `space-6`.
- Variante `centrado`: ventana emergente en el medio de la pantalla en todos los tamaños, como los modales de Documentación. Fondo con padding `max(space-4, inset)` en cada lado, tarjeta de hasta 640px de ancho, `radius-lg`, sin borde y alto fijo `min(720px, 100%)`: cuando llega algo que se carga adentro, la ventana no crece ni se vuelve a centrar (si no entra, scrollea el cuerpo).

## Comportamiento
- Se cierra con la ✕, con Escape o tocando el fondo (no tocando adentro).
- Mientras está abierto, `body` no scrollea; al cerrarse se restaura.
- Al abrirse, el foco va al título (`tabIndex=-1`, sin contorno con el mouse, con contorno `brand-600` con teclado). Al cerrarse vuelve al elemento que lo abrió (por ejemplo, la tarjeta).
- Prop `vista`: cuando cambia (de un resumen a un formulario y al revés), el cuerpo vuelve arriba y el foco va al título nuevo.

## Props
- `titulo`, `subtitulo` (nodos).
- `onClose()`: obligatorio.
- `onVolver()`: si viene, muestra "← Volver".
- `vista`: clave de lo que se está mostrando (ver arriba).
- `centrado`: ventana emergente centrada en vez del drawer (por defecto, `false`).
- `children`: el contenido del cuerpo.
