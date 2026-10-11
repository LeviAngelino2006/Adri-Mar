Estado de carga de una pantalla, panel o modal: nada al principio, después un esqueleto con la forma del contenido y, si la carga tarda, el colectivo andando con un mensaje. Reemplaza al `.loading-state` con `Spinner` y "Cargando…". Componente de la app (`components/ui/Cargando.jsx`).

## Las tres etapas
| Tiempo desde que empieza la carga | Qué se ve |
| --- | --- |
| 0 a 300ms | Nada. Si los datos llegan antes, no hay parpadeo. |
| 300ms a 3s | El esqueleto (`forma`). |
| Más de 3s | El colectivo andando, "Conectando con el servidor…" y, debajo, "Puede tardar unos segundos más." Reemplaza al esqueleto. |

El caso de más de 3s es sobre todo el primer pedido después de un rato sin uso, cuando el backend en Render tarda en arrancar. Las etapas las maneja un hook (`useEtapaCarga(activo)` → `'oculto' | 'esqueleto' | 'lento'`) con dos timers que se limpian al desmontar o cuando `activo` pasa a `false`.

## Lo que provee quien lo usa
- `forma`:
  - `"tarjetas"`: la anatomía de `.listado-card` (marca de 48px, título, sub y pie). Para Viajes, Mis viajes, Flota, Usuarios, el listado de Documentación y la ficha de Documentación.
  - `"filas"`: hora de 56px y dos líneas, separadas por un borde superior. Para los paneles del Dashboard (Viajes de hoy, Viajes por confirmar, Documentación, Tus próximos viajes) y el historial de un documento.
- `cantidad`: cuántas tarjetas o filas dibujar. 3 por defecto; 2 en el historial.
- El componente se monta solo mientras `cargando` es `true`. El estado de error y el vacío no cambian.

## Marcado
- Contenedor `<div class="carga" role="status" aria-live="polite">` con un `<span class="sr-only">Cargando…</span>` que se lee en las etapas de esqueleto y colectivo. El esqueleto va con `aria-hidden="true"`.
- Esqueleto "tarjetas": `.esqueleto-tarjetas` con una `.esqueleto-tarjeta` por ítem: `.esqueleto.esqueleto-marca` y `.esqueleto-cuerpo` con tres `.esqueleto.esqueleto-linea` (`-titulo`, `-sub`, `-pie`).
- Esqueleto "filas": una `.esqueleto-fila` por ítem, con `.esqueleto.esqueleto-hora` y un cuerpo de dos líneas (`-titulo` y `-sub`).
- Colectivo: `.carga-colectivo` con `.carga-colectivo-ruta`, adentro `.carga-colectivo-bus` (el ícono de colectivo de `IconoVehiculo` a 56px; en la variante chica, 40px, `aria-hidden`), y debajo `.carga-colectivo-texto` y `.carga-colectivo-hint`.

## Login
Al ingresar, el botón pasa a "Ingresando…" como siempre. Si la respuesta tarda más de 3s, debajo del formulario aparece la variante chica (`.carga-colectivo.carga-colectivo-chica`) con "Conectando con el servidor…" y el mismo hint. Es justo el caso del servidor dormido: el login suele ser el primer pedido del día.

## Reglas
- El esqueleto usa `color-border` sobre `color-surface` y pulsa (opacidad 1 → 0.5, 1.4s). El colectivo va en `brand-600` y la ruta punteada en `state-neutral-border`. Las líneas corren hacia la izquierda y el colectivo rebota 2px: parece que avanza sin moverse de lugar.
- Con `prefers-reduced-motion: reduce` no hay animaciones: esqueleto y colectivo quedan quietos.
- No usar el logo para cargas: es el wordmark en PNG y no se redibuja ni se anima.
- Fuera de estos casos no cambia nada: los botones siguen con su `Spinner` y su gerundio ("Guardando…"), y las acciones dentro de un modal también.
