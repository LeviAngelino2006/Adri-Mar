Estado de carga de una pantalla, panel o modal: nada al principio, después un esqueleto con la forma del contenido y, si la carga tarda, el colectivo andando con un mensaje. Reemplaza al `.loading-state` con `Spinner` y "Cargando…". Componente de la app (`components/ui/Cargando.jsx`).

## Las tres etapas
| Tiempo desde que empieza la carga | Qué se ve |
| --- | --- |
| 0 a 300ms | Nada. Si los datos llegan antes, no hay parpadeo. |
| 300ms a 3s | El esqueleto (`forma`). |
| Más de 3s | El esqueleto se queda y aparece un solo colectivo arriba de la pantalla, andando, con "Conectando con el servidor…" y, debajo, "Puede tardar unos segundos más." |

El caso de más de 3s es sobre todo el primer pedido después de un rato sin uso, cuando el backend en Render tarda en arrancar. Las etapas las maneja un hook (`useEtapaCarga(activo)` → `'oculto' | 'esqueleto' | 'lento'`) con dos timers que se limpian al desmontar o cuando `activo` pasa a `false`.

## Lo que provee quien lo usa
- `forma`:
  - `"tarjetas"`: la anatomía de `.listado-card` (marca de 48px, título, sub y pie). Para Viajes, Mis viajes, Flota, Usuarios, el listado de Documentación y la ficha de Documentación.
  - `"filas"`: hora de 56px y dos líneas, separadas por un borde superior. Para los paneles del Dashboard (Viajes de hoy, Viajes por confirmar, Documentación, Tus próximos viajes) y el historial de un documento.
- `cantidad`: cuántas tarjetas o filas dibujar. 3 por defecto; 2 en el historial.
- `aislado`: dibuja su propio colectivo en lugar del esqueleto, en vez de avisarle a la pantalla. Para el historial de un documento, que está en un modal.
- El componente se monta solo mientras `cargando` es `true`. El estado de error y el vacío no cambian.

## Marcado
- Contenedor `<div class="carga" role="status" aria-live="polite">` con un `<span class="sr-only">Cargando…</span>` que se lee en las etapas de esqueleto y colectivo. El esqueleto va con `aria-hidden="true"`.
- Esqueleto "tarjetas": `.esqueleto-tarjetas` con una `.esqueleto-tarjeta` por ítem: `.esqueleto.esqueleto-marca` y `.esqueleto-cuerpo` con tres `.esqueleto.esqueleto-linea` (`-titulo`, `-sub`, `-pie`).
- Esqueleto "filas": una `.esqueleto-fila` por ítem, con `.esqueleto.esqueleto-hora` y un cuerpo de dos líneas (`-titulo` y `-sub`).
- Colectivo (`CargaColectivo`, con `className` para sumar clases): `.carga-colectivo` con `.carga-colectivo-ruta`, adentro `.carga-colectivo-bus` (el ícono de colectivo de `IconoVehiculo` a 56px; en la variante chica, 40px, `aria-hidden`), y debajo `.carga-colectivo-texto` y `.carga-colectivo-hint`.

## Un solo colectivo por pantalla
Una pantalla puede tener varias cargas a la vez (el Dashboard tiene cuatro paneles). Para que no haya un colectivo por panel:
- `Layout` provee `CargaLentaContext` con un contador de cargas lentas (`cargasLentas`) y dos funciones, `sumar` y `restar`. Al principio de `.layout-content`, antes del contenido, hay un contenedor siempre montado con `role="status" aria-live="polite"`. Mientras el contador es mayor que 0, adentro se ve `CargaColectivo` con la clase `carga-colectivo-pagina` (`padding: space-4 space-4 0`, `margin-bottom: space-6`).
- Cada `Cargando` que llega a la etapa lenta sigue mostrando su esqueleto y suma 1 al contador. Resta 1 al salir de esa etapa o al desmontarse, por ejemplo cuando llegan los datos de su panel. El contador nunca baja de 0, y el colectivo se va cuando llegan los datos de todas las cargas.
- `aislado`, o un `Cargando` fuera de `Layout` (sin contexto), se comporta solo: en la etapa lenta reemplaza su esqueleto por su propio colectivo. Se usa en el historial de un documento, porque el colectivo de la página quedaría tapado por el modal.

## Login
Al ingresar, el botón pasa a "Ingresando…" como siempre. Si la respuesta tarda más de 3s, debajo del formulario aparece la variante chica (`.carga-colectivo.carga-colectivo-chica`) con "Conectando con el servidor…" y el mismo hint. Es justo el caso del servidor dormido: el login suele ser el primer pedido del día.

## Reglas
- El esqueleto usa `color-border` sobre `color-surface` y pulsa (opacidad 1 → 0.5, 1.4s). El colectivo va en `brand-600` y la ruta punteada en `state-neutral-border`. Las líneas corren hacia la izquierda y el colectivo rebota 2px: parece que avanza sin moverse de lugar.
- Con `prefers-reduced-motion: reduce` no hay animaciones: esqueleto y colectivo quedan quietos.
- No usar el logo para cargas: es el wordmark en PNG y no se redibuja ni se anima.
- Fuera de estos casos no cambia nada: los botones siguen con su `Spinner` y su gerundio ("Guardando…"), y las acciones dentro de un modal también.
