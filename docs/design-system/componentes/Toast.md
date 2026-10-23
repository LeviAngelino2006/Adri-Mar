Confirmación breve y flotante, centrada abajo de la pantalla.

## Lo que provee quien lo usa
- `children`: una frase corta ("Viaje confirmado").
- `action`: opcional, un enlace o botón secundario (por ejemplo "Avisar por WhatsApp") que va a la derecha del texto, separado por una línea fina. Va en el color inverso, en negrita y subrayado, con un área táctil de 44px de alto.
- El montaje y el tiempo de cierre: el componente no se oculta solo. Un toast común dura 3,5 s; uno con acción, 8 s, para dar tiempo a leerlo y tocarla.

## Reglas
- Fondo `color-inverse-bg`, texto `color-inverse-text`, radio `radius-sm`, sombra `shadow-lg`, texto `body-sm`.
- A 24px del borde de abajo. Si hay una `BarraAccionFija` fija al pie, se muestra encima de ella (`bottom: calc(24px + var(--alto-barra-accion, 0px))`).
- Para errores que requieren acción usar `Alert error`, no un toast.
