Pantalla de Mantenimiento (`pages/Mantenimiento.jsx` y `components/mantenimiento/`). Patrón de página armado con `Listado`, `ControlSegmentado`, `Filtros`, `FormField`, `EstadoBadge`, `EstadoCarga`, `Toast` y el marco de modal de Documentación (`ModalMarco`). Sin CSS propio salvo lo de `Mantenimiento.css`, solo con tokens.

## Estructura
- Sin título visible: `ListadoHeader` con "Mantenimiento" en `.sr-only`, como los listados.
- `ControlSegmentado` **Service | Arreglos | Historial** en la barra (`vistas` de `ListadoToolbar`), a la derecha de todo, con el buscador y Filtros a la izquierda, igual que en Documentación. Está en el mismo lugar en las tres vistas (en Arreglos, que no tiene buscador ni Filtros, queda solo a la derecha) y, debajo de 600px de barra, pasa arriba a todo el ancho (ver `Listado`). Sin acción en la barra. Service lleva como cantidad las alertas (vencidos + próximos); no se muestra mientras carga, si falló o si es 0. Arreglos e Historial no llevan cantidad.
- La vista y el vehículo del historial van en la URL: `?tab=arreglos`, `?tab=historial&vehiculoId=7`. Service es la vista por defecto (sin `tab`). Al cambiar de vista la página vuelve arriba.

## Service
- Barra: buscador ("Buscar por interno, dominio, marca o modelo") y Filtros, sin acción: el service se registra tocando la tarjeta del vehículo.
- Filtros: Estado (Todos, Vencido, Próximo, Al día, Sin plan), Tipo de vehículo y Ordenar por (Más urgente, Número de interno, Tipo de vehículo, Km desde el último service). El contador de Filtros cuenta estado y tipo; el orden no.
- Orden por defecto, Más urgente: la fracción del intervalo recorrida, de mayor a menor, con los Sin plan al final. Por km restantes no: 900 km son el 4,5 % de un colectivo y el 9 % de un utilitario.
- Filtrado y orden en el front (son pocos vehículos): funciones puras en `utils/mantenimiento.js`.
- Tarjeta (`ListadoCard`):
  - Marca: ícono de colectivo o combi (`IconoVehiculo`).
  - Título "12 - AB123CD" (solo el dominio con `.patente`).
  - Badge sm: Vencido (error), Próximo (warning), Al día (success), Sin plan (neutral).
  - Sub: marca y modelo.
  - Detalle: "Próximo service a los 340.000 km · faltan 800 km", "· pasado por 1.200 km" o "· le toca ahora". Sin plan: "Sin plan de service: asignale uno para seguir sus kilómetros."
  - Barra de avance (`.service-barra`, debajo del detalle, solo con plan): la fracción del intervalo recorrida (`porcentajeConsumido`), llena al llegar o pasar el service. 4px, `radius-full`, track `color-border`, máximo 240px. El relleno mezcla `state-success-solid` y `state-error-solid` en oklch según el avance: verde recién hecho el service, ámbar a mitad de camino, rojo al vencer. `role="progressbar"` con `aria-valuenow` y la etiqueta "Intervalo de service recorrido".
  - Pie: "Colectivo · service cada 20.000 km" a la izquierda y "Último: 320.000 km" a la derecha ("Odómetro: 57.345 km" si no tiene plan).
  - Click: con plan abre "Registrar service" con el vehículo elegido; sin plan, "Asignar plan de service".
- Vacío: "No hay vehículos con esos filtros.".

## Modal "Registrar service"
- `ModalMarco` con título "Registrar service" y, si el vehículo viene elegido, el subtítulo "12 - AB123CD · Mercedes-Benz O500".
- Campos: Vehículo (solo si no vino elegido; `select` ordenado por interno), Fecha (hoy por defecto, no puede ser futura) | Km del odómetro (hint "Odómetro actual: 57.345 km"), Observación (textarea con contador "0/500").
- Lo que incluye el service va como hint de Observación (texto gris de ayuda, `caption`, enlazado al textarea con `aria-describedby`), en una sola oración: "Incluye cambio de aceite, filtros de gasoil, aceite y habitáculo (aire acondicionado), alineado y balanceado y revisión general del motor.". La arma `textoIncluyeService` (`utils/mantenimiento.js`) con las tareas de la plantilla, `TAREAS_SERVICE` (`constants/mantenimiento.js`): si la plantilla cambia, la oración cambia sola. Nada de caja de color ni viñetas: es informativa, no se tilda, el service siempre es completo. Sin costo ni responsable.
- Botones "Cancelar" y "Registrar service" ("Registrando…"). Éxito: toast "Service registrado." con la acción "Ver en el historial".

## Modal "Asignar plan de service"
- Para un vehículo Sin plan. Muestra "Colectivo: service cada 20.000 km." y pide el "Km del último service" (por defecto el odómetro actual, hint "Odómetro actual: … km. Si no lo sabés, dejá el odómetro actual."). No puede superar al odómetro.
- Botones "Cancelar" y "Asignar plan" ("Asignando…"). Éxito: toast "Plan de service asignado.".

## Arreglos
- Solo el formulario, sin listado: `Card .form-card` con un `.form-grid`, como `FormularioVehiculo`. La barra tiene solo el `ControlSegmentado`, a la derecha.
- El formulario ocupa **todo el ancho** del contenido (no los 720px de `.form-card`, clase `arreglos-form-card`), para que sus bordes queden alineados con la barra y con las listas de Service e Historial; vive dentro de una pestaña junto a listas, no en una página propia. Sigue en dos columnas desde 640px, con Trabajos realizados, Descripción, Repuestos y Observaciones a ancho completo.
- Pares: Vehículo | Km del odómetro; Fecha | Responsable (`SelectorBuscarOCrear` sobre `/mantenimientos/responsables`, sin hint); Trabajos realizados (ancho); Descripción (ancho); Repuestos (ancho); Observaciones (ancho). Los textos largos llevan contador "0/500".
- Trabajos realizados es un `GrupoCasillas` con los tipos activos de `GET /mantenimientos/tipos-arreglo`, solo con el nombre. Se puede marcar más de uno (por ejemplo, Engrase + Cambio de cubiertas): se guardan en un solo registro. Sin ninguno marcado: "Elegí al menos un tipo de trabajo".
- "Otro" se puede combinar con los demás. Al marcarlo aparece debajo de su casilla (`contenidoMarcada`) el campo obligatorio "¿Qué trabajo?" (placeholder "Por ejemplo, cambio de espejo", hasta 60 caracteres). Si queda vacío: `Contá qué trabajo se hizo (obligatorio para "Otro")`. Al desmarcarlo, el campo y lo escrito se descartan. La Descripción es siempre opcional.
- El km no puede ser menor al odómetro actual: "Cargá un kilometraje válido: no puede ser menor al odómetro actual (57.345 km). Si es un arreglo anterior, marcalo abajo." Mientras el km es menor (con debounce: recién 700 ms después de dejar de escribir, o al enviar), debajo del par Vehículo | Km aparece (ancho) un `Switch` "Es un arreglo anterior, hecho con menos km que el odómetro actual"; marcado, se acepta y se manda `esAnterior: true` (el odómetro no cambia). Si el km vuelve a ser igual o mayor, el switch se va y no se manda. El backend también rechaza un `esAnterior` con km igual o mayor al odómetro.
- Sin campo de costo.
- Botones "Registrar arreglo" ("Registrando…") y "Cancelar" (limpia el formulario). Éxito: el formulario se limpia y toast "Arreglo registrado." con la acción "Ver en el historial" (`?tab=historial&vehiculoId=…`).
- Si no carga la lista de vehículos o de tipos, el mensaje va como error de su campo (`FormField` o `GrupoCasillas`); el resto del formulario sigue usable.

## Historial
- Barra: buscador por vehículo ("Buscar vehículo por interno, dominio, marca o modelo", se aplica al dejar de escribir) y Filtros.
- Filtros: Tipo (Todos, Service, Arreglos), Tipo de arreglo (oculto si Tipo es Service; trae los arreglos que incluyen ese tipo), Tipo de vehículo, Desde, Hasta y Ordenar por (Más reciente, Más antiguo, Número de interno, Km).
- Filtrado, orden y paginado en el backend (`GET /mantenimientos/historial`): el historial crece sin límite.
- Con `?vehiculoId=`, arriba de la lista: el vehículo ("12 - AB123CD"), el badge del estado de su service (o "Dado de baja") y la línea del próximo service, con el botón "Ver toda la flota" que quita el filtro.
- Resumen en gris: "N registros".
- Tarjeta (`ListadoCard` de solo lectura, sin `onClick`: un `div` sin hover ni foco):
  - Marca: el bloque de fecha (`fecha-tile`). Como es decorativo, el título lleva la fecha completa en `.sr-only`.
  - Título "12 - AB123CD".
  - Badge sm: "Service" (brand) o, en un arreglo, cuántos trabajos tiene (neutral): "1 trabajo", "2 trabajos", "N trabajos", igual en todas las tarjetas. La lista va en el `title`.
  - Sub: la descripción o la observación ("Service completo" si un service no tiene observación; "Sin descripción" si un arreglo no tiene ninguna). El "¿Qué trabajo?" de "Otro" no va acá.
  - Detalle: primero "Trabajos: Engrase, Cambio de cubiertas, Cambio de espejo" (todos los tipos, aunque sea uno, en el orden del catálogo; "Otro" con su "¿Qué trabajo?", o "Otro" si se cargó antes del detalle); después "Repuestos: …" y la observación si no entró en el sub.
  - Pie: "57.345 km · Hizo: Taller Gómez" (el "Hizo" solo si se cargó) a la izquierda y "Registró: Nombre Apellido" a la derecha.
- Paginado de a 30, con el botón secondary "Ver más" al final (mismo estilo que "Ver N más" del Dashboard).
- Vacío: "No hay registros con esos filtros." (o "Todavía no hay services ni arreglos registrados." sin filtros).

## Textos
- Siempre "Historial" (no "Ficha médica").
- Los estados se escriben siempre igual: Vencido, Próximo, Al día, Sin plan.
- Km con separador de miles es-AR y números tabulares (`.num`, y los pies de tarjeta ya los aplican).
