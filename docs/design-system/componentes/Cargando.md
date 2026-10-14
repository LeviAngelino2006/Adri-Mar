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
  - `"tarjetas"`: una `ListadoCard` (marca, título con badge, sub y pie). Para Flota y Usuarios.
  - `"documentacion"`: como `"tarjetas"`, con la línea de detalle (`.listado-card-detalle`) entre el sub y el pie. Para el listado de Documentación, donde casi todas las tarjetas la tienen ("Falta: VTV", "Próximo vencimiento…").
  - `"documentos"`: una `TarjetaDocumento` (nombre con badge, fechas y dos botones). Para la ficha de Documentación, con `cantidad={4}` y `encabezado` (ver "La ficha de Documentación mientras carga").
  - `"viajes"`: como `"tarjetas"`, pero dentro de un grupo (`.listado-grupo`) con título de día, y la marca es el bloque de fecha (`fecha-tile`). Para Viajes y Mis viajes.
  - `"filas"`: las filas de los paneles del Dashboard (hora de salida y llegada, título, meta y badge). Para los paneles del Dashboard (Viajes de hoy, Viajes por confirmar, Documentación, Tus próximos viajes) y el historial de un documento.
- `cantidad`: cuántas tarjetas o filas dibujar. 3 por defecto; 4 en la ficha de Documentación y 2 en el historial.
- `encabezado` (solo con `"documentos"`): `"resumen"` suma, arriba de las tarjetas, el resumen y el título de la primera sección; `"completo"` también suma el título y el subtítulo de la ficha.
- `aislado`: dibuja su propio colectivo en lugar del esqueleto, en vez de avisarle a la pantalla. Para el historial de un documento, que está en un modal.
- El componente se monta solo mientras `cargando` es `true`. El estado de error y el vacío no cambian.

## Marcado
- Contenedor `<div class="carga" role="status" aria-live="polite">` con un `<span class="sr-only">Cargando…</span>` que se lee en las etapas de esqueleto y colectivo. El esqueleto va con `aria-hidden="true"`.
- **Regla: el esqueleto usa las mismas clases que el contenido real y pone barras (`.esqueleto-barra`) dentro de cada línea de texto.** Así el alto lo dan el padding y el line-height del componente real, y el esqueleto mide lo mismo que la tarjeta o la fila que reemplaza. Las barras no llevan alturas fijas: miden `0.75em` de la línea que las contiene. Solo se fija el ancho de cada barra.
- Esqueleto "tarjetas": `.listado-cards` con una `.listado-card.esqueleto-tarjeta` por ítem. Adentro van `.listado-card-marca` (vacía, en `color-border`) y `.listado-card-cuerpo` con:
  - `.listado-card-top`: el título con una barra al 55% y un `.esqueleto-barra.esqueleto-badge` del alto de un `EstadoBadge` chico;
  - `.listado-card-sub` con una barra al 35%;
  - `.listado-card-pie` con dos barras.
- **Las barras del pie van envueltas en un `<span>`** (`<span style="width: 40%"><Barra ancho="100%" /></span>`). Sueltas dentro del flex del pie pierden el alto de línea, y la tarjeta queda 10px más baja.
- Esqueleto "documentacion": el de "tarjetas" con `<div class="listado-card-detalle">` (una barra al 50%) entre `.listado-card-sub` y `.listado-card-pie`.
- Esqueleto "documentos": `.doc-tarjetas` con un `<article class="doc-tarjeta esqueleto-documento">` por ítem. Adentro:
  - `.doc-tarjeta-info`, con `.doc-tarjeta-titulo` (un `h3.doc-tarjeta-nombre` con una barra al 45% y un `.esqueleto-badge`) y `p.doc-tarjeta-fechas` (una barra al 35%);
  - `.doc-tarjeta-acciones`, con dos `.esqueleto-barra.esqueleto-boton` de 44px de alto, como los botones reales. Debajo de 480px se estiran, igual que los botones.
  - El nombre lleva `flex: 1`: es un item del flex, y sin eso su barra (en %) no tendría ancho de referencia.
  - Con `encabezado`, las tarjetas van dentro de `<section class="doc-seccion">`, con `<h2 class="detalle-seccion-titulo doc-seccion-titulo">` (una barra de 120px), y antes va `<p class="doc-ficha-resumen">` (una barra de 240px). Con `"completo"`, antes de todo eso van `.doc-ficha-header` con un `h1` (una barra de 200px) y `p.doc-ficha-subtitulo` (una barra de 260px).
- Esqueleto "viajes": `<section class="listado-grupo">` con `<h2 class="listado-dia">` (una barra de 110px) y las tarjetas de "tarjetas", con la clase extra `esqueleto-viaje` y la marca `.listado-card-marca.fecha-tile`.
- **Viajes en el celular (menos de 640px):** en la tarjeta real, la ruta ocupa dos líneas y el pie también se parte en dos (vehículo, y km debajo). El esqueleto lo imita así:
  - El título lleva una segunda barra `.esqueleto-solo-mobile` (40%), que solo se ve en el celular. Ahí, la primera barra pasa al 70%, así que la segunda baja a otra línea.
  - El primer dato del pie pasa al 100% de ancho, y el segundo baja a otra línea. El pie no lleva barras extra: con una más quedaría en tres líneas.
  - Los anchos se pisan con `!important` porque las barras los llevan en `style`.
  - Lo que queda (unos 5px) depende del largo de la ruta.
- Esqueleto "filas": `<ul class="dashboard-lista">` con un `<li>` por ítem. Cada uno tiene una `.dashboard-fila.esqueleto-fila` con:
  - `.hora-col`: barras de 40px y 32px;
  - `.dashboard-fila-info`: título al 60% y meta al 40%;
  - un `.esqueleto-badge`.
- Colectivo (`CargaColectivo`, con `className` para sumar clases): `.carga-colectivo` con `.carga-colectivo-ruta`, adentro `.carga-colectivo-bus` (el ícono de colectivo de `IconoVehiculo` a 56px; en la variante chica, 40px, `aria-hidden`), y debajo `.carga-colectivo-texto` y `.carga-colectivo-hint`.

## La ficha de Documentación mientras carga
Para que las tarjetas no se muevan cuando llega la ficha, lo que va arriba de ellas ocupa su lugar desde el principio:
- **Abierta desde el listado:** el ítem de la lista ya trae el titular (interno, dominio, marca, modelo, tipo y estado del vehículo; o nombre, perfil y si está habilitado para conducir) y el estado de la documentación. Mientras carga, la pantalla muestra el encabezado real (`.doc-ficha-header` con el `h1` y el `EstadoBadge`, y `.doc-ficha-subtitulo`) con ese ítem, desde el primer momento. Debajo va `<Cargando forma="documentos" cantidad={4} encabezado="resumen" />`. Cuando llega la ficha, su encabezado reemplaza al del ítem en el mismo lugar.
- **Abierta por URL** (`?vehiculoId=` o `?choferId=`, sin el ítem a mano): el encabezado también va en esqueleto: `<Cargando forma="documentos" cantidad={4} encabezado="completo" />`.
- Los esqueletos respetan las etapas de siempre: nada hasta los 300ms, el esqueleto hasta los 3s y después el colectivo arriba.

## Un solo colectivo por pantalla
Una pantalla puede tener varias cargas a la vez (el Dashboard tiene cuatro paneles). Para que no haya un colectivo por panel:
- `Layout` provee `CargaLentaContext` con un contador de cargas lentas (`cargasLentas`) y dos funciones, `sumar` y `restar`. Al principio de `.layout-content`, antes del contenido, hay un contenedor siempre montado con `role="status" aria-live="polite"`. Mientras el contador es mayor que 0, adentro se ve `CargaColectivo` con la clase `carga-colectivo-pagina` (`padding: space-4 space-4 0`, `margin-bottom: space-6`).
- Cada `Cargando` que llega a la etapa lenta sigue mostrando su esqueleto y suma 1 al contador. Resta 1 al salir de esa etapa o al desmontarse, por ejemplo cuando llegan los datos de su panel. El contador nunca baja de 0, y el colectivo se va cuando llegan los datos de todas las cargas.
- `aislado`, o un `Cargando` fuera de `Layout` (sin contexto), se comporta solo: en la etapa lenta reemplaza su esqueleto por su propio colectivo. Se usa en el historial de un documento, porque el colectivo de la página quedaría tapado por el modal.

## Login
Al ingresar, el botón pasa a "Ingresando…" como siempre. Si la respuesta tarda más de 3s, debajo del formulario aparece la variante chica (`.carga-colectivo.carga-colectivo-chica`) con "Conectando con el servidor…" y el mismo hint. Es justo el caso del servidor dormido: el login suele ser el primer pedido del día.

## Reglas
- Las barras y la marca del esqueleto van en `color-border` sobre `color-surface` y pulsan (opacidad 1 → 0.5, 1.4s). El colectivo va en `brand-600` y la ruta punteada en `state-neutral-border`. Las líneas corren hacia la izquierda y el colectivo rebota 2px: parece que avanza sin moverse de lugar.
- Con `prefers-reduced-motion: reduce` no hay animaciones: esqueleto y colectivo quedan quietos. El bloque de fecha de "viajes" (`.listado-card-marca.fecha-tile`) se nombra aparte, porque su regla de animación es más específica.
- No usar el logo para cargas: es el wordmark en PNG y no se redibuja ni se anima.
- Fuera de estos casos no cambia nada: los botones siguen con su `Spinner` y su gerundio ("Guardando…"), y las acciones dentro de un modal también.
