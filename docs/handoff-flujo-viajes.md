# Handoff — Nuevo flujo de creación de viajes (Adri-Mar)

> Prompt para el agente de Claude Code. Se implementa en **4 fases**, una rama/PR por fase. No avances a la siguiente fase sin terminar, testear y reportar la anterior.

---

## Contexto

Hoy un viaje nace `PROGRAMADO` si se cargan los 5 campos operativos (chofer, vehículo, fechaInicio, fechaFin, kilometrosEstimados). Así no trabaja el encargado: primero anota el viaje con **varios choferes y vehículos posibles**, y recién el día anterior **confirma** a uno de cada uno y le avisa al chofer.

Ya existe y se reutiliza:
- Estado `A_CONFIRMAR`, con los campos operativos nullable en `viajes`.
- `PATCH /viajes/:id/confirmar` + `ModalConfirmarViaje` + `validarDisponibilidadOperativa`.
- `/mis-viajes` excluye siempre `A_CONFIRMAR`. **No tocar.**
- Tabla `Ubicacion` + `SelectorBuscarOCrear` (los usan origen y destino).
- `Usuario.telefono` (opcional).

Antes de escribir código, leé `viajeService.js`, `viajeController.js`, `viajeRoutes.js`, `ViajeForm.jsx`, `Viajes.jsx`, `ModalConfirmarViaje.jsx`, `RutaViaje.jsx`, `schema.prisma` y `backend/tests/viajes.test.js`, y respetá sus convenciones (comentarios explicando el porqué, `ValidacionError` con errores por campo, `serializarViaje`).

---

## Fase 1 — Estado inicial, fecha obligatoria y pasajeros

### Reglas
1. **Todo viaje nace `A_CONFIRMAR`**, aunque vengan los 5 campos operativos. Eliminá la bifurcación `completo ? 'PROGRAMADO' : 'A_CONFIRMAR'` de `crearViaje`. El único camino a `PROGRAMADO` es `confirmarViaje`.
2. **`fechaInicio` obligatoria al crear y al editar**, en cualquier estado. Se valida en el service. La columna queda nullable en la base por los datos históricos: dejá un comentario igual al que ya tiene `origenId`.
3. **Campo nuevo `cantidadPasajeros`** (`Int?` en la base, columna `cantidad_pasajeros`):
   - **Opcional** en todos los estados, porque no siempre se conoce al crear el viaje. Si viene, tiene que ser un entero > 0.
   - **No** se valida contra `Vehiculo.asientos`: es un dato informativo y no restringe nada.
4. Al crear con los 5 campos completos ya **no** corre la validación de disponibilidad (habilitación + solapamiento): esa validación queda solo para confirmar y para editar un `PROGRAMADO`.

### Frontend
- `Viajes.jsx`: "+ Programar viaje" pasa a "+ Crear viaje", y el título y el botón del formulario pasan a "Crear viaje".
- `ViajeForm.jsx`: eliminá `LEYENDA_OPERATIVOS_OPCIONALES` (la que explica la auto-programación). Fecha de inicio pasa a ser obligatoria (*) y se agrega el input opcional "Cantidad de pasajeros".
- El mensaje de éxito al crear es siempre "Viaje creado como A confirmar".
- Mostrá la cantidad de pasajeros en el detalle del viaje; si no se cargó, mostrá "—".

### Tests
Actualizá `viajes.test.js`:
- Crear con los 5 campos → `A_CONFIRMAR`.
- Crear sin `fechaInicio` → 400.
- Crear sin pasajeros → OK; con pasajeros ≤ 0 o no entero → 400.

---

## Fase 2 — Candidatos

### Modelo
```prisma
model ViajeChoferCandidato {
  viajeId   Int     @map("viaje_id")
  usuarioId Int     @map("usuario_id")
  viaje     Viaje   @relation(fields: [viajeId], references: [id], onDelete: Cascade)
  usuario   Usuario @relation(fields: [usuarioId], references: [id], onDelete: Restrict)
  @@id([viajeId, usuarioId])
  @@map("viaje_chofer_candidato")
}

model ViajeVehiculoCandidato {
  viajeId    Int      @map("viaje_id")
  vehiculoId Int      @map("vehiculo_id")
  viaje      Viaje    @relation(fields: [viajeId], references: [id], onDelete: Cascade)
  vehiculo   Vehiculo @relation(fields: [vehiculoId], references: [id], onDelete: Restrict)
  @@id([viajeId, vehiculoId])
  @@map("viaje_vehiculo_candidato")
}
```
- `Viaje.choferId` y `Viaje.vehiculoId` **se mantienen** como "el asignado". En `A_CONFIRMAR` quedan en `null` y se completan al confirmar. No se toca nada de lo que pasa después de programar (solapamiento, comenzar/finalizar, odómetro, `/mis-viajes`, `puedeOperarViaje`).
- Migración de datos: los `A_CONFIRMAR` existentes que tengan `choferId` o `vehiculoId` pasan a tener ese valor como candidato, y el asignado queda en `null`. Son datos de prueba, así que alcanza con SQL simple dentro de la migración.

### API
- `POST /viajes` y `PUT /viajes/:id` aceptan `choferesCandidatos: number[]` y `vehiculosCandidatos: number[]` (0 o más; sin duplicados; cada id tiene que existir).
  - En `A_CONFIRMAR` **no se aceptan** `choferId`/`vehiculoId` sueltos: en ese estado se usan los candidatos.
  - En `PROGRAMADO` la edición sigue como hoy, con 1 chofer y 1 vehículo y validación completa. Los candidatos no aplican.
  - La edición es reemplazo completo de las listas: `deleteMany` + `createMany` dentro de `prisma.$transaction`.
- `serializarViaje` incluye `choferesCandidatos` y `vehiculosCandidatos` (id + nombre/dominio/interno) **solo para ADMINISTRADOR/ENCARGADO**. Para el resto, las claves se omiten, con el mismo criterio que los datos administrativos.
- `PATCH /viajes/:id/confirmar`:
  - Recibe 1 `choferId` y 1 `vehiculoId`. **Pueden ser candidatos o no**: se permite "elegir otro".
  - Exige fechaFin y kilometrosEstimados, y corre `validarDisponibilidadOperativa`.
  - Si pasa, en la **misma transacción** pasa el viaje a `PROGRAMADO` y **borra los candidatos** (decisión de negocio: no se guardan).
- **Disponibilidad** — endpoint nuevo `GET /viajes/:id/disponibilidad` (solo gestores). Para cada candidato, y opcionalmente para todos los choferes/vehículos con `?todos=true`, devuelve `{ id, disponible: boolean, motivo: string|null }`. Los motivos son "Se superpone con otro viaje programado (HH:mm–HH:mm)", "Vehículo en taller" y "No habilitado para conducir". Reutilizá `existeSolapamiento`, sin duplicar lógica.
  - Para los avisos en el alta (cuando el viaje todavía no existe), agregá un equivalente `POST /viajes/disponibilidad` que reciba `{ fechaInicio, fechaFin?, choferIds, vehiculoIds }`. Si no hay `fechaFin`, chequeá solapamiento contra el día de `fechaInicio`.

### Frontend
- `ViajeForm` (alta y edición en `A_CONFIRMAR`): reemplazá los `select` de chofer y vehículo por **multiselect con chips** (componente nuevo `SelectorMultiple` en `components/ui/`, siguiendo el estilo del design system). Debajo de cada chip con problema, mostrá el aviso que devuelve `/viajes/disponibilidad`. Los avisos **no bloquean** el guardado.
- `ModalConfirmarViaje`:
  - Chofer: lista de radios con los candidatos. Los no disponibles van **deshabilitados con el motivo a la derecha**. Al final, la opción "Elegir otro…", que despliega un select con todos los choferes habilitados.
  - Vehículo: igual que chofer.
  - Si el viaje no tiene candidatos, se muestra directamente el select.
  - Fechas y km se precargan y son obligatorios.
- En el detalle de un `A_CONFIRMAR`, mostrá los candidatos en lugar de "Chofer: —".

### Tests
- Crear con candidatos.
- Editar candidatos (reemplazo completo).
- Confirmar con un candidato.
- Confirmar con alguien fuera de los candidatos.
- Confirmar borra los candidatos.
- Un chofer no ve los candidatos en ninguna respuesta.
- `/mis-viajes` sigue sin mostrar `A_CONFIRMAR`.

---

## Fase 3 — Paradas intermedias

### Qué es una parada (definido con el cliente)
Es un punto intermedio **ordenado** del recorrido, entre origen y destino. Sirve para que el encargado estime kilómetros, tiempo y presupuesto. Ejemplo: Río Tercero → Alta Gracia → Museo del Kempes → Córdoba.

Una parada **no tiene** datos propios (ni hora, ni pasajeros, ni observación), **no cambia** ni chofer ni vehículo, **no** registra odómetro y el chofer **no** interactúa con ella. Solo se muestra en el detalle.

### Modelo
```prisma
model ViajeParada {
  id          Int       @id @default(autoincrement())
  viajeId     Int       @map("viaje_id")
  ubicacionId Int       @map("ubicacion_id")
  orden       Int
  viaje       Viaje     @relation(fields: [viajeId], references: [id], onDelete: Cascade)
  ubicacion   Ubicacion @relation(fields: [ubicacionId], references: [id], onDelete: Restrict)
  @@unique([viajeId, orden])
  @@map("viaje_paradas")
}
```

### Reglas
- `POST /viajes` y `PUT /viajes/:id` aceptan `paradas: number[]`: ids de `Ubicacion` **en orden**, 0 o más, con un **máximo de 9** (es el límite de puntos intermedios de los links de Google Maps; ver más abajo).
- El `orden` lo asigna el backend según la posición en el array (1..n). El front no lo manda.
- Se pueden editar en `A_CONFIRMAR` y en `PROGRAMADO`. En `EN_VIAJE`, `FINALIZADO` o `CANCELADO` no (mismo criterio que `actualizarViaje`).
- La edición es reemplazo completo dentro de `prisma.$transaction`: `deleteMany` y después `createMany`. Así se evita chocar con el `@@unique([viajeId, orden])` al reordenar.
- Validaciones:
  - Cada id existe.
  - **No hay dos puntos consecutivos iguales** en la secuencia completa `[origen, ...paradas, destino]`. Error: `paradas: 'La parada N es igual al punto anterior'`.
  - Una ubicación **puede repetirse si no es consecutiva**, por ejemplo en un ida y vuelta.
- Las paradas se crean desde el mismo `SelectorBuscarOCrear` que origen y destino, así que se reutiliza la creación de ubicaciones nuevas.
- `serializarViaje` devuelve `paradas: [{ orden, ubicacion: { id, nombre } }]` ordenadas. Las ven todos los perfiles que ven el viaje.

### Frontend
- En `ViajeForm`, un bloque **Recorrido** estilo Google Maps/Uber:
  ```
  ● Origen          [Río Tercero        ]
  │ Parada 1        [Alta Gracia        ] ↑ ↓ ✕
  │ Parada 2        [Museo del Kempes   ] ↑ ↓ ✕
  │ + Agregar parada
  ● Destino         [Córdoba            ]
  ```
  - "+ Agregar parada" agrega un selector vacío antes del destino.
  - Para reordenar usá **botones ↑/↓**, que funcionan bien en celular y son accesibles. Si querés sumar arrastrar y soltar, usá `@dnd-kit/sortable` como extra, pero los botones son obligatorios.
  - Las paradas vacías se descartan al enviar.
- Botón **"Ver recorrido en Google Maps"**: abre en una pestaña nueva la ruta completa (origen → paradas → destino) para que el encargado lea los km y el tiempo y los cargue en "Kilómetros estimados". Usa el formato oficial de Google Maps URLs, que no necesita API key ni tiene costo.
  - Creá `frontend/src/utils/googleMaps.js`:
    ```js
    const BASE = 'https://www.google.com/maps/dir/?api=1';
    // Sin contexto geográfico, "San Martín" o "Museo del Kempes" pueden
    // resolverse en cualquier lado. Si el nombre no trae coma (ej. "Alta Gracia,
    // Córdoba"), se le agrega la provincia.
    const conContexto = (nombre) => (nombre.includes(',') ? nombre : `${nombre}, Córdoba, Argentina`);

    export function urlRecorrido({ origen, paradas = [], destino }) {
      if (!origen?.nombre || !destino?.nombre) return null;
      const params = new URLSearchParams({
        origin: conContexto(origen.nombre),
        destination: conContexto(destino.nombre),
        travelmode: 'driving',
      });
      const intermedias = paradas.map((p) => p?.nombre).filter(Boolean).map(conContexto);
      if (intermedias.length) params.set('waypoints', intermedias.join('|'));
      return `${BASE}&${params.toString()}`;
    }
    ```
    Agregá tests unitarios: sin paradas, con paradas, con un nombre que ya trae coma, y sin origen (devuelve null).
  - En el **formulario**: el botón va debajo del bloque Recorrido. Se habilita cuando hay origen y destino y se actualiza en vivo al agregar o reordenar paradas. Usa los nombres elegidos en los selectores, aunque el viaje todavía no esté guardado.
  - En el **detalle**: el botón va junto a la secuencia del recorrido.
  - Con `<a href target="_blank" rel="noopener noreferrer">`, no `window.open`. En el celular, el link abre la app de Google Maps.
  - El máximo de 9 paradas coincide con el límite de puntos intermedios de estos links. En el celular la app puede mostrar menos: dejalo anotado en el reporte, no hace falta resolverlo.
- `RutaViaje`: en el listado y las tarjetas, `Río Tercero → Córdoba · 2 paradas`. En el detalle, la secuencia completa en vertical.

### Tests
- Crear con paradas en orden.
- Reordenar (el `PUT` con el orden nuevo persiste bien).
- Paradas consecutivas iguales → 400.
- Una ubicación repetida no consecutiva → OK.
- No se pueden editar en `EN_VIAJE`.
- Borrar un viaje borra sus paradas (cascade).

---

## Fase 4 — WhatsApp y recordatorio

1. **Botón "Avisar por WhatsApp"** en el detalle de un viaje `PROGRAMADO` (y como acción secundaria en el toast de éxito al confirmar). Solo para gestores.
   - Abre `https://wa.me/<telefono>?text=<mensaje>`.
   - Normalizá el teléfono a formato internacional argentino: quitá espacios y guiones, quitá el 0 inicial y el 15, y anteponé `549`. Ponelo en `utils/whatsapp.js` con tests unitarios.
   - Si el chofer no tiene teléfono, el botón queda deshabilitado con el tooltip "El chofer no tiene teléfono cargado".
   - Mensaje:
     ```
     Hola <Nombre>! Te confirmo el viaje:
     📅 <día dd/mm> · <HH:mm> a <HH:mm>
     🚌 Interno <N> (<dominio>)
     📍 <Origen> → <Parada 1> → … → <Destino>
     👥 <cantidad> pasajeros   ← solo si está cargado
     Cliente: <cliente>
     ```
2. **Panel "Viajes a confirmar para mañana"** en el Dashboard de ADMINISTRADOR/ENCARGADO: viajes `A_CONFIRMAR` con `fechaInicio` en el día de mañana (hora de Córdoba; usá `utils/fechaCordoba.js`), cada uno con un botón "Confirmar" que abre el modal. Si no hay, muestra "Nada pendiente para mañana".

---

## Fuera de alcance (decidido)
- Volver de `PROGRAMADO` a `A_CONFIRMAR`: no por ahora. Si cambia el chofer, se edita el viaje programado.
- Odómetro por parada: no.
- Hora o pasajeros por parada: no.

## Al terminar cada fase
Escribí el reporte **en español** con:
1. Qué se cambió (archivos y por qué).
2. Migraciones creadas y qué hacen con los datos existentes.
3. Endpoints nuevos o modificados, con un ejemplo de request y response.
4. Tests agregados y resultado de la corrida.
5. Decisiones que tomaste por tu cuenta y dudas abiertas.
