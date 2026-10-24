Patrón único para las pantallas de listado: Viajes, Flota de vehículos, Usuarios y Documentación. Antes cada una tenía su propia estética (tarjetas anchas, tarjetas con franja azul y una tabla). Ahora comparten barra de herramientas y la misma tarjeta, apiladas a todo el ancho, sin título visible. Patrón de página (`Viajes.jsx`, `MisViajes.jsx`, `FlotaVehiculos.jsx`, `Usuarios.jsx`, `Documentacion.jsx`).

## Estructura de la pantalla
1. Sin título visible: `ListadoHeader` renderiza solo `<h1 class="sr-only">`, para que cada página siga teniendo un `h1` para los lectores de pantalla. El texto es el mismo que el del ítem de navegación: "Viajes", "Mis viajes", "Flota de vehículos", "Usuarios" y "Documentación". La sección actual ya la marcan la sidebar y, en mobile, la topbar (ver `Navegacion`). La barra queda primera en el contenido, con el padding normal de `.layout-content` arriba. Las fichas y los formularios sí tienen `h1` visible.
2. `.listado-toolbar`, en una línea: a la izquierda el buscador `.listado-buscar` (input con ícono de lupa, `flex: 1 1 160px`, `min-width: 0`, hasta 400px, para que entre junto a Filtros en mobile) y a su lado el botón "Filtros" (`.filtros-toggle-btn`, con el contador de filtros activos). Cada pantalla pone solo lo que usa: Viajes, buscador (cliente o lugar), Filtros (estado, chofer, vehículo, desde, hasta y, para Administrador y Encargado, cobro) y, a la derecha, el `ControlSegmentado` Próximos | Anteriores (ver "Viajes" abajo); Mis viajes, Filtros (estado, desde, hasta) y, a la derecha de todo, el `ControlSegmentado` Próximos | Anteriores (ver "Mis viajes" abajo); Flota, buscador (dominio, interno o marca) y Filtros (estado); Usuarios, solo buscador; Documentación, buscador (dominio, interno o marca / nombre o DNI), Filtros (estado de la documentación) y, a la derecha de todo, el `ControlSegmentado` Vehículos | Choferes (prop `vistas` de `ListadoToolbar`; cuando la barra mide menos de 600px pasa arriba, a todo el ancho, y debajo de 400px oculta las cantidades. Es una container query sobre `.listado-toolbar`, no una media query: depende del ancho de la barra, no del de la pantalla). La posición y el estilo son siempre los mismos.
   - **Excepción — Mantenimiento** (prop `vistasAlInicio` de `ListadoToolbar`): ahí el `ControlSegmentado` (Service | Arreglos | Historial) es la navegación principal, así que va **primero, a la izquierda**, y el buscador y Filtros quedan a la derecha. Es igual en las tres vistas, aunque Arreglos no tenga buscador. Sin acción en la barra: el service se registra tocando la tarjeta del vehículo, y el arreglo, con el formulario de su vista. Ese formulario es la otra excepción de la vista: ocupa **todo el ancho** del contenido (no los 720px de `.form-card`, clase `arreglos-form-card`), para que su borde izquierdo quede alineado con las pestañas y el derecho con las listas de Service e Historial; vive dentro de una pestaña junto a listas, no en una página propia. Sigue en dos columnas desde 640px, con Descripción, Repuestos y Observaciones a ancho completo.
   - Acción principal: último elemento de la barra, a la derecha de todo (prop `accion: { etiqueta, onClick }` de `ListadoToolbar`). Solo para los perfiles que pueden crear. Etiquetas: "Crear viaje", "Crear vehículo" y "Crear usuario". Mis viajes y Documentación no tienen acción (en Documentación ese lugar es del `ControlSegmentado`). Marcado:
     ```html
     <button class="btn btn-primary listado-accion" aria-label="Crear vehículo">
       <span><span class="listado-accion-signo" aria-hidden="true">+</span><span class="listado-accion-texto">Crear vehículo</span></span>
     </button>
     ```
   - Debajo de 640px la acción es compacta: solo el "+" (20px), cuadrada de 44 × 44. El texto queda oculto a la vista (mismas reglas que `.sr-only`) y los lectores de pantalla lo siguen leyendo, así buscador, Filtros y acción entran en una línea a 375px. Cuando la barra mide menos de 400px (celular de 360px), el buscador baja su base a 100px para que también entren con el contador de Filtros. Desde 640px el "+" toma el tamaño del texto, con `0.25em` de separación.
3. `.listado-filtros`: el panel que abre el botón Filtros (ver `Filtros`). Cerrado por defecto, también en Flota.
4. `.listado-cards`: una sola columna de tarjetas apiladas, cada una a todo el ancho de la fila, con gap `space-4`. Es igual en todos los tamaños; no hay tablas ni grilla. En Viajes y Mis viajes, las tarjetas van agrupadas por día (ver abajo).
5. Estado vacío: `.listado-vacio`, centrado y en `color-text-secondary` ("No hay viajes con esos filtros."). Cargando, error y vacío se arman con `EstadoCarga`: si el listado no se pudo cargar se muestra el error con "Reintentar", nunca el vacío.

## Agrupado por día (Viajes y Mis viajes)
- Las tarjetas se agrupan por día de inicio (día de Córdoba). Cada grupo es `<section class="listado-grupo"><h2 class="listado-dia">…</h2><div class="listado-cards">…</div></section>`.
- Los grupos siguen el orden del listado y dentro de cada día se mantiene el mismo orden. En Viajes y en Mis viajes, el orden depende de la vista (ver abajo).
- Título del grupo: "Hoy · vie 9 oct", "Mañana · sáb 10 oct", "Ayer · jue 8 oct"; cualquier otro día, "mié 7 oct". El año va solo si no es el año en curso ("lun 29 dic 2025"). Se escribe en minúscula y el CSS lo pasa a mayúsculas.
- `.listado-dia`: 13px, 600, mayúsculas, letter-spacing 0.04em, `color-text-secondary`, margen inferior `space-3`. Entre grupos, `space-6`.
- La lógica es una función pura, `agruparViajesPorDia` (`utils/viajesPorDia.js`).

## Viajes: Próximos | Anteriores
- La barra lleva el mismo `ControlSegmentado` "Próximos | Anteriores" que Mis viajes, con la vista en la URL: Próximos es la vista por defecto, sin parámetro; Anteriores es `?tab=anteriores`.
- El corte y el orden los hace el backend (`GET /viajes?vista=proximos` o `vista=anteriores`). "Hoy" es el día de Córdoba.
- **Próximos:** los viajes A confirmar, Programado y En viaje, en este orden:
  1. "Sin cerrar": los de días anteriores que siguen abiertos (A confirmar, Programado o En viaje), del más viejo al más nuevo. El backend los marca con `sinCerrar`; el front no recalcula la regla. Mismo estilo `.listado-dia`, sin color ni badge extra: el día lo da el bloque de fecha de cada tarjeta.
  2. "En curso": los En viaje que no son sin cerrar. Un En viaje que empezó ayer va solo en "Sin cerrar".
  3. El resto, agrupado por día, del más próximo al más lejano. Los A confirmar sin fecha van al final, en "Sin fecha".
- **Anteriores:** Finalizados y Cancelados agrupados por día, el más reciente primero.
- Los filtros se aplican dentro de la vista. El filtro de estado ofrece solo los estados de la vista (Próximos: A confirmar, Programado y En viaje; Anteriores: Finalizado y Cancelado) y, al cambiar de vista, un estado que no es de la nueva se limpia.
- Vacío sin filtros: "No hay viajes próximos." o "No hay viajes anteriores.". Con algún filtro o una búsqueda: "No hay viajes con esos filtros." y, debajo, el botón "Limpiar filtros" (ver `Filtros`). Si no se pudo cargar, el error con "Reintentar" (`EstadoCarga`).
- Filtro "Cobro" (solo Administrador y Encargado): "Todos" o "Sin precio o cobro pendiente" (parámetro `administrativoPendiente=true`).
- Desde el Dashboard, un viaje Finalizado se abre con `?tab=anteriores`, para que la ficha lo encuentre.
- Buscador "Buscar por cliente o lugar", siempre visible en la barra (no en el panel de filtros): busca en el backend (`q`) por cliente, origen, destino y paradas, dentro de la vista y junto con los filtros. No distingue mayúsculas ni tildes ("cordoba" encuentra "Córdoba"), salvo en las direcciones particulares de Google, donde sí distingue tildes. Se pide 300 ms después de dejar de escribir; hasta 100 caracteres.
- La lógica es una función pura, `separarProximos` (`utils/vistasViajes.js`), y los grupos "Sin cerrar" y "En curso" los arma `ListadoViajesPorDia` con las props `sinCerrar` y `enCurso`.

## Mis viajes: Próximos | Anteriores
- La barra lleva un `ControlSegmentado` "Próximos | Anteriores" (sin íconos ni cantidades), igual que Vehículos | Choferes en Documentación. La vista va en la URL: Próximos es la vista por defecto, sin parámetro; Anteriores es `?tab=anteriores`.
- **Próximos:** arriba de todo, el viaje En viaje en su propio grupo, titulado "En curso" (mismo estilo `.listado-dia`), aunque haya empezado ayer u hoy. Después, los Programados agrupados por día, en orden ascendente: el más próximo primero, igual que "Tus viajes pendientes" del Dashboard. Un Programado atrasado queda primero, bajo "Ayer · dom 18 oct" o su día, sin color ni badge extra.
- **Anteriores:** Finalizados y Cancelados agrupados por día, el más reciente primero.
- El chofer no ve viajes A confirmar (los filtra el backend), así que no están en ninguna vista.
- El filtro de estado ofrece solo los estados de la vista (Próximos: Programado y En viaje; Anteriores: Finalizado y Cancelado). Al cambiar de vista, un estado que no es de la nueva vista se limpia.
- Vacío sin filtros: "No tenés viajes próximos." o "No tenés viajes anteriores.". Con algún filtro activo: "No hay viajes con esos filtros.".
- La lógica es una función pura, `viajesDeLaVista` (`utils/misViajes.js`), y el grupo "En curso" lo arma `ListadoViajesPorDia` con la prop `enCurso`. La vista en la URL y el filtro de estado por vista son los mismos de Viajes (`utils/vistasViajes.js`).

## La tarjeta (`<button class="listado-card">`)
Todas siguen la misma anatomía:
- `.listado-card-marca`: cuadrado de 40px (`radius-md`, `brand-50` / `brand-600`) con un ícono de 20px, el `Avatar` de 40px en Usuarios, o el bloque de fecha (`.fecha-tile`, 48px) en los viajes. `ListadoCard` acepta `marcaClassName` para sumarle una clase a la marca.
- `.listado-card-cuerpo`, con:
  - `.listado-card-top`: título `.listado-card-titulo` (600) y a la derecha el `EstadoBadge` sm. En la tarjeta de viaje angosta el badge pasa arriba del título (ver `TarjetaViaje`). `ListadoCard` acepta `className` para sumarle una clase a la tarjeta.
  - `.listado-card-bajada`: opcional, debajo del título, en `color-text-secondary` (14px), sin badge ni color (prop `bajada` de `ListadoCard`).
  - `.listado-card-sub`: el dato principal en `color-text` (15px).
  - `.listado-card-detalle`: datos secundarios en `color-text-secondary` (14px), opcional.
  - `.listado-card-pie`: línea final con borde superior `color-border`, 14px, `color-text-secondary` y números tabulares.

Contenido de cada pantalla:
- **Viaje**: bloque de fecha con el día de inicio; título la ruta (`RutaViaje`); badge de estado; en el listado de Viajes, la bajada con el nombre del cliente (prop `mostrarCliente` de `TarjetaViaje`; sin cliente cargado, no hay línea); sub el horario y el chofer ("07:30 – 10:00 · Martín Gómez"; "Chofer pendiente" si falta); detalle solo en el listado de Viajes y para Administrador y Encargado, "Sin precio" o "Cobro pendiente" en texto gris, sin badge (el color queda para el estado; prop `mostrarPendientes`); pie el vehículo ("12 - AE452KD · Mercedes-Benz O500") a la izquierda y "110 km estimados" a la derecha. Ver `TarjetaViaje`.
  - **Mis viajes** (el chofer ve sus propios viajes): el sub es solo el horario y no lleva el cliente; el resto igual. Los gestores ven siempre el chofer.
- **Vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (solo el dominio con `.patente`); badge Operativo / En taller / Dado de baja; sub marca y modelo; pie "Colectivo" a la izquierda y "57.345 km" a la derecha.
- **Documentación de un vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (dominio con `.patente`); badge del estado de la documentación (Vencida error, Por vencer warning, Incompleta neutral, Al día success); sub marca y modelo; detalle la línea del problema más urgente; pie "7 de 8 documentos cargados" a la izquierda y el tipo de vehículo a la derecha. Orden por número de interno.
- **Documentación de un chofer**: `Avatar` de 40px con el color del perfil; título nombre y apellido; mismo badge, detalle y pie "N de M documentos cargados" (sin DNI); sub el perfil ("Chofer"; "Encargado · habilitado para conducir"). Orden por apellido.
  - Línea de detalle: Vencida "ITV venció el 02 oct"; Por vencer "Comprobante de pago de seguro vence el 13 oct"; Incompleta "Falta: X" o "Faltan 3: A, B y C"; Al día "Próximo vencimiento: Póliza de seguro, 22 dic" (sin línea si ningún documento vence). El año se escribe solo cuando no es el año en curso.
  - Estado vacío: "No hay vehículos con ese estado." / "No hay choferes con ese estado.".
  - En la barra, a la derecha de Filtros, va un `ControlSegmentado` (Vehículos | Choferes) con ícono y la cantidad total de cada vista (sin búsqueda ni filtro); las dos listas se cargan en paralelo al entrar. La vista y la ficha abierta se guardan en la URL (`?tab=choferes`, `?vehiculoId=`, `?choferId=`).
- **Usuario**: `Avatar` de 40px; título el nombre; badge Activo (success) o Inactivo (neutral); sub el perfil; pie "@usuario".

## Reglas
- Superficie `color-surface`, borde `color-border`, `radius-md`, `shadow-sm`, padding `space-4`. En hover (solo con mouse) y al tocar (`:active`), borde `brand-500` y `shadow-md`. Foco: outline 2px `brand-600`, offset 2px. Click o Enter abre la ficha.
- Orden por defecto: Viajes, según la vista (Próximos del más próximo al más lejano, con "Sin cerrar" y "En curso" arriba; Anteriores, el más reciente primero); Flota, por número de interno de menor a mayor; Usuarios, por nombre.
- La tabla (`TablaListado`) ya no se usa en ninguna pantalla.
