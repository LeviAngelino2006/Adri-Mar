Barra con la acción principal de una ficha, fija al pie de la pantalla en el celular. Se usa en la ficha de viaje de Mis viajes: "Comenzar viaje" en un Programado y "Finalizar viaje" en un En viaje. No está en `bundle.js`: vive en la app (`components/ui/BarraAccionFija.jsx`).

## Cuándo usarla
- Para la única acción que la persona viene a hacer a esa ficha, cuando la ficha es más alta que la pantalla del celular y la acción quedaría al final (en Mis viajes, "Finalizar viaje" quedaba debajo de 12 datos).
- Una sola por pantalla, con una sola acción primaria adentro. Las secundarias siguen en la ficha.
- No la uses en formularios ni en listados.

## Lo que provee quien la usa
- `children`: la acción. Un `Button` primary, o `BotonComenzarViaje` (también deshabilitado, con su motivo y "Ver el viaje en curso").
- `className`: la clase de la fila de acciones que tiene en escritorio (en la ficha de viaje, `viajes-detalle-actions`).

## Reglas
- **Escritorio (768px o más):** no cambia nada. Es la fila de acciones de siempre, debajo de la card.
- **Celular (menos de 768px):**
  - `position: fixed` al pie, a todo el ancho, con fondo `color-surface` y borde superior `color-border`, sin sombra.
  - Padding `space-3` arriba y `space-4` a los costados. Abajo, `space-3` más `env(safe-area-inset-bottom)`, para el indicador de inicio del iPhone. Por eso el viewport lleva `viewport-fit=cover` (`index.html`); ver "Safe area" en el README, que es global.
  - La acción va a todo el ancho y mide 44px o más (el alto mínimo de `Button`). Si "Comenzar viaje" está deshabilitado, el botón va a todo el ancho y debajo van el motivo y el enlace "Ver el viaje en curso" (ver `BotonComenzarViaje` en `ProximosViajes`).
  - `z-index` 15: por encima del contenido y por debajo de la topbar, el menú, los modales y el `Toast`.
- **El contenido no queda tapado:** mientras la barra está fija, publica su alto en la variable `--alto-barra-accion` (en `<html>`, medido con `ResizeObserver`). `.layout-content` lo suma a su padding de abajo y el `Toast` se muestra encima de la barra. Sin barra, o en escritorio, la variable vale 0.
