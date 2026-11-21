Pantalla de Mantenimiento (`pages/Mantenimiento.jsx` y `components/mantenimiento/`). Patrón de página armado con `Listado`, `Filtros`, `PanelLateral`, `FormField`, `EstadoBadge`, `EstadoCarga` y `Toast`. Sin CSS propio salvo lo de `Mantenimiento.css`, solo con tokens.

## Idea
Primero se elige el vehículo y después qué hacer. La pantalla es la lista de vehículos con el estado de su service; al tocar uno se abre su panel lateral con las acciones ("Registrar service", "Registrar arreglo" o "Asignar plan de service") y su historial. No hay pestañas Service | Arreglos | Historial ni un historial de toda la flota.

## Lista (`ListaService`)
- Sin título visible: `ListadoHeader` con "Mantenimiento" en `.sr-only`, como los listados.
- Barra: buscador ("Buscar por interno, dominio, marca o modelo") y Filtros. Sin acción ni control de vistas.
- Filtros: Estado (Todos, Vencido, Próximo, Al día, Sin plan), Tipo de vehículo y Ordenar por (Más urgente, Número de interno, Tipo de vehículo, Km desde el último service). El contador de Filtros cuenta estado y tipo; el orden no.
- Orden por defecto, Más urgente: la fracción del intervalo recorrida, de mayor a menor, con los Sin plan al final. Por km restantes no: 900 km son el 4,5 % de un colectivo y el 9 % de un utilitario.
- Filtrado y orden en el front (son pocos vehículos): funciones puras en `utils/mantenimiento.js`.
- Arriba de las tarjetas, en gris (`.mantenimiento-resumen`): las alertas de toda la flota, "2 vencidos · 3 próximos" (`textoAlertas`), sin las que están en cero. Sin alertas no se muestra.
- Tarjeta (`TarjetaService`, `ListadoCard`):
  - Marca: ícono de colectivo o combi (`IconoVehiculo`).
  - Título "12 - AB123CD" (solo el dominio con `.patente`).
  - Badge sm: Vencido (error), Próximo (warning), Al día (success), Sin plan (neutral).
  - Sub: marca y modelo.
  - Detalle: "Próximo service a los 340.000 km · faltan 800 km", "· pasado por 1.200 km" o "· le toca ahora". Sin plan: "Sin plan de service: asignale uno para seguir sus kilómetros."
  - Barra de avance (`BarraService`, `.service-barra`, debajo del detalle, solo con plan): la fracción del intervalo recorrida (`porcentajeConsumido`), llena al llegar o pasar el service. 4px, `radius-full`, track `color-border`, máximo 240px. El relleno mezcla `state-success-solid` y `state-error-solid` en oklch según el avance: verde recién hecho el service, ámbar a mitad de camino, rojo al vencer. `role="progressbar"` con `aria-valuenow` y la etiqueta "Intervalo de service recorrido".
  - Pie: "Colectivo · service cada 20.000 km" a la izquierda y "Último: 320.000 km" a la derecha ("Odómetro: 57.345 km" si no tiene plan).
  - Click: abre el panel del vehículo (también si está Sin plan).
- Vacío: "No hay vehículos con esos filtros." (o "No hay vehículos en la flota.").

## Panel del vehículo (`PanelVehiculoMantenimiento`)
- `PanelLateral`. El panel abierto va en la URL (`?vehiculoId=7`): se puede compartir y Atrás lo cierra. Abrir desde la lista suma una entrada al historial del navegador; cerrar vuelve atrás. Si se entró directo con `?vehiculoId=`, cerrar quita el parámetro. Un `?vehiculoId=` de un vehículo que no está en la lista (dado de baja o inexistente) no abre nada.
- Tiene cuatro vistas, una a la vez, dentro del mismo panel (nunca un modal encima):
  - **Resumen** (la del principio):
    - Título "12 - AB123CD" y subtítulo marca y modelo.
    - Estado: badge del service con "Colectivo · service cada 20.000 km" al lado, la línea del próximo service y la barra a todo el ancho del panel (sin plan, sin barra).
    - Acciones: con plan, "Registrar service" (primary) y "Registrar arreglo" (secondary); sin plan, "Asignar plan de service" (primary) y "Registrar arreglo" (secondary). En el celular, cada una a todo el ancho.
    - Historial (ver abajo).
  - **Registrar service**, **Registrar arreglo** y **Asignar plan de service**: título con la acción y subtítulo "12 - AB123CD · Mercedes-Benz O500"; "← Volver" arriba del título; el formulario con "Registrar …" (primary) y "Cancelar" (secondary), que vuelven al resumen.
- Al guardar: vuelve al resumen, el historial se vuelve a pedir y el registro nuevo queda primero y expandido; toast "Service registrado.", "Arreglo registrado." o "Plan de service asignado."; la lista se recarga (puede cambiar el odómetro o el estado).
- Los formularios usan la grilla de dos columnas desde 640px de pantalla (en el panel de 480px entran los pares Fecha | Km).

## Historial del vehículo (`HistorialVehiculo`)
- Título de sección "Historial" y, en gris, "N registros".
- Services y arreglos juntos, del más reciente al más antiguo (`GET /mantenimientos/historial?vehiculoId=…&orden=fecha_desc`), de a 10 con el botón secondary "Ver más".
- Cada registro es una fila (`ItemHistorial`): un `<button>` con `aria-expanded` y `aria-controls`, separadas por un borde `color-border`:
  - Arriba: la fecha del trabajo ("12 mar 2026", en negrita), el badge sm "Service" (brand) o, en un arreglo, cuántos trabajos tiene (neutral: "1 trabajo", "N trabajos", con la lista en el `title` y tope de ancho), el km ("57.345 km", a la derecha) y una flecha que gira al abrir.
  - Abajo, en gris y en una línea: la descripción o la observación ("Service completo" si un service no tiene observación; "Sin descripción" si un arreglo no tiene ninguna).
  - Al tocarla se expande debajo, en el mismo panel, con el detalle (`DetalleRegistro`). Se pueden tener varias abiertas.
- Vacío: "Todavía no hay services ni arreglos de este vehículo."

## Detalle del registro (`DetalleRegistro`)
- Un `<dl class="detalle-grid">` con el patrón de `FichaDetalle` (pares, "No registrado" si falta un dato). Sin título ni vehículo: ya están en el panel.
  - Fecha del trabajo | Km del odómetro.
  - Service: Incluye (ancho, `textoIncluyeService`). Arreglo: Trabajos realizados (ancho, "Engrase, Cambio de espejo", con el "¿Qué trabajo?" de "Otro"), Descripción (ancho) y Repuestos (ancho).
  - Service: Observaciones (ancho). El arreglo no la tiene: si uno viejo solo tiene observación, se muestra como Descripción.
  - Arreglo: Hizo | Registró · Cargado el (con su hueco). Service (no pide quién lo hizo): Registró | Cargado el.
- "Cargado el" es el día en que se cargó en el sistema (`creadoEn`), que puede ser posterior a la fecha del trabajo.

## Formulario "Registrar service" (`FormularioService`)
- Campos: Fecha (hoy por defecto, no puede ser futura) | Km del odómetro (hint "Odómetro actual: 57.345 km"), Observación (ancho, textarea con contador "0/500"). El vehículo no se pregunta: es el del panel.
- Lo que incluye el service va como ayuda de Observación (`ayuda` de `FormField`: tooltip junto al label, enlazado al textarea con `aria-describedby`), en una sola oración: "Incluye: Cambio de aceite + Filtros de gasoil, aceite y habitáculo (aire acondicionado) + Alineado y balanceado + Revisión general del motor." (tareas separadas por "+"). La arma `textoIncluyeService` con `TAREAS_SERVICE` (`constants/mantenimiento.js`). Nada de caja de color ni viñetas: es informativa, no se tilda, el service siempre es completo. Sin costo ni responsable.
- Botón "Registrar service" ("Registrando…").

## Formulario "Registrar arreglo" (`FormularioArreglo`)
- El vehículo no se elige: es el del panel.
- Campos: Km del odómetro (hint con el odómetro actual) | Fecha; Responsable (ancho, `SelectorBuscarOCrear` sobre `/mantenimientos/responsables`); Trabajos realizados (ancho); Descripción (ancho); Repuestos (ancho). Los textos largos llevan contador "0/500". Sin costo.
- Trabajos realizados es un `GrupoCasillas` con los tipos activos de `GET /mantenimientos/tipos-arreglo`, solo con el nombre. Se puede marcar más de uno (se guardan en un solo registro). Sin ninguno marcado: "Elegí al menos un tipo de trabajo". Si los tipos no cargan, el mensaje va como error del grupo; el resto del formulario sigue usable.
- "Otro" se puede combinar con los demás. Al marcarlo aparece debajo de su casilla (`contenidoMarcada`) el campo obligatorio "¿Qué trabajo?" (placeholder "Por ejemplo, cambio de espejo", hasta 60 caracteres). Si queda vacío: `Contá qué trabajo se hizo (obligatorio para "Otro")`. Al desmarcarlo, el campo y lo escrito se descartan.
- El km no puede ser menor al odómetro actual: "Cargá un kilometraje válido: no puede ser menor al odómetro actual (57.345 km). Si es un arreglo anterior, marcalo abajo." Mientras el km es menor (con debounce: 700 ms después de dejar de escribir, o al enviar), debajo del par Km | Fecha aparece (ancho) un `Switch` "Es un arreglo anterior, hecho con menos km que el odómetro actual"; marcado, se acepta y se manda `esAnterior: true` (el odómetro no cambia).
- Botón "Registrar arreglo" ("Registrando…").

## Formulario "Asignar plan de service" (`FormularioAsignarPlan`)
- Para un vehículo Sin plan. Muestra "Colectivo: service cada 20.000 km." y pide el "Km del último service" (por defecto el odómetro actual, ayuda "Si no lo sabés, dejá el odómetro actual." y hint "Odómetro actual: … km"). No puede superar al odómetro.
- Botón "Asignar plan" ("Asignando…"), deshabilitado si el tipo no tiene plantilla.

## Textos
- Siempre "Historial" (no "Ficha médica").
- Los estados se escriben siempre igual: Vencido, Próximo, Al día, Sin plan.
- Km con separador de miles es-AR y números tabulares (`.num`).
