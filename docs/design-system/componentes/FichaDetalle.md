Ficha de detalle de un registro: viaje, vehículo y usuario. Es un patrón de página: una sola `Card` plana con los datos en pares, en el mismo orden que su formulario.

## Común a las tres
- **Encabezado:** `.back-link` ("← Volver al listado", alto mínimo 44px y margen inferior `space-2`) y un header con el `h1` a la izquierda y el `EstadoBadge` md a la derecha. En usuarios el badge dice "Activo" (success) o "Inactivo" (neutral).
- **Grilla:** una `Card` con `.detalle-card` y adentro una sola `<dl class="detalle-grid">`, con un `.detalle-item` (`dt` + `dd`) por dato. Sin `<section>`, sin títulos de sección y sin bordes entre bloques. `.detalle-card > .detalle-grid` lleva padding `space-6`.
- **Columnas:** una en mobile y dos desde 640px, también en pantallas anchas. Nunca tres: así cada par queda junto. Gap de la grilla `space-4` × `space-6`.
- **Ancho completo:** el dato largo o sin par va en `.detalle-item-ancho` (respeta los saltos de línea).
- **Pares incompletos:** si en un par falta un dato, el hueco queda vacío con un `<div class="detalle-hueco" aria-hidden="true" />`, para que el par siguiente no se corra. En una columna el hueco no se muestra.
- **Datos vacíos:** "No registrado", nunca "—".
- `dt` en 14px y `color-text-secondary`; `dd` en 16px y `color-text`, con números tabulares.

## Formato de los datos
| Dato | Formato | Helper (`utils/viajeFormato.js`) |
| --- | --- | --- |
| Fecha sola | "12 mar 2026", en hora de Córdoba. Vale para toda la app, también para las fechas de pago de los datos administrativos del viaje; nunca "dd/mm/aaaa" | `formatearFechaCorta` |
| Fecha y hora | "07 oct 08:00" | `formatearDiaYHora` |
| Kilómetros | "57.345 km" (kilometraje, odómetros, estimados y realizados) | `formatearKm` + " km" |
| DNI | "38.456.789"; si no es numérico, tal cual | `formatearDni` |
| Dominio | con `.patente` | |

No se usa `toLocaleDateString()`.

## Ficha de vehículo
- `h1`: "Vehículo 12 - AE452KD" (interno, guion y dominio con `.patente`).
- Pares: Número de interno | Dominio · Marca | Modelo · Tipo de vehículo | Año · Cantidad de asientos | Kilometraje · Registrado el | Dado de baja el (este último solo si el vehículo está dado de baja).
- Acciones dentro de la card, debajo de la grilla (`.detalle-acciones`), solo para Administrador y Encargado: "Ver documentación" (secondary); si no está dado de baja, también "Editar vehículo" (secondary) y "Dar de baja" (danger).

## Ficha de usuario
- `h1`: nombre y apellido.
- Pares: DNI | Teléfono · Email (ancho completo) · Nombre de usuario | Perfil · Habilitado para conducir ("Sí" o "No") | Registrado el.
- Acciones dentro de la card (`.detalle-acciones`), solo si el usuario está activo: "Editar usuario" (secondary) y "Dar de baja" (danger).

## Ficha de viaje (`FichaViaje`)
Datos, en este orden:
1. Cliente (`.detalle-item-ancho .detalle-item-destacado`).
2. Recorrido (`.detalle-item-ancho`): el `dd` lleva un `<span class="detalle-recorrido">` con `RutaViaje` completa (paradas incluidas) y `BotonVerRecorrido` al lado. Siempre se muestra; un viaje histórico sin origen o destino los dice "No registrado".
3. Inicio | Fin ("07 oct 08:00").
4. Chofer | Vehículo ("12 - AE452KD (Mercedes-Benz O500)"). En un A confirmar van **Choferes posibles** y **Vehículos posibles**, cada uno a ancho completo (nombres separados por coma, "Sin cargar" si la lista está vacía). Solo los ven Administrador y Encargado; para el resto quedan en "No registrado".
5. Kilómetros estimados | Cantidad de pasajeros.
6. Solo si el viaje ya empezó: Hora real de inicio | Hora real de fin · Odómetro inicial | Odómetro final · Km realizados (con su hueco al lado). Un viaje En viaje muestra solo lo que ya existe, con el hueco donde falta.
7. Observación (`.detalle-item-ancho`), solo si hay texto.

- Debajo de la card, `.viajes-detalle-actions` con los `Button`, que nombran el objeto: "Confirmar viaje" (primary), "Comenzar viaje" (primary), "Finalizar viaje" (primary), "Editar viaje" (secondary) y "Cancelar viaje" (danger). Nunca "Cancelar" solo en rojo: "Cancelar" a secas es solo el botón que cierra un formulario sin guardar. En un viaje Programado, los gestores ven también **Avisar por WhatsApp** (ver `AvisarPorWhatsApp`), entre Comenzar viaje y Editar viaje.
- Los datos administrativos (solo Administrador y Encargado) siguen en su propio bloque debajo, agrupados en secciones tituladas (`.detalle-seccion`).
- En la ficha de un viaje no va "Kilometraje actual del vehículo": es un dato del vehículo, cambia con cada viaje y confunde en un viaje ya finalizado. Se reemplaza por el odómetro inicial y final del viaje.

## Scroll
- Al abrir la ficha (de un viaje, un vehículo o un usuario) la página vuelve arriba, y también al volver al listado. La ficha reemplaza al listado en la misma ruta y el router no reinicia el scroll: sin esto aparecería desplazada hacia abajo.
