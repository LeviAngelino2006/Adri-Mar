Sistema visual de Adri-Mar Gestión, la app interna de Adri Mar Viajes (transporte de pasajeros, Río Tercero, Córdoba) para gestionar viajes, flota y usuarios. Interfaz clara, densa y de un solo tema: superficies blancas sobre gris muy claro, el azul del logotipo como único azul y colores de estado para viajes y vehículos.

## Contenido y voz

- Escribí en español rioplatense con voseo: "completalo cuando tengas los datos", "Intentá de nuevo".
- Botones en infinitivo y concretos: "Guardar cambios", "Confirmar viaje", "Comenzar viaje", "Dar de baja".
- Mientras una acción corre, el botón pasa a gerundio con elipsis: "Confirmando…", "Ingresando…", "Finalizando…".
- Errores con "No se pudo…" + la acción: "No se pudo guardar el viaje". Éxitos en pasado: "Cambios guardados correctamente."
- Mayúscula solo al inicio (sentence case), sin signos de exclamación ni emoji.
- Las fechas se escriben "12 mar 2026" (en hora de Córdoba) en toda la app, nunca "dd/mm/aaaa". La única excepción son los `<input type="date">`, que muestra el navegador.
- Los nombres de estado se escriben siempre igual: A confirmar, Programado, En viaje, Finalizado, Cancelado; Operativo, En taller, Dado de baja.

## Color

- Fondo de página `color-bg`; cards, topbar, sidebar, modales e inputs en `color-surface`.
- Texto principal `color-text`; texto secundario, hints y navegación inactiva `color-text-secondary`. Ambos se leen sobre `color-surface` y `color-bg`.
- Bordes y separadores en `color-border`.
- Hay un solo azul: la escala `brand-*`, construida sobre el azul del logotipo (`brand-600`, #0535a6). `brand-600` es el botón primario (texto `color-on-brand`), los links, el switch encendido, la barra de progreso y el anillo de foco. `brand-700` es el hover y el ítem de navegación activo (sobre `brand-100`). `brand-50` es el hover suave y el encabezado de tablas. `brand-200` es el borde de badges y alerts de marca.
- No agregues otros azules. Info (`state-info-*`) y el estado Programado son alias de la escala de marca. `theme-color` es alias de `brand-600`.
- Cada estado tiene un trío `state-<tipo>-text` / `-bg` / `-border` (success, warning, neutral, error) y un `state-<tipo>-solid` para puntos y barras. El texto `state-*-text` va sobre su `state-*-bg` (todos ≥5.3:1); los `-solid` superan 3:1 sobre blanco.
- Estados de viaje: A confirmar neutral, Programado brand, En viaje warning, Finalizado success, Cancelado error. Estados de vehículo: Operativo success, En taller warning, Dado de baja neutral. Los tokens `viaje-*` y `vehiculo-*` son alias de esos colores.
- Estados de documento (cada tarjeta de la ficha de Documentación): Vigente success, Por vencer warning, Vencido error, Pendiente neutral. Estados de la documentación de un vehículo o chofer (listado y encabezado de su ficha): Al día success, Por vencer warning, Vencida error, Incompleta neutral. El estado de la documentación sale de la prioridad Vencida > Por vencer > Incompleta > Al día.
- Mostrá el estado con `EstadoBadge` (píldora) en tarjetas y fichas, y con `EstadoDot` (punto) en tablas. Siempre con su etiqueta: el color solo no comunica.
- Las acciones destructivas usan `state-error-text` de fondo con `color-on-brand`; hover `state-error-strong`.
- Los viajes no tienen estados "Vencido" ni "Excedido" (los documentos sí: ver arriba): un viaje atrasado sigue Programado (o En viaje) hasta que el chofer lo comienza o finaliza, o un gestor lo cancela. No marques el atraso con ningún color ni badge.
- Usá siempre tokens: no hay colores escritos a mano en `bundle.css`. Texto sobre fondos oscuros: `color-on-brand` o `color-inverse-text`. Backdrops: `overlay`.
- No hay tema oscuro: la app declara `color-scheme: light`.

## Tipografía

- Una sola familia: la pila del sistema `--font-sans` (system-ui, Segoe UI, Roboto). No cargues fuentes web.
- Base 16px con interlineado 1.5 (`body`). Títulos con interlineado 1.25: `h1` 28px en 700 por página; `h2` 22px y `h3` 18px en 600.
- Labels en `label` (500); botones en `button` (600, interlineado 1).
- Texto de apoyo: `body-sm` (15px) en alerts, toasts y modales; `caption` (14px) en hints y errores de campo; `meta` (13px) en contadores; `xs` (12px) solo para etiquetas chicas.
- Números que se comparan (km, odómetro, horas, internos) van con números tabulares: clase `.num`. Tablas, fichas y pies de tarjeta ya los aplican.
- Patentes y dominios van con `.patente` (familia `--font-mono`, 600, mayúsculas, letter-spacing 0.06em), en tablas, tarjetas y fichas.

## Espaciado, radios y sombras

- Escala de 4px: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 20, `space-6` 24, `space-8` 32, `space-12` 48. No hay 40.
- Separación entre campos y párrafos: `space-4`. Padding de cards y modales: `space-6`.
- `radius-sm` (6px) para controles, alerts y navegación; `radius-md` (10px) para cards y tablas; `radius-lg` (14px) para modales; `radius-full` para píldoras, switch, avatares y puntos.
- `shadow-sm` en cards y topbar; `shadow-md` en popovers, hover de tarjetas y la card del login; `shadow-lg` en modales y toasts.

## Interacción y accesibilidad

- Todo control interactivo mide al menos 44px de alto (botones, inputs, ítems de navegación), también el link "← Volver al listado" (`.back-link`).
- Foco visible: outline 2px `brand-600` con offset 2px. No lo quites.
- Deshabilitado: opacidad 0.6 y cursor not-allowed.
- El hover solo aplica con mouse: todo estilo `:hover` va dentro de `@media (hover: hover)`. En pantallas táctiles el hover queda pegado en lo que estaba bajo el dedo al cambiar de pantalla (un botón o tarjeta aparece resaltado sin que nadie lo toque). Para que el toque tenga respuesta, cada regla de hover tiene un `:active` con el mismo estilo, fuera de la media query. `:focus-visible` y `:disabled` no cambian.
- Al abrir una ficha o un formulario que reemplaza al listado dentro de la misma ruta (Viajes, Mis viajes, Flota de vehículos, Usuarios y Documentación) y al volver al listado, la página vuelve arriba (`window.scrollTo(0, 0)`). Al cambiar de ruta también (`ScrollAlTope`). El router no reinicia el scroll solo.
- Transiciones cortas (0.15–0.2s) y desactivadas con `prefers-reduced-motion`.
- Los campos de formulario van dentro de `FormField`, que conecta label, hint y error con `aria-*`.
- Lo obligatorio se marca con un asterisco rojo (`required` en `FormField`). Nunca escribas "Opcional" en un hint: lo que no lleva asterisco es opcional.

## Layout

- Topbar sticky en `color-surface` con borde inferior y `shadow-sm`; logo de 32px de alto.
- Sidebar de 232px con el logo (36px) arriba y la navegación con íconos de 20px.
- Formularios: `.form-grid` pasa a dos columnas desde 640px (una columna debajo, en el mismo orden); `.form-card` limita a 720px. Los campos que van juntos se agrupan en pares (origen–destino, inicio–fin, chofer–vehículo) y el resto va a ancho completo (`.form-field-ancho`). Las secciones opcionales y largas van colapsadas (`.form-seccion`).

## Logos e íconos

- Usá `assets/Logos/logo-adrimar.png` (el wordmark "Adri Mar Viajes") sobre `color-surface`, nunca sobre `brand-600`. No lo redibujes ni lo recolorees.
- Íconos de navegación de 20px, de un solo color: en la app toman `currentColor` (`color-text-secondary`, o `brand-700` cuando están activos). Ver `assets/Icons/README.md`.

## Componentes

`components/bundle.js` expone `window.AdriMar` con Button, Card, Alert, FormField, Switch, Spinner, Toast, ConfirmModal, EstadoDot, EstadoBadge y RutaViaje (React). `components/bundle.css` trae sus estilos, las reglas base y las clases de páginas y layout. Leé el README de cada componente antes de usarlo. `ControlSegmentado` (alternar vistas hermanas dentro de una pantalla) y `TarjetaDocumento` (un documento en la ficha de Documentación) viven en la app (`frontend/src/components`) y todavía no están en el bundle.

## Patrones de página

Las pantallas se arman con las clases de `bundle.css` y los componentes de arriba, no con componentes propios. Cada patrón tiene su README con la estructura y las clases exactas:

- Viajes: `TarjetaViaje` (listado, agrupado por día y con el bloque de fecha), `FormularioViaje` (programar y editar), `ViajeEnCurso` y `ProximosViajes` (Dashboard del chofer) y `ModalOdometro` (comenzar y finalizar).
- Dashboard: `Dashboard` (encabezado, orden de secciones, paneles y filas `.dashboard-fila`), con `ViajesDeHoy` a todo el ancho y, debajo, `PanelViajesPorConfirmar` y Documentación en dos columnas desde 1024px.
- Listados: `Listado` (patrón único de Viajes, Flota, Usuarios y Documentación), con las tarjetas `TarjetaViaje` y `TarjetaVehiculo`, `FichaDetalle` (ficha de un viaje, vehículo o usuario: una sola card plana con los datos en pares, en dos columnas desde 640px), `Filtros`.
- Flota y Usuarios: `FormularioVehiculo` y `FormularioUsuario` (alta y edición, en pares, con asteriscos y hints).
- Documentación: `Listado` con `ControlSegmentado` (Vehículos | Choferes, con ícono y cantidad) en la misma barra que el buscador y Filtros, a la derecha, y, en la ficha, una `TarjetaDocumento` por documento.
- Usuarios: `Avatar`, con el color según el perfil.
- Layout: `Navegacion` (sidebar y topbar), `Login` (panel de marca + card).

- Las pantallas de listado (Viajes, Flota de vehículos, Usuarios y Documentación) siguen el mismo patrón, `Listado`: encabezado (con acción principal, salvo Documentación, que no tiene), barra de búsqueda y filtros, y tarjetas con la misma anatomía, apiladas una debajo de otra a todo el ancho. No hay tablas ni grilla.
- Las fichas de detalle (viaje, vehículo y usuario) son una sola `Card` plana con una grilla de pares `dt`/`dd` en dos columnas desde 640px (nunca tres), sin títulos de sección y en el mismo orden que su formulario. Los datos vacíos dicen "No registrado".
- Encabezado de página: `h1` a la izquierda y la acción principal (`Button` primary, "Nuevo vehículo") a la derecha, con margen inferior `space-6`.
- Los estados vacíos van centrados, en `color-text-secondary`.
- Los listados de viajes se agrupan por día de inicio (día de Córdoba), con un título por día ("Hoy · vie 9 oct") y el bloque de fecha (`.fecha-tile`) como marca de cada tarjeta.
- Los resúmenes numéricos ("5 viajes · 1 en viaje", "2 vencidos · 3 por vencer") van en texto gris (`color-text-secondary`), sin badges: fuera de los `EstadoBadge`, pocos colores.

## Estado respecto del código

El código (rama `feat/ux-viajes-v3`) implementa este sistema completo. Sin cambios respecto del código: SelectorBuscarOCrear no está en el bundle porque depende del cliente HTTP de la app (tiene guía y vista estática). No hay archivos de fuente: la app usa fuentes del sistema.
