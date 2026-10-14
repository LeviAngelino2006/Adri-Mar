Visor del PDF de un documento (Documentación, botón "Ver PDF" y versiones del historial). Es el cuerpo de `ModalVisorPdf`, que le pone el marco: encabezado, pie y fondo. Vive en la app (`VisorPdf.jsx`, `ModalVisorPdf.jsx`) y se apoya en `react-pdf`.

## Cuándo usarlo
- Para mostrar un PDF que ya está en el storage, a partir de su URL firmada (`GET /documentos/:id/archivo`, dura 5 minutos).
- Solo para leer: no se rota, imprime, anota ni busca. Para guardarlo o llevárselo, el pie ofrece "Descargar PDF" y "Abrir en otra pestaña".

## Anatomía
`ModalVisorPdf` (marco de `ModalMarco`, variante `visor`) tiene tres partes y `VisorPdf` ocupa el cuerpo.

1. **Encabezado.** El nombre del documento, el titular (vehículo o chofer) como subtítulo y el botón de cerrar.
2. **Visor** (`.visor-pdf`): borde `color-border`, `radius-sm` y fondo `color-bg`, con dos filas.
   - **Barra** (`.visor-pdf-barra`): `color-surface`, borde inferior `color-border`, 44px de alto (más el borde) y padding `0 space-2`. Controles a izquierda y derecha.
   - **Área de páginas** (`.visor-pdf-area`): fondo `color-bg`, padding `space-4`, scroll vertical (y horizontal si el zoom ensancha las páginas) y `scrollbar-gutter: stable`.
3. **Pie.** Nombre del archivo, fecha de carga y quién lo subió (14px, `color-text-secondary`), "Abrir en otra pestaña" (`btn-secondary`, un `<a>`) y "Descargar PDF" (`Button` primary).

### Páginas
- Todas las páginas, una debajo de otra, con gap `space-4`. Cada una es una hoja blanca (`color-surface`) con `shadow-sm` y `radius-sm`.
- Cada hoja lleva un canvas y una **capa de texto** transparente encima: se puede seleccionar y copiar. La selección usa `brand-600` al 25%. No hay capa de anotaciones (los links dentro del PDF no se abren).
- Solo se dibujan las páginas a una pantalla o menos del área visible; las demás son una hoja vacía con el alto reservado (se calcula con la relación de la primera página), para que el scroll no salte y no se gaste memoria en PDF largos.
- Cada página mide al ancho del área menos el padding, multiplicado por el zoom, y se recalcula al redimensionar (con una espera de 120ms para no volver a dibujar en cada píxel).

## Controles
Todos son `Button` ghost de al menos 44 × 44px, con ícono SVG de 20px y `aria-label` (también `title`, para el mouse). Sin texto visible: el estado va en los números.

| Lado | Control | Qué hace |
| --- | --- | --- |
| Izquierda | Página anterior / Página siguiente | Lleva el scroll al inicio de la página. Deshabilitados en la primera y la última. |
| Izquierda | "1 de 3" | Página actual y total, en números tabulares (600, 15px, `color-text`). Se actualiza con el scroll. |
| Derecha | Alejar / Acercar | Baja o sube el zoom de a 25%, entre 50% y 200%. Deshabilitados en los extremos. |
| Derecha | "100%" | Zoom actual, en números tabulares, entre Alejar y Acercar. |
| Derecha | Ajustar al ancho | Vuelve al 100%. Deshabilitado si ya está ajustado. |

- **El 100% es "Ajustar al ancho"**: el zoom es un porcentaje del ancho del área, no del tamaño del PDF. Por defecto el visor abre así.
- **Página actual.** Un `IntersectionObserver` mide cuántos píxeles de cada página se ven y marca la que más se ve (si empatan, la primera). Así la última página también cuenta cuando es corta.
- **Al cambiar el zoom o el ancho** se conserva el punto del documento que estaba en el centro del área.
- Hover solo con mouse (`@media (hover: hover)`) y su `:active`: lo resuelve `Button`. Foco: outline 2px `brand-600`; en la barra y en el área va hacia adentro (`outline-offset: -2px`) porque el visor recorta lo que sobresale.

## Teclado y accesibilidad
- **Escape** cierra el modal (lo resuelve `ModalMarco`).
- **Flecha izquierda / derecha** cambian de página cuando el foco está en el visor (en la barra o en el área de páginas). Con Alt, Ctrl, Cmd o Shift no hacen nada, para no pisar los atajos del navegador.
- Tab recorre: cerrar, los controles de la barra, el área de páginas (foco visible), "Abrir en otra pestaña" y "Descargar PDF". Si un botón queda deshabilitado al tocarlo (la última página, el zoom máximo), el foco pasa al área para que sigan andando las flechas.
- El área es un `region` con `aria-label` ("Páginas de poliza-seguro-2026.pdf") y es enfocable, así que se puede scrollear con las flechas arriba/abajo y Re Pág / Av Pág. El visor no toma el foco al abrir.
- El porcentaje de zoom es `aria-live="polite"`.

## Estados
- **Cargando**: un `Spinner` lg centrado en `brand-600`, primero mientras baja el visor y después mientras se lee el documento. El encabezado y el pie ya están, así que se puede cerrar, descargar o abrir en otra pestaña.
- **Error**: si no se puede leer el PDF (la URL venció, no hay conexión, el archivo está dañado o tiene contraseña) o si no baja el código del visor, se muestra un `Alert` error con "No se pudo mostrar el PDF." en lugar del visor. El pie sigue con "Abrir en otra pestaña" y "Descargar PDF". Una página que falla sola muestra "No se pudo mostrar esta página." dentro de su hoja.

## Celular (menos de 640px)
- El modal ocupa toda la pantalla, sin márgenes, sin radio y sin sombra. El visor va de borde a borde (sin borde lateral ni radio).
- La barra tiene solo la navegación de páginas ("1 de 3") y "Ajustar al ancho". No hay Alejar, Acercar ni porcentaje: el zoom se hace pellizcando la página, con el gesto del navegador. El área no bloquea el gesto (no usa `touch-action` ni deshabilita el zoom de la página).
- Las páginas se ajustan al ancho de la pantalla (menos `space-4` de cada lado).
- Los dos botones del pie ocupan la mitad del ancho cada uno, debajo del texto del archivo; "Abrir en otra pestaña" puede ocupar dos líneas.

## Por qué no un `iframe`
El visor anterior era un `<iframe>` con la URL del PDF, es decir, el visor nativo del navegador:
- **No respeta el design system.** Cada navegador dibuja su propia barra (colores, íconos, tipografía y controles que no elegimos, con rotar, imprimir y buscar que acá no se usan).
- **No anda en el celular.** Chrome en Android no muestra PDFs dentro de un `iframe` (ofrece descargarlo) y Safari en iOS muestra solo la primera página, sin forma de pasar a las demás.
- **No se puede controlar ni probar.** No hay forma de saber en qué página está el usuario, de manejar el teclado ni de detectar que falló (un `iframe` con un error muestra la página de error del navegador).

Con `react-pdf` (pdf.js) las páginas se dibujan en canvas, igual en todos los navegadores y en el celular, con nuestros tokens, y el error se detecta para mostrar el `Alert`.

## Detalles de implementación
- **Carga diferida.** `ModalVisorPdf` es liviano; el visor y `react-pdf` entran con `React.lazy` recién cuando se abre el modal, y no forman parte del bundle principal. El chunk (con su CSS) pesa unos 640 kB (192 kB comprimido), más el worker de pdf.js, que se baja aparte y sale del mismo build, sin CDN.
- **Worker.** `pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. Se toma la versión de `pdfjs-dist` que trae `react-pdf`; si se actualiza `react-pdf`, el worker se actualiza con él.
- **Sin Suspense interno.** `Document` y `Page` van con `suspense={false}`. Con el valor por defecto de `react-pdf` 11, cada página que se monta suspende el `Suspense` de `ModalVisorPdf`: se oculta todo el visor y se pierden el foco y el scroll.
- **CORS.** `pdf.js` baja el archivo con `fetch`, no como un `iframe`: el storage tiene que permitir el origen de la app (`Access-Control-Allow-Origin`). Si no lo permite, el visor muestra el `Alert` de error y el pie sigue funcionando.
- **Resolución.** Los canvas se dibujan hasta a 2× de densidad de píxeles, para acotar la memoria en pantallas de alta densidad.
- **Sin colores propios.** Todo sale de tokens. La única hoja de `react-pdf` que se importa es la de la capa de texto (`react-pdf/dist/Page/TextLayer.css`); su color de selección se pisa con `brand-600`.
