# Plan de implementación — Ajustes al módulo de Mantenimiento

> **Base:** rama `feature/mantenimiento` (commit `a92100b` de Andy).
> **Rama de trabajo:** `feature/mantenimiento-ajustes`, creada **desde `feature/mantenimiento`**, con PR **hacia `feature/mantenimiento`** (no hacia `main`), para que Andy revise los cambios sobre su código.
> **Cómo se usa:** 6 fases en orden. Cada fase termina con los tests en verde y un commit. No avances sin terminar la anterior.
> **Decidido por:** Matías y Alan (23/10/2026).

---

## 0. Qué cambia, en una mirada

| Hoy (Andy) | Después |
|---|---|
| 2 pestañas: "Planes y Alertas de Service" y "Ficha Médica e Historial" | **3 pestañas: Service, Arreglos, Historial** |
| Caja "Plantillas oficiales de service preventivo" | Se elimina; el intervalo se muestra en cada tarjeta ("Service cada 20.000 km") |
| Un solo formulario para todo, con categorías en texto | **Service:** fecha, km y observación, con el checklist fijo. **Arreglos:** se elige el tipo de trabajo de una **tabla** |
| Categorías hardcodeadas (incluye aceite, filtros y alineación, que son parte del service) | Tabla **`tipos_arreglo`** sin superposición con el service |
| El historial obliga a elegir un vehículo | Historial de **toda la flota**, con buscador por vehículo, filtros, orden y paginado |
| Alerta a 1.000 km fijos | Alerta al **95 % del intervalo** de cada tipo |

---

## 1. Decisiones

| # | Decisión |
|---|---|
| D1 | Tres pestañas: **Service** (estado de cada vehículo y registrar service), **Arreglos** (solo el formulario para registrar), **Historial** (services y arreglos de toda la flota). |
| D2 | El service es **fijo**: cambio de aceite; filtros (gasoil, aceite y habitáculo/aire acondicionado); alineado y balanceado; revisión general del motor. Se muestra como checklist **informativo**: no se tilda, porque el service es siempre el paquete completo. |
| D3 | Al registrar un service se cargan **fecha, km y observación**. Costo y responsable **no** se muestran, pero las columnas `costo` y `taller_mecanico` **quedan en la base** (nullable), así sumarlos después es solo agregar el campo al formulario y a la API. |
| D3b | En **arreglos**, **quién hizo el trabajo se carga a mano** (texto libre, columna `taller_mecanico` que ya existe). Más adelante se puede parametrizar con un catálogo de mecánicos/talleres. El **costo** tampoco se muestra en arreglos por ahora (misma idea que D3: la columna queda en la base). |
| D4 | Los tipos de arreglo viven en la tabla **`tipos_arreglo`** (ver §2.1). Los arreglos **no** reinician el conteo del service ni generan alertas. |
| D5 | Service y arreglo se guardan en la **misma tabla** (`mantenimientos_realizados`): así el historial es una sola consulta. Lo que los distingue es `es_service_preventivo` y `tipo_arreglo_id`, con un CHECK en la base. |
| D6 | La alerta se calcula al **95 % del intervalo** del tipo (`porcentaje_aviso` en la plantilla). El km del próximo service y el estado **no se guardan, se calculan** en una sola función compartida. |
| D7 | Los vehículos **dados de baja** no aparecen en Service ni en los selectores, ni generan alertas. Su historial se conserva. |
| D8 | El Historial muestra toda la flota, con buscador por vehículo, filtros (tipo de registro, tipo de arreglo, tipo de vehículo, fechas), orden y paginado. |
| D9 | **Fuera de alcance:** galpones, ABM de tipos de arreglo (la tabla queda lista con `activo` y `orden`), costo y responsable en el service. |

### Sobre el nombre de la tabla
Pidieron una tabla "Arreglos". La llamo **`TipoArreglo` / `tipos_arreglo`** por dos motivos:
1. **Convención del repo:** los catálogos se llaman `TipoVehiculo`, `TipoDocumento`, `EstadoViaje`…
2. **Evita una confusión real:** una fila "Engrase" es un **tipo** de trabajo. "El engrase que se le hizo al coche 12 el martes" es un **registro** (vive en `mantenimientos_realizados`). Si la tabla se llamara `arreglos`, en el código "un arreglo" significaría dos cosas distintas.

Si igual prefieren `Arreglo`, el cambio es solo de nombres.

### ¿Hace falta una tabla intermedia vehículo ↔ arreglo?
**No, porque ya existe:** es `mantenimientos_realizados`. Una relación muchos a muchos con atributos propios (fecha, km, descripción…) **es** una tabla intermedia. La analogía es la inscripción a materias: entre `Alumno` y `Materia` está `Inscripcion`, que además guarda la fecha y la nota. Acá, entre `Vehiculo` y `TipoArreglo` está `MantenimientoRealizado`, que guarda cuándo, a qué km y qué se hizo. Agregar otra tabla duplicaría esa información.

---

## 2. Fase 1 — Modelo de datos y migración

### 2.1 Tabla nueva `TipoArreglo`

```prisma
// Catálogo de trabajos que NO son el service (D4): se registran en la pestaña
// Arreglos y nunca generan alertas. `activo` y `orden` quedan listos para un
// futuro ABM: un tipo que se deja de usar se desactiva (no se borra), así el
// historial que lo referencia no se rompe.
model TipoArreglo {
  id              Int                      @id @default(autoincrement()) @map("id_tipoarreglo")
  nombre          String                   @unique
  descripcion     String?
  // true = el registro exige una descripción (ej. "Otro": sin detalle no se
  // sabe qué se hizo). Parametrizado acá en vez de comparar con "Otro" en el
  // código.
  requiereDetalle Boolean                  @default(false) @map("requiere_detalle")
  orden           Int
  activo          Boolean                  @default(true)
  creadoEn        DateTime                 @default(now()) @map("creado_en")
  mantenimientos  MantenimientoRealizado[]

  @@map("tipos_arreglo")
}
```

Valores iniciales (en la migración, ver §2.3, y también en `seed.js` con `upsert`):

| orden | nombre | descripcion | requiereDetalle |
|---|---|---|---|
| 1 | Engrase | Engrase de rodamientos y articulaciones de las ruedas | no |
| 2 | Rotación de cubiertas | Rotación de neumáticos. Se recomienda cada 10.000 km, pero no genera alerta | no |
| 3 | Cambio de cubiertas | Reemplazo de uno o más neumáticos | no |
| 4 | Frenos | Pastillas, discos, cintas o líquido de frenos | no |
| 5 | Batería y electricidad | Batería, alternador, luces y sistema eléctrico | no |
| 6 | Chapa y pintura | Trabajos de chapista | no |
| 7 | Mecánica general | Reparaciones de motor, caja, tren delantero, etc. | no |
| 8 | Otro | Cualquier trabajo que no entra en los anteriores | **sí** |

### 2.2 Cambios en los modelos de Andy

**`PlantillaMantenimiento`:** agregar el porcentaje de aviso (D6).
```prisma
  // % del intervalo en el que se avisa: 95 → un colectivo (20.000 km) avisa a
  // los 19.000 km desde su último service; una Trafic (15.000), a los 14.250.
  porcentajeAviso Int @default(95) @map("porcentaje_aviso")
```

**`PlanMantenimiento`:** **eliminar** `kmProximoService` y `umbralAlertaKm`. El próximo service se calcula (`kmUltimoService + intervaloKm`). Guardarlo duplicado es un riesgo: si mañana cambia el intervalo de una plantilla, todos los planes quedarían desactualizados.

**`MantenimientoRealizado`:**
- **Eliminar** `categoria` (texto libre) y **agregar** `tipoArregloId Int? @map("tipo_arreglo_id")` con su relación a `TipoArreglo` (`onDelete: Restrict`).
- `descripcion` pasa a **opcional** (`String?`): el service no la usa (usa `observaciones`), y en los arreglos es obligatoria solo si el tipo `requiereDetalle`.
- Cambiar `onDelete: Cascade` por **`Restrict`** en la relación con `Vehiculo` (en `MantenimientoRealizado` y en `PlanMantenimiento`). Los vehículos se dan de baja de forma lógica y nunca se borran, y un `Cascade` borraría el historial si alguien borrara uno por error.
- Comentario arriba del modelo, como el de `Documento`:
  ```prisma
  // Un registro es un SERVICE (es_service_preventivo = true, tipo_arreglo_id
  // null) o un ARREGLO (false, con tipo_arreglo_id). Nunca las dos cosas: lo
  // garantiza el CHECK mantenimientos_service_o_arreglo de la migración.
  ```

### 2.3 Migración con datos (`npx prisma migrate dev --name arreglos_y_service --create-only`)

**Importante:** la migración de Andy (`20261023120000_add_mantenimiento`) **ya está aplicada en la base compartida**, así que **no se edita**. Todo va en esta migración nueva.

`--create-only` genera el SQL **sin aplicarlo**. Prisma no sabe migrar datos, así que hay que editar el SQL a mano para que haga esto, en este orden:
1. `CREATE TABLE tipos_arreglo` + `INSERT` de los 8 tipos de §2.1. Tienen que existir **antes** del paso 3, que los referencia. El seed también los carga con `upsert`, así que no se duplican.
2. `ALTER TABLE mantenimientos_realizados ADD COLUMN tipo_arreglo_id INTEGER` (nullable) + su FK.
3. **Convertir los datos existentes** de `categoria`:
   - `SERVICE_PREVENTIVO` (o `es_service_preventivo = true`) → queda como service, con `tipo_arreglo_id` NULL.
   - `CUBIERTAS` → Cambio de cubiertas · `FRENOS` → Frenos · `BATERIA` → Batería y electricidad · `MECANICA_GENERAL` → Mecánica general.
   - `CAMBIO_ACEITE`, `FILTROS`, `ALINEACION_BALANCEO` y `OTRO` → **Otro**. Si su `descripcion` está vacía, completarla con el nombre de la categoría vieja, para no perder qué era.
4. `ALTER COLUMN descripcion DROP NOT NULL` y `DROP COLUMN categoria`.
5. `ADD CONSTRAINT mantenimientos_service_o_arreglo CHECK ((es_service_preventivo AND tipo_arreglo_id IS NULL) OR (NOT es_service_preventivo AND tipo_arreglo_id IS NOT NULL))`.
6. `plantillas_mantenimiento`: `ADD COLUMN porcentaje_aviso INTEGER NOT NULL DEFAULT 95`.
7. `planes_mantenimiento`: `DROP COLUMN km_proximo_service`, `DROP COLUMN umbral_alerta_km`.
8. Las FK de vehículo: `DROP CONSTRAINT` + `ADD CONSTRAINT ... ON DELETE RESTRICT`.

**Antes de aplicar:**
- Confirmá contra qué base apunta `DATABASE_URL` y **avisale al grupo**. Es una base compartida: una sola persona aplica la migración, y los demás solo hacen `git pull` + `npx prisma generate`.
- Leé el SQL completo. Si `migrate dev` ofrece **resetear** la base, respondé que **no**.
- Aplicar: `npx prisma migrate dev` → `npx prisma db seed`.

### 2.4 Odómetro
En `lecturaOdometroService.js`, agregar `'MANTENIMIENTO'` a `ORIGENES_VALIDOS_CREAR`. El origen ya está sembrado; lo que faltaba era permitirlo, y por eso Andy creaba la lectura a mano, salteando el lock y la validación de "no retroceder".

### 2.5 Terminado
- [ ] `npx prisma validate` en verde.
- [ ] Migración aplicada; se verifica que los registros viejos quedaron convertidos.
- [ ] `npm test` en verde (los tests de mantenimiento se van a romper: se arreglan en la Fase 2).

---

## 3. Fase 2 — Backend

### 3.1 Cálculo compartido (`backend/src/utils/estadoService.js`)
Una **función pura** (sin Prisma) que usan la lista de Service, la advertencia de viajes y el Historial. Hoy ese cálculo está repetido en `serializarPlan` y en `evaluarAdvertenciaViaje`.

```js
// estado: 'AL_DIA' | 'PROXIMO' | 'VENCIDO'
function calcularEstadoService({ kilometraje, kmUltimoService, intervaloKm, porcentajeAviso }) {
  // kmDesdeService = kilometraje - kmUltimoService
  // kmAviso        = Math.floor(intervaloKm * porcentajeAviso / 100)
  // kmProximo      = kmUltimoService + intervaloKm
  // PROXIMO si kmDesdeService >= kmAviso; VENCIDO si kmDesdeService >= intervaloKm
  // return { estado, kmProximoService, kmAviso, kmRestantes, kmExcedidos, porcentajeConsumido }
}
```
`porcentajeConsumido = kmDesdeService / intervaloKm` es lo que se usa para ordenar por urgencia (§4.2).

### 3.2 Endpoints (`/api/mantenimientos`, perfiles: ADMINISTRADOR, ENCARGADO, PERSONAL_TALLER)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/tipos-arreglo` | Tipos **activos**, ordenados por `orden`. **Nuevo.** |
| GET | `/planes` | **Todos los vehículos no dados de baja**, cada uno con su plan y estado, o `estado: 'SIN_PLAN'` si no tiene. **Cambia:** hoy solo trae los que tienen plan. |
| POST | `/planes` | Asignar plan (se mantiene; ver bugs). |
| POST | `/services` | Registrar un service. **Nuevo**, reemplaza a `/realizados`. |
| POST | `/arreglos` | Registrar un arreglo. **Nuevo**, reemplaza a `/realizados`. |
| GET | `/historial` | Historial de toda la flota con filtros y paginado. **Nuevo**, reemplaza a `/vehiculos/:id/historial`. |
| GET | `/evaluar-viaje` | Se mantiene, pero usando `calcularEstadoService`. |
| ~~GET~~ | ~~`/plantillas`~~ | Se puede eliminar si nadie más la usa (la caja se va). |

**`POST /services`** — body `{ vehiculoId, fecha, kilometraje, observaciones? }`
- Si viene `tipoArregloId`, `categoria`, `costo` o `tallerMecanico` → 400. Así queda explícito que no se aceptan, en lugar de ignorarlos en silencio.
- Todo en **una transacción** (`prisma.$transaction`):
  1. Si el vehículo no tiene plan, se crea con la plantilla de su tipo. **Hoy se hace fuera de la transacción: es uno de los bugs.**
  2. Crear el registro con `esServicePreventivo: true` y `tipoArregloId: null`.
  3. `kmUltimoService = Math.max(plan.kmUltimoService, kilometraje)`. Así, cargar hoy un service viejo no "rejuvenece" el conteo.
  4. Si `kilometraje > vehiculo.kilometraje` → `lecturaOdometroService.crearLectura({ ..., origen: 'MANTENIMIENTO' }, { cliente: tx })`. Ese `{ cliente: tx }` es obligatorio: el comentario de `crearLectura` explica por qué, sin él, la transacción se cuelga.

**`POST /arreglos`** — body `{ vehiculoId, tipoArregloId, fecha, kilometraje, responsable?, descripcion?, repuestos?, observaciones? }`
- `responsable`: texto libre (trim, máximo 120 caracteres), **opcional**. Se guarda en la columna existente `taller_mecanico`. En la API se llama `responsable` porque es más claro que "taller mecánico" (puede ser un mecánico, un chapista o un taller).
- Si viene `costo` → 400 (D3b).
- `tipoArregloId` obligatorio, existente y **activo**.
- `descripcion` obligatoria si el tipo `requiereDetalle`.
- **No toca el plan.** Si el km supera el odómetro, crea la lectura igual que el service.

**Validaciones comunes** (juntando todos los errores en un solo `ValidacionError`, como el resto del repo):
| Campo | Regla |
|---|---|
| `vehiculoId` | existe y **no está dado de baja** (D7) |
| `fecha` | obligatoria, válida, **no futura**, interpretada en hora de Córdoba (reusar la lógica de `viajeService`/`fechaCordoba`; hoy hace `new Date(fecha)` sin zona) |
| `kilometraje` | entero ≥ 0 |
| `observaciones` / `descripcion` / `repuestos` | trim, máximo 500 caracteres |

**`GET /historial`** — query: `busqueda` (interno, dominio, marca o modelo), `vehiculoId`, `tipo` (`SERVICE` \| `ARREGLO`), `tipoArregloId`, `tipoVehiculoId`, `desde`, `hasta`, `orden` (`fecha_desc` por defecto, `fecha_asc`, `interno`, `km_desc`), `pagina` (desde 1), `porPagina` (default 30, máximo 100).
- Respuesta: `{ items: [...], total, pagina, porPagina }`.
- El filtrado y el paginado van **en el backend** (`where`, `skip`, `take`), porque el historial crece sin límite. La lista de Service, en cambio, son unos 24 vehículos: se filtra y ordena en el front.
- Cada item trae: `id`, `tipo` (`SERVICE`/`ARREGLO`), `tipoArreglo` (`{ id, nombre }` o null), `fecha`, `kilometraje`, `descripcion`, `observaciones`, `repuestos`, `responsable`, `vehiculo` (`{ id, numeroInterno, dominio, marca, modelo, tipoVehiculo }`), `usuario` (nombre).

### 3.3 Bugs a corregir
| # | Bug | Dónde | Arreglo |
|---|---|---|---|
| B1 | Marca y modelo salen vacíos | `mantenimientoService.js` (líneas 38 y 419) | `nombresMarcaModelo` devuelve `{ marca, modelo }`, no `{ marcaNombre, modeloNombre }` |
| B2 | Alerta a 1.000 km fijos | `serializarPlan` | Usar `calcularEstadoService` con el 95 % (D6) |
| B3 | Un service viejo hace retroceder el conteo | `registrarMantenimiento` | `Math.max` (§3.2) |
| B4 | El plan se crea fuera de la transacción | `registrarMantenimiento` | Moverlo adentro (§3.2) |
| B5 | La lectura de odómetro se crea a mano | `registrarMantenimiento` | `crearLectura` con `{ cliente: tx }` (§2.4) |
| B6 | Vehículos dados de baja en la lista y las alertas | `listarPlanesYAlertas` | Filtrar por estado ≠ `DADO_DE_BAJA` |
| B7 | Solo se listan vehículos con plan | `listarPlanesYAlertas` | Partir de `vehiculo.findMany` e incluir `SIN_PLAN` |
| B8 | 404 con `err.status` en vez del patrón del repo | `obtenerHistorialVehiculo` + controller | Clase `NoEncontradoError`, como `vehiculoService` |
| B9 | Fecha sin zona horaria y sin validar futuro | `registrarMantenimiento` | Ver validaciones comunes |

### 3.4 Tests (`backend/tests/mantenimiento.test.js` + `helpers/prismaFalsoConEstado.js`)
- [ ] `calcularEstadoService` (unit): colectivo con 18.999 km desde el service → AL_DIA; 19.000 → PROXIMO; 20.000 → VENCIDO. Trafic: aviso a 14.250. Utilitario: a 9.500.
- [ ] `GET /tipos-arreglo` devuelve solo los activos, en orden.
- [ ] `GET /planes` incluye los vehículos sin plan (`SIN_PLAN`) y excluye los dados de baja.
- [ ] Service: reinicia el conteo; un service con km menor al último **no** lo baja; con km mayor al odómetro crea una lectura `MANTENIMIENTO`; sin plan, lo crea; si algo falla, no queda un plan huérfano.
- [ ] Service con `tipoArregloId` o `costo` → 400.
- [ ] Arreglo: sin `tipoArregloId` → 400; tipo inactivo → 400; "Otro" sin descripción → 400; **no** modifica el plan.
- [ ] Arreglo: `responsable` se guarda (y es opcional); con `costo` → 400.
- [ ] Fecha futura → 400. Vehículo dado de baja → 400.
- [ ] Historial: filtra por tipo, tipo de arreglo, vehículo y fechas; pagina; ordena.
- [ ] Las respuestas traen marca y modelo (B1).
- [ ] CHOFER → 403 en todo · sin token → 401.

---

## 4. Fase 3 — Frontend: estructura y pestaña Service

Antes de escribir UI, que Claude Code lea `docs/design-system/README.md`, `tokens.json`, `componentes/Listado.md`, `Filtros.md`, `ControlSegmentado.md`, `FormularioVehiculo.md` y `EstadoBadge.md`. Hoy la página de Andy tiene ~300 líneas de CSS propio: la idea es **reusar `ListadoToolbar`, `ListadoCard` y el panel de Filtros** (`components/Listado.jsx`) para que se vea igual que Viajes, Flota y Documentación, y borrar el CSS que quede sin uso.

### 4.1 Estructura de `Mantenimiento.jsx`
- `ControlSegmentado` con **Service | Arreglos | Historial**. En Service, la cantidad de alertas como contador.
- La pestaña activa y los filtros principales van en la URL (`?tab=arreglos`, `?vehiculoId=`), igual que en Documentación. Así se puede compartir el link o volver atrás.
- **Eliminar** la sección `plantillas-fijas-bar`.
- Conviene separar cada pestaña en su componente (`components/mantenimiento/PestanaService.jsx`, `PestanaArreglos.jsx`, `PestanaHistorial.jsx`): hoy la página tiene 515 líneas.

### 4.2 Pestaña Service
- **Barra:** buscador (interno, dominio, marca o modelo), botón Filtros y acción "Registrar service".
- **Filtros:**
  - Estado: Todos / Vencido / Próximo / Al día / Sin plan. Reemplaza al checkbox "solo alertas".
  - Tipo de vehículo.
  - **Ordenar por:**
    - **Más urgente** (por defecto): `porcentajeConsumido` de mayor a menor, con los `SIN_PLAN` al final.
    - Número de interno.
    - Tipo de vehículo.
    - Km desde el último service.

  ¿Por qué % y no km restantes? A un colectivo con 900 km restantes le queda el 4,5 % de su intervalo, y a un utilitario con 900 km le queda el 9 %. Por km parecerían igual de urgentes, pero no lo son.
- El filtrado y el orden son **funciones puras** en `src/utils/mantenimiento.js`, con su `.test.js`.
- **Tarjeta (`ListadoCard`):**
  - Título "12 - AB123CD".
  - Badge: Vencido (error), Próximo (warning), Al día (success) o Sin plan (neutral).
  - Sub: marca y modelo.
  - Detalle: "Próximo service a los 340.000 km · faltan 800 km", o "pasado por 1.200 km".
  - Pie: "Colectivo · service cada 20.000 km" a la izquierda y "Último: 320.000 km" a la derecha.
  - Click: si tiene plan → modal **Registrar service** con el vehículo elegido; si es `SIN_PLAN` → modal **Asignar plan** (el de Andy).
- **Modal Registrar service** (nuevo, reemplaza a `ModalRegistrarMantenimiento` para este caso):
  - Vehículo (si no vino elegido).
  - Fecha (default: hoy).
  - **Km del odómetro.** Con el hint "Odómetro actual: 57.345 km".
  - Observación (opcional).
  - Bloque informativo **"Incluye:"** con las 4 tareas de D2. Van en una constante `TAREAS_SERVICE` en `src/constants/mantenimiento.js`: si algún día cambian, se cambian ahí.
  - Botones "Registrar service" / "Cancelar". Al guardar, `Toast` "Service registrado" y se recarga la lista.

## 5. Fase 4 — Pestaña Arreglos
**Solo el formulario, sin listado** (D1). Va como `Card .form-card`, igual que el formulario de vehículo:
- Vehículo: select con buscador; solo los no dados de baja.
- **Tipo de trabajo:** select con `GET /tipos-arreglo`. Debajo, como hint, la `descripcion` del tipo elegido (por ejemplo, para Rotación de cubiertas: "Se recomienda cada 10.000 km, pero no genera alerta").
- Fecha (default: hoy) · Km del odómetro.
- Descripción. Obligatoria (asterisco) solo si el tipo `requiereDetalle`.
- **Quién hizo el trabajo:** input de texto libre, opcional, con el hint "Mecánico, chapista o taller" (D3b).
- Repuestos · Observaciones.
- Sin campo de costo (D3b).
- Al guardar: `Toast` "Arreglo registrado", el formulario se limpia y aparece el link **"Ver en el historial"**, que lleva a `?tab=historial&vehiculoId=…`.
- Errores del 400 debajo de cada campo (`FormField`).

## 6. Fase 5 — Pestaña Historial
- **Barra:** buscador **por vehículo** (interno, dominio, marca o modelo) y Filtros.
- **Filtros:**
  - Tipo: Todos / Service / Arreglos.
  - Tipo de arreglo (visible solo si Tipo ≠ Service).
  - Tipo de vehículo.
  - Desde / Hasta.
  - **Ordenar por:** más reciente (por defecto), más antiguo, número de interno, km.
- Con `?vehiculoId=` (cuando se llega desde "Ver en el historial"), un encabezado con el vehículo y su estado de service, y un botón para quitar el filtro.
- **Tarjeta:**
  - Bloque de fecha (`FechaTile`).
  - Título "12 - AB123CD".
  - Badge "Service" (brand) o el nombre del tipo de arreglo (neutral).
  - Sub: la descripción o la observación.
  - Pie: "57.345 km" (y, en arreglos, "· Hizo: Taller Gómez" si se cargó) a la izquierda, y "Registró: Nombre Apellido" a la derecha.
- **Paginado:** 30 por página, con un botón "Ver más" al final (mismo estilo que "Ver N más" del Dashboard).
- Estado vacío: "No hay registros con esos filtros."
- **Cambiar el nombre** a "Historial" en todos lados (también en los textos de Andy que digan "Ficha médica").

## 7. Fase 6 — Limpieza y documentación
- Borrar `ModalRegistrarMantenimiento.jsx` (reemplazado por el modal de service y la pestaña Arreglos), las listas `CATEGORIAS_*` del front y del back, y el CSS sin uso.
- `ViajeForm`: la advertencia queda, pero con `formatearKm` en los números y **sin el emoji** (`Alert` ya trae su ícono).
- Documentación:
  - `docs/design-system/componentes/Mantenimiento.md` (nuevo): las 3 pestañas, las tarjetas, los filtros y los textos.
  - `docs/dominio.md` §2: las reglas finales (service fijo, 95 %, arreglos sin alerta, cómo se reinicia el conteo).
  - `CLAUDE.md`: quitar el `TODO` de mantenimiento.
  - Borrar `docs/plan-implementacion-SCRUM-15.md` y `docs/plan-implementacion-mantenimiento.md`, que quedaron obsoletos.
- `npm test` (back y front) y `npm run lint` en verde.

### Para más adelante (no entra ahora)
- **Parametrizar "quién hizo el trabajo"** con un catálogo de mecánicos/talleres (mismo patrón que clientes: buscás y, si no está, lo creás). Hoy es texto libre a propósito, para no complicar.
- **Costo** en services y arreglos: las columnas ya existen, falta el campo en el formulario y en la API.

---

## 8. Cómo trabajarlo en Claude Code
- `git checkout feature/mantenimiento && git pull && git checkout -b feature/mantenimiento-ajustes`.
- Abrí Claude Code en la raíz del repo (así lee el `CLAUDE.md`) y pedí **una fase por vez**: *"Leé `docs/plan-ajustes-mantenimiento.md` y hacé solo la Fase 1. Mostrame el SQL de la migración antes de aplicarla y explicame cada paso de la conversión de datos"*.
- Pedile que corra los tests al terminar cada fase.
- En las fases de UI, recordale el design system: *"Antes de escribir UI, leé `docs/design-system/README.md`, `tokens.json` y `componentes/Listado.md`, `Filtros.md` y `ControlSegmentado.md`. Reusá `ListadoToolbar` y `ListadoCard`; no escribas colores ni espaciados a mano"*.
- Revisá cada diff antes de commitear. Commits por fase, en Conventional Commits: `feat(mantenimiento): tabla tipos_arreglo y separación service/arreglo`.
- Al terminar, abrí el PR hacia `feature/mantenimiento` y pedile a Andy que lo revise.
