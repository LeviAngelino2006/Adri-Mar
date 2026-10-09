Patrón único para las pantallas de listado: Viajes, Flota de vehículos, Usuarios y Documentación. Antes cada una tenía su propia estética (tarjetas anchas, tarjetas con franja azul y una tabla). Ahora comparten encabezado, barra de herramientas y la misma tarjeta, apiladas a todo el ancho. Patrón de página (`Viajes.jsx`, `FlotaVehiculos.jsx`, `Usuarios.jsx`, `Documentacion.jsx`).

## Estructura de la pantalla
1. `.listado-header`: `h1` a la izquierda y la acción principal a la derecha (`Button` primary: "+ Programar viaje", "+ Nuevo vehículo", "+ Nuevo usuario"). El título es el mismo texto que el ítem de navegación: "Viajes", "Flota de vehículos", "Usuarios" (no "Gestionar usuarios").
2. `.listado-toolbar`: a la izquierda el buscador `.listado-buscar` (input con ícono de lupa, hasta 400px) y a su lado el botón "Filtros" (`.filtros-toggle-btn`, con el contador de filtros activos). Cada pantalla pone solo lo que usa: Viajes, solo Filtros (estado, desde, chofer); Flota, buscador (dominio, interno o marca) y Filtros (estado); Usuarios, solo buscador; Documentación, buscador (dominio, interno o marca / nombre o DNI) y Filtros (estado de la documentación). La posición y el estilo son siempre los mismos.
3. `.listado-filtros`: el panel que abre el botón Filtros (ver `Filtros`). Cerrado por defecto, también en Flota.
4. `.listado-cards`: una sola columna de tarjetas apiladas, cada una a todo el ancho de la fila, con gap `space-4`. Es igual en todos los tamaños; no hay tablas ni grilla.
5. Estado vacío: `.listado-vacio`, centrado y en `color-text-secondary` ("No hay viajes con esos filtros.").

## La tarjeta (`<button class="listado-card">`)
Todas siguen la misma anatomía:
- `.listado-card-marca`: cuadrado de 40px (`radius-md`, `brand-50` / `brand-600`) con un ícono de 20px, o el `Avatar` de 40px en Usuarios.
- `.listado-card-cuerpo`, con:
  - `.listado-card-top`: título `.listado-card-titulo` (600) y a la derecha el `EstadoBadge` sm.
  - `.listado-card-sub`: el dato principal en `color-text` (15px).
  - `.listado-card-detalle`: datos secundarios en `color-text-secondary` (14px), opcional.
  - `.listado-card-pie`: línea final con borde superior `color-border`, 14px, `color-text-secondary` y números tabulares.

Contenido de cada pantalla:
- **Viaje**: ícono de ruta; título el chofer ("Chofer pendiente" si falta); badge de estado; sub la ruta (`RutaViaje`); detalle el vehículo ("2 - AB123CD (Mercedes-Benz OH 1618 L)"); pie "11 oct · 10:00 - 14:00" a la izquierda y "26 km estimados" a la derecha.
  - **Mis viajes** (el chofer ve sus propios viajes): el título es el vehículo ("2 - AB123CD", solo el dominio con `.patente`) y no se muestra el chofer ni la línea de detalle; el resto igual. El chofer solo aparece como título en la vista de los gestores.
- **Vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (solo el dominio con `.patente`); badge Operativo / En taller / Dado de baja; sub marca y modelo; pie "Colectivo" a la izquierda y "57.345 km" a la derecha.
- **Documentación de un vehículo**: ícono de colectivo o combi; título "2 - AB123CD" (dominio con `.patente`); badge del estado de la documentación (Vencida error, Por vencer warning, Incompleta neutral, Al día success); sub marca y modelo; detalle la línea del problema más urgente; pie "7 de 8 documentos cargados" a la izquierda y el tipo de vehículo a la derecha. Orden por número de interno.
- **Documentación de un chofer**: `Avatar` de 40px con el color del perfil; título nombre y apellido; mismo badge, detalle y pie "N de M documentos cargados" (sin DNI); sub el perfil ("Chofer"; "Encargado · habilitado para conducir"). Orden por apellido.
  - Línea de detalle: Vencida "ITV venció el 02 oct"; Por vencer "Comprobante de pago de seguro vence el 13 oct"; Incompleta "Falta: X" o "Faltan 3: A, B y C"; Al día "Próximo vencimiento: Póliza de seguro, 22 dic" (sin línea si ningún documento vence). El año se escribe solo cuando no es el año en curso.
  - Estado vacío: "No hay vehículos con ese estado." / "No hay choferes con ese estado.".
  - Arriba del buscador va un `ControlSegmentado` (Vehículos | Choferes); la vista y la ficha abierta se guardan en la URL (`?tab=choferes`, `?vehiculoId=`, `?choferId=`).
- **Usuario**: `Avatar` de 40px; título el nombre; badge Activo (success) o Inactivo (neutral); sub el perfil; pie "@usuario".

## Reglas
- Superficie `color-surface`, borde `color-border`, `radius-md`, `shadow-sm`, padding `space-4`. En hover (solo con mouse) y al tocar (`:active`), borde `brand-500` y `shadow-md`. Foco: outline 2px `brand-600`, offset 2px. Click o Enter abre la ficha.
- Orden por defecto: Viajes, los de fecha de inicio más reciente primero (como hoy); Flota, por número de interno de menor a mayor; Usuarios, por nombre.
- La tabla (`TablaListado`) ya no se usa en ninguna pantalla.
