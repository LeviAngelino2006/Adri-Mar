Patrón único para las pantallas de listado: Viajes, Flota de vehículos, Usuarios y Documentación. Antes cada una tenía su propia estética (tarjetas anchas, tarjetas con franja azul y una tabla). Ahora comparten barra de herramientas y la misma tarjeta, apiladas a todo el ancho, sin título visible. Patrón de página (`Viajes.jsx`, `MisViajes.jsx`, `FlotaVehiculos.jsx`, `Usuarios.jsx`, `Documentacion.jsx`).

## Estructura de la pantalla
1. Sin título visible: `ListadoHeader` renderiza solo `<h1 class="sr-only">`, para que cada página siga teniendo un `h1` para los lectores de pantalla. El texto es el mismo que el del ítem de navegación: "Viajes", "Mis viajes", "Flota de vehículos", "Usuarios" y "Documentación". La sección actual ya la marcan la sidebar y, en mobile, la topbar (ver `Navegacion`). La barra queda primera en el contenido, con el padding normal de `.layout-content` arriba. Las fichas y los formularios sí tienen `h1` visible.
2. `.listado-toolbar`, en una línea: a la izquierda el buscador `.listado-buscar` (input con ícono de lupa, `flex: 1 1 160px`, `min-width: 0`, hasta 400px, para que entre junto a Filtros en mobile) y a su lado el botón "Filtros" (`.filtros-toggle-btn`, con el contador de filtros activos). Cada pantalla pone solo lo que usa: Viajes, solo Filtros (estado, desde, chofer); Flota, buscador (dominio, interno o marca) y Filtros (estado); Usuarios, solo buscador; Documentación, buscador (dominio, interno o marca / nombre o DNI), Filtros (estado de la documentación) y, a la derecha de todo, el `ControlSegmentado` Vehículos | Choferes (prop `vistas` de `ListadoToolbar`; cuando la barra mide menos de 600px pasa arriba, a todo el ancho, y debajo de 400px oculta las cantidades. Es una container query sobre `.listado-toolbar`, no una media query: depende del ancho de la barra, no del de la pantalla). La posición y el estilo son siempre los mismos.
   - Acción principal: último elemento de la barra, a la derecha de todo (prop `accion: { etiqueta, onClick }` de `ListadoToolbar`). Solo para los perfiles que pueden crear. Etiquetas: "Crear viaje", "Crear vehículo" y "Crear usuario". Mis viajes y Documentación no tienen acción (en Documentación ese lugar es del `ControlSegmentado`). Marcado:
     ```html
     <button class="btn btn-primary listado-accion" aria-label="Crear vehículo">
       <span><span class="listado-accion-signo" aria-hidden="true">+</span><span class="listado-accion-texto">Crear vehículo</span></span>
     </button>
     ```
   - Debajo de 640px la acción es compacta: solo el "+" (20px), cuadrada de 44 × 44. El texto queda oculto a la vista (mismas reglas que `.sr-only`) y los lectores de pantalla lo siguen leyendo, así buscador, Filtros y acción entran en una línea a 375px. Desde 640px el "+" toma el tamaño del texto, con `0.25em` de separación.
3. `.listado-filtros`: el panel que abre el botón Filtros (ver `Filtros`). Cerrado por defecto, también en Flota.
4. `.listado-cards`: una sola columna de tarjetas apiladas, cada una a todo el ancho de la fila, con gap `space-4`. Es igual en todos los tamaños; no hay tablas ni grilla. En Viajes y Mis viajes, las tarjetas van agrupadas por día (ver abajo).
5. Estado vacío: `.listado-vacio`, centrado y en `color-text-secondary` ("No hay viajes con esos filtros.").

## Agrupado por día (Viajes y Mis viajes)
- Las tarjetas se agrupan por día de inicio (día de Córdoba). Cada grupo es `<section class="listado-grupo"><h2 class="listado-dia">…</h2><div class="listado-cards">…</div></section>`.
- Los grupos siguen el orden del listado (más reciente primero) y dentro de cada día se mantiene el mismo orden.
- Título del grupo: "Hoy · vie 9 oct", "Mañana · sáb 10 oct", "Ayer · jue 8 oct"; cualquier otro día, "mié 7 oct". El año va solo si no es el año en curso ("lun 29 dic 2025"). Se escribe en minúscula y el CSS lo pasa a mayúsculas.
- `.listado-dia`: 13px, 600, mayúsculas, letter-spacing 0.04em, `color-text-secondary`, margen inferior `space-3`. Entre grupos, `space-6`.
- La lógica es una función pura, `agruparViajesPorDia` (`utils/viajesPorDia.js`).

## La tarjeta (`<button class="listado-card">`)
Todas siguen la misma anatomía:
- `.listado-card-marca`: cuadrado de 40px (`radius-md`, `brand-50` / `brand-600`) con un ícono de 20px, el `Avatar` de 40px en Usuarios, o el bloque de fecha (`.fecha-tile`, 48px) en los viajes. `ListadoCard` acepta `marcaClassName` para sumarle una clase a la marca.
- `.listado-card-cuerpo`, con:
  - `.listado-card-top`: título `.listado-card-titulo` (600) y a la derecha el `EstadoBadge` sm.
  - `.listado-card-sub`: el dato principal en `color-text` (15px).
  - `.listado-card-detalle`: datos secundarios en `color-text-secondary` (14px), opcional.
  - `.listado-card-pie`: línea final con borde superior `color-border`, 14px, `color-text-secondary` y números tabulares.

Contenido de cada pantalla:
- **Viaje**: bloque de fecha con el día de inicio; título la ruta (`RutaViaje`); badge de estado; sub el horario y el chofer ("07:30 – 10:00 · Martín Gómez"; "Chofer pendiente" si falta); sin detalle; pie el vehículo ("12 - AE452KD · Mercedes-Benz O500") a la izquierda y "110 km estimados" a la derecha. Ver `TarjetaViaje`.
  - **Mis viajes** (el chofer ve sus propios viajes): el sub es solo el horario; el resto igual. Los gestores ven siempre el chofer.
- **Vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (solo el dominio con `.patente`); badge Operativo / En taller / Dado de baja; sub marca y modelo; pie "Colectivo" a la izquierda y "57.345 km" a la derecha.
- **Documentación de un vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (dominio con `.patente`); badge del estado de la documentación (Vencida error, Por vencer warning, Incompleta neutral, Al día success); sub marca y modelo; detalle la línea del problema más urgente; pie "7 de 8 documentos cargados" a la izquierda y el tipo de vehículo a la derecha. Orden por número de interno.
- **Documentación de un chofer**: `Avatar` de 40px con el color del perfil; título nombre y apellido; mismo badge, detalle y pie "N de M documentos cargados" (sin DNI); sub el perfil ("Chofer"; "Encargado · habilitado para conducir"). Orden por apellido.
  - Línea de detalle: Vencida "ITV venció el 02 oct"; Por vencer "Comprobante de pago de seguro vence el 13 oct"; Incompleta "Falta: X" o "Faltan 3: A, B y C"; Al día "Próximo vencimiento: Póliza de seguro, 22 dic" (sin línea si ningún documento vence). El año se escribe solo cuando no es el año en curso.
  - Estado vacío: "No hay vehículos con ese estado." / "No hay choferes con ese estado.".
  - En la barra, a la derecha de Filtros, va un `ControlSegmentado` (Vehículos | Choferes) con ícono y la cantidad total de cada vista (sin búsqueda ni filtro); las dos listas se cargan en paralelo al entrar. La vista y la ficha abierta se guardan en la URL (`?tab=choferes`, `?vehiculoId=`, `?choferId=`).
- **Usuario**: `Avatar` de 40px; título el nombre; badge Activo (success) o Inactivo (neutral); sub el perfil; pie "@usuario".

## Reglas
- Superficie `color-surface`, borde `color-border`, `radius-md`, `shadow-sm`, padding `space-4`. En hover (solo con mouse) y al tocar (`:active`), borde `brand-500` y `shadow-md`. Foco: outline 2px `brand-600`, offset 2px. Click o Enter abre la ficha.
- Orden por defecto: Viajes, los de fecha de inicio más reciente primero (como hoy); Flota, por número de interno de menor a mayor; Usuarios, por nombre.
- La tabla (`TablaListado`) ya no se usa en ninguna pantalla.
