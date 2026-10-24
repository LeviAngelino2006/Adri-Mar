# Arreglos con varios tipos de trabajo — plan de implementación

> **Para agentes:** sub-skill requerido: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Objetivo:** que un arreglo pueda registrar varios tipos de trabajo a la vez (por ejemplo, Engrase + Cambio de cubiertas) en un solo registro.

**Arquitectura:** tabla intermedia `mantenimiento_tipos_arreglo` (registro ↔ tipo) que reemplaza la columna `mantenimientos_realizados.tipo_arreglo_id`. El backend recibe `tiposArregloIds: number[]` y devuelve `tiposArreglo: [{ id, nombre }]`. En el formulario, los tipos se eligen con una grilla de checkboxes (componente nuevo `GrupoCasillas`).

**Stack:** Express 5 + Prisma 6 (PostgreSQL en Neon), React 19 + Vite, `node --test`.

**Spec:** las decisiones de abajo (acordadas en la sesión del 24 oct 2026). Se completan con `docs/dominio.md` §2.3 y `docs/design-system/componentes/Mantenimiento.md` § Arreglos.

## Decisiones

- Un arreglo tiene **1 o más** tipos del catálogo `tipos_arreglo`. Un service no tiene ninguno.
- Se guarda **un solo registro**: fecha, km, descripción, responsable, repuestos y observaciones son comunes a todos los tipos marcados. No se crea un registro por tipo.
- "Otro" **se combina libremente** con los demás. Si está marcado (en general: si algún tipo marcado tiene `requiereDetalle`), la descripción es obligatoria.
- UI: una **grilla de checkboxes** con los tipos activos y la descripción de cada uno debajo, sin `<select>`.
- Historial: el badge muestra los nombres unidos con " + ", en el orden del catálogo ("Engrase + Cambio de cubiertas"). El filtro "Tipo de arreglo" trae los arreglos que **incluyen** ese tipo.
- El parámetro de filtro sigue llamándose `tipoArregloId`. El body de `POST /mantenimientos/arreglos` pasa de `tipoArregloId` a `tiposArregloIds`.

## Restricciones globales

- CommonJS en el backend y ESM en el frontend. Nombres en camelCase y columnas en snake_case con `@map`.
- Los errores de validación se lanzan como `ValidacionError` con `{ campo: mensaje }`. El campo nuevo es `tiposArregloIds`.
- Textos en español rioplatense con voseo. Mensajes exactos:
  - Sin tipos: `Elegí al menos un tipo de trabajo`
  - Id inválido, inexistente o inactivo: `El tipo de trabajo no es válido`
  - Detalle obligatorio: `` Contá qué trabajo se hizo (obligatorio para "${nombre}") `` (nombre del primer tipo marcado, en orden de catálogo, que tenga `requiereDetalle`)
  - `tipoArregloId` en el body de un arreglo: `Ahora se mandan varios tipos en "tiposArregloIds"`
  - `tiposArregloIds` en el body de un service: `El service no lleva tipo de arreglo: para otro trabajo, registrá un arreglo`
- UI con los tokens de `docs/design-system/tokens.json`, sin colores ni espaciados a mano. Antes de escribir CSS, leer `docs/design-system/README.md`.
- **No conectarse a la base.** La migración se escribe a mano. Se verifica con `npx prisma validate` y `npx prisma generate`, que no se conectan. No correr `prisma migrate dev`/`deploy` ni `db seed`: eso es la sección "Aplicar la migración", que decide el usuario.
- Rama: `feature/<CLAVE-JIRA>-arreglos-varios-tipos` desde `origin/develop` (pedirle la clave al usuario; si no hay, `feature/arreglos-varios-tipos`).

## Foco de revisión

Las primeras cuatro líneas tienen su test en la Tarea 1 y la quinta en la Tarea 3. La migración solo se puede verificar contra una base real (ver "Aplicar la migración").

1. `tiposArregloIds` que no es un array (`3`, `"3"`, `null`, `{}`) → 400 con `errores.tiposArregloIds`, nunca 500.
2. Ids repetidos (`[1, 1]`) → se guarda una sola vez (la PK compuesta reventaría con 500).
3. Un id válido junto con uno inactivo o inexistente (`[1, 9]`) → 400 y no se guarda nada.
4. Un cliente viejo que manda `tipoArregloId: 3` → 400 con el mensaje explícito, sin ignorarlo.
5. Marcar "Otro" y desmarcarlo → la descripción deja de ser obligatoria (asterisco y validación).

---

### Tarea 1: Backend — modelo, migración, servicio y documentación de dominio

**Archivos:**
- Modificar: `backend/prisma/schema.prisma` (modelos `TipoArreglo` ~l.580 y `MantenimientoRealizado` ~l.604)
- Crear: `backend/prisma/migrations/20261024120000_arreglos_varios_tipos/migration.sql`
- Modificar: `backend/src/services/mantenimientoService.js` (`CAMPOS_AJENOS_*` ~l.34-46, `INCLUDE_REGISTRO` ~l.69, `serializarRegistro` ~l.138, `registrarArreglo` ~l.424, `armarFiltroHistorial` ~l.514)
- Modificar: `backend/tests/helpers/prismaFalsoConEstado.js` (estado ~l.66, `sembrar` ~l.188, `coincideRegistro` ~l.485, `armarRegistro` ~l.500, `create` ~l.512, `modeloTipoArreglo` ~l.546, copia/restauración de la transacción ~l.959 y ~l.972)
- Modificar: `backend/tests/mantenimiento.test.js` (`sembrarRegistro` ~l.69, `describe('POST /arreglos')`, `describe('GET /historial')`, test del service ~l.229-235 y ~l.293)
- Modificar: `docs/dominio.md` §2.3 y `CLAUDE.md` (línea de arreglos en "Reglas de negocio")

**Interfaces:**
- Produce (API):
  - `POST /mantenimientos/arreglos` con body `{ vehiculoId, tiposArregloIds: number[], fecha, kilometraje, descripcion?, responsable?, repuestos?, observaciones? }` → `201 { registro }`.
  - Todo registro serializado (POST de service y de arreglo, `GET /historial`) lleva `tiposArreglo: Array<{ id: number, nombre: string }>`, ordenado por `orden`. En un service es `[]`. **Se elimina** la propiedad `tipoArreglo`.
  - `GET /mantenimientos/historial?tipoArregloId=N` trae los arreglos que incluyen el tipo N.
- Produce (Prisma):
  - Modelo `MantenimientoTipoArreglo` con `mantenimientoId Int @map("mantenimiento_id")` y `tipoArregloId Int @map("tipo_arreglo_id")`, `@@id([mantenimientoId, tipoArregloId])`, `@@index([tipoArregloId])` y `@@map("mantenimiento_tipos_arreglo")`.
  - Relaciones: hacia `MantenimientoRealizado` con `onDelete: Cascade` y hacia `TipoArreglo` con `onDelete: Restrict`.
  - `MantenimientoRealizado.tiposArreglo MantenimientoTipoArreglo[]` (se borran `tipoArregloId` y `tipoArreglo`).
  - `TipoArreglo.mantenimientos MantenimientoTipoArreglo[]`.

- [ ] **Paso 1: escribir los tests que fallan**

En `mantenimiento.test.js`:
- `sembrarRegistro({ tiposArregloIds = [], ... })`: `esServicePreventivo: tiposArregloIds.length === 0` y empuja una fila `{ mantenimientoId, tipoArregloId }` por id a `db.mantenimientosTiposArreglo`. Actualizar los usos del historial (`tipoArregloId: 3` → `tiposArregloIds: [3]`) y sembrar además un arreglo con `tiposArregloIds: [1, 3]`.
- En `POST /arreglos`, reemplazar `tipoArregloId: N` por `tiposArregloIds: [N]` en todos los tests y cambiar las aserciones de `errores.tipoArregloId` por `errores.tiposArregloIds`. Agregar:

```js
test('guarda varios tipos en un solo registro, en el orden del catálogo', async () => {
  const { status, body } = await arreglo({ tiposArregloIds: [3, 1] });
  assert.equal(status, 201);
  assert.deepEqual(body.registro.tiposArreglo, [{ id: 1, nombre: 'Engrase' }, { id: 3, nombre: 'Cambio de cubiertas' }]);
  assert.equal(db.mantenimientosRealizados.length, 1);
});

test('ids repetidos se guardan una sola vez', async () => {
  const { status, body } = await arreglo({ tiposArregloIds: [1, 1] });
  assert.equal(status, 201);
  assert.deepEqual(body.registro.tiposArreglo.map((t) => t.id), [1]);
});

test('lista vacía o que no es un array → 400', async () => {
  for (const tiposArregloIds of [[], 3, '3', null, {}]) {
    const { status, body } = await arreglo({ tiposArregloIds });
    assert.equal(status, 400, JSON.stringify(tiposArregloIds));
    assert.ok(body.errores.tiposArregloIds);
  }
});

test('un tipo válido junto con uno inactivo o inexistente → 400 y no guarda nada', async () => {
  for (const tiposArregloIds of [[1, 9], [1, 77], [1, 'x']]) {
    const { status, body } = await arreglo({ tiposArregloIds });
    assert.equal(status, 400);
    assert.equal(body.errores.tiposArregloIds, 'El tipo de trabajo no es válido');
  }
  assert.equal(db.mantenimientosRealizados.length, 0);
});

test('"Otro" combinado con otro tipo también exige descripción', async () => {
  const sin = await arreglo({ tiposArregloIds: [1, 8] });
  assert.match(sin.body.errores.descripcion, /"Otro"/);
  const con = await arreglo({ tiposArregloIds: [1, 8], descripcion: 'Cambio de espejo' });
  assert.equal(con.status, 201);
});

test('rechaza tipoArregloId (formato viejo)', async () => {
  const { status, body } = await arreglo({ tipoArregloId: 3 });
  assert.equal(status, 400);
  assert.equal(body.errores.tipoArregloId, 'Ahora se mandan varios tipos en "tiposArregloIds"');
});
```

- En `POST /services`: `body.registro.tipoArreglo` pasa a `assert.deepEqual(body.registro.tiposArreglo, [])`. El test de campos ajenos (~l.293) también manda `tiposArregloIds: [3]` y verifica `body.errores.tiposArregloIds`.
- En `GET /historial`, el filtro `?tipoArregloId=1` y `?tipoArregloId=3` devuelven el arreglo `[1, 3]` en los dos casos. Las aserciones sobre `items[0].tipoArreglo.nombre` pasan a `items[0].tiposArreglo.map((t) => t.nombre)`.

- [ ] **Paso 2: correr los tests para verificar que fallan**

Correr: `cd backend && node --test tests/mantenimiento.test.js`
Esperado: FALLA (`tiposArreglo` undefined, errores en `tipoArregloId` en vez de `tiposArregloIds`).

- [ ] **Paso 3: adaptar el Prisma falso**

En `prismaFalsoConEstado.js`:
- Estado nuevo `mantenimientosTiposArreglo: []`. Se limpia en `sembrar` y entra en la copia y la restauración de `$transaction`, igual que `mantenimientosRealizados`.
- `create` acepta `data.tiposArreglo?.create: Array<{ tipoArregloId }>` y empuja una fila por elemento, con el id del registro nuevo.
  - Si dos filas tienen el mismo `tipoArregloId`, lanza `Unique constraint failed` (PK compuesta).
  - Reemplazar la emulación del CHECK por esta regla: lanza si `esServicePreventivo` viene con tipos, o si no lo es y viene sin tipos.
- `armarRegistro` arma `tiposArreglo: [{ mantenimientoId, tipoArregloId, tipoArreglo }]` ordenado por `tipoArreglo.orden`.
- `coincideRegistro` saca `tipoArregloId` de la lista de igualdad y soporta `tiposArreglo: { some: { tipoArregloId } }`.
- `modeloTipoArreglo.findMany` además soporta `{ where: { id: { in: ids } } }` (todos, activos o no). La forma `activo + orderBy orden` se mantiene.

- [ ] **Paso 4: implementar en el servicio**

- `INCLUDE_REGISTRO.tiposArreglo = { include: { tipoArreglo: true }, orderBy: { tipoArreglo: { orden: 'asc' } } }` (en lugar de `tipoArreglo: true`).
- `serializarRegistro`: `tiposArreglo: (registro.tiposArreglo ?? []).map(({ tipoArreglo: t }) => ({ id: t.id, nombre: t.nombre }))`.
- `CAMPOS_AJENOS_ARREGLO.tipoArregloId` y `CAMPOS_AJENOS_SERVICE.tiposArregloIds` con los mensajes de "Restricciones globales".
- Nueva `async function validarTiposArreglo(valor, errores) → TipoArreglo[]`:
  - No es array o está vacío → `errores.tiposArregloIds = 'Elegí al menos un tipo de trabajo'`.
  - Algún elemento falla `parsearId` → `'El tipo de trabajo no es válido'`.
  - Si no, saca los duplicados, busca con `prisma.tipoArreglo.findMany({ where: { id: { in } } })` y, si falta alguno o hay uno inactivo, devuelve el mismo mensaje.
  - Devuelve los tipos ordenados por `orden` (`[]` si hubo error).
- `registrarArreglo` usa `validarTiposArreglo(datos.tiposArregloIds, errores)`. El detalle se exige con `tipos.find((t) => t.requiereDetalle)`. Crea con `tiposArreglo: { create: tipos.map((t) => ({ tipoArregloId: t.id })) }`, sin `tipoArregloId`.
- `registrarService`: borrar `tipoArregloId: null` del `create`.
- `armarFiltroHistorial`: `where.tiposArreglo = { some: { tipoArregloId: id } }`.
- Actualizar el comentario del encabezado del archivo (~l.11-13): la regla service/arreglo ahora la valida el servicio, no el CHECK.

- [ ] **Paso 5: escribir el schema y la migración**

`schema.prisma` según las Interfaces. `migration.sql` escrita a mano, en este orden y con comentarios del estilo de `20261023180000_arreglos_y_service`:
1. `CREATE TABLE "mantenimiento_tipos_arreglo"` con la PK compuesta, el índice en `tipo_arreglo_id` y las dos FK (`ON DELETE CASCADE` / `ON DELETE RESTRICT`, `ON UPDATE CASCADE`).
2. `INSERT INTO "mantenimiento_tipos_arreglo" ("mantenimiento_id", "tipo_arreglo_id") SELECT "id", "tipo_arreglo_id" FROM "mantenimientos_realizados" WHERE "tipo_arreglo_id" IS NOT NULL;`
3. `DROP CONSTRAINT "mantenimientos_service_o_arreglo"`, luego `DROP CONSTRAINT "mantenimientos_realizados_tipo_arreglo_id_fkey"` y por último `DROP COLUMN "tipo_arreglo_id"`.

- [ ] **Paso 6: verificar el schema sin conectarse a la base**

Correr: `cd backend && npx prisma validate && npx prisma generate`
Esperado: `The schema at prisma/schema.prisma is valid` y `Generated Prisma Client`.

- [ ] **Paso 7: correr todos los tests del backend**

Correr: `cd backend && npm test`
Esperado: todos PASAN.

- [ ] **Paso 8: actualizar la documentación de dominio**

- `docs/dominio.md` §2.3: un arreglo tiene uno o más tipos del catálogo y "Otro" (con cualquier combinación) exige descripción. La tabla intermedia es `mantenimiento_tipos_arreglo`. Cambiar la línea del CHECK por "un registro es un service (sin tipos) o un arreglo (con al menos un tipo); lo valida `mantenimientoService`". El filtro del historial trae los arreglos que incluyen el tipo.
- `CLAUDE.md`, misma regla en una línea: "de uno o más tipos de la tabla `tipos_arreglo` (vía `mantenimiento_tipos_arreglo`)". Se saca la mención al CHECK.

- [ ] **Paso 9: commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20261024120000_arreglos_varios_tipos backend/src/services/mantenimientoService.js backend/tests docs/dominio.md CLAUDE.md
git commit -m "feat(mantenimiento): arreglos con varios tipos de trabajo (backend)"
```

---

### Tarea 2: Frontend — componente `GrupoCasillas`

**Archivos:**
- Crear: `frontend/src/components/ui/GrupoCasillas.jsx`, `frontend/src/components/ui/GrupoCasillas.css`
- Crear: `frontend/src/components/ui/grupoCasillas.render.test.mjs`
- Crear: `docs/design-system/componentes/GrupoCasillas.md`

**Interfaces:**
- Produce: `GrupoCasillas({ id, legend, opciones, valor, onChange, required = false, error, disabled = false })`, export default.
  - `opciones`: `Array<{ id: number, etiqueta: string, detalle?: string }>`.
  - `valor`: `number[]`, los ids marcados.
  - `onChange(ids: number[])` recibe la lista nueva **en el orden de `opciones`**.
  - `error`: texto opcional.

- [ ] **Paso 1: escribir el test de render que falla**

Seguir el patrón SSR de `mantenimiento.render.test.mjs` (Vite `ssrLoadModule` + `renderToStaticMarkup`) para el marcado. Para el click, seguir el de `selectorBuscarOCrear.render.test.mjs` (jsdom + `createRoot` + `act`). Tests:
- `'un fieldset con legend, una casilla por opción y el detalle debajo'`: el HTML tiene `<fieldset`, `<legend` con el texto de `legend`, un `type="checkbox"` por opción, `checked` solo en las de `valor` y el texto de `detalle`.
- `'con required pone el asterisco; con error, aria-invalid en la primera casilla y el mensaje con role="alert"'`: se busca `aria-invalid="true"` (así `useFocoEnPrimerError` la encuentra) y el `fieldset` lleva `aria-describedby="<id>-error"`.
- `'marcar y desmarcar llama a onChange en el orden de opciones'`: con opciones `[1, 3, 8]` y `valor = [8]`, al hacer click en 1 llega `[1, 8]`; con `valor = [1, 8]`, al hacer click en 8 llega `[1]`.
- `'disabled deshabilita todas las casillas'`.

- [ ] **Paso 2: correr el test para verificar que falla**

Correr: `cd frontend && node --test src/components/ui/grupoCasillas.render.test.mjs`
Esperado: FALLA (no existe `GrupoCasillas.jsx`).

- [ ] **Paso 3: implementar el componente y su CSS**

- `<fieldset id={id}>` con `<legend>` (mismo estilo que el label de `FormField`, asterisco con `form-field-required`).
- Cada opción es un `<label>` que envuelve `<input type="checkbox">`, la etiqueta y el detalle (`form-field-hint`). El id de cada casilla es `${id}-${opcion.id}`.
- El error se muestra igual que en `FormField` (`form-field-error`, `role="alert"`).
- La grilla tiene 1 columna en el celular y 2 desde el breakpoint de tablet del design system.
- Cada opción tiene área táctil de al menos 44px, fondo `color-surface` y borde `color-border`. Marcada, pasa a `brand-50` / `brand-200`, como el chip de `SelectorMultiple`. El foco se ve con el anillo de foco del design system.
- Clases con prefijo `grupo-casillas-`.

- [ ] **Paso 4: correr el test para verificar que pasa**

Correr: `cd frontend && node --test src/components/ui/grupoCasillas.render.test.mjs`
Esperado: PASA.

- [ ] **Paso 5: escribir la guía del componente**

`docs/design-system/componentes/GrupoCasillas.md`, con las mismas secciones que `SelectorMultiple.md` ("Lo que provee quien lo usa" y "Reglas").
- Cuándo usarlo: listas cortas y fijas (hasta ~10 opciones) donde conviene ver todo de una vez. Para listas largas o que se filtran, `SelectorMultiple`.
- No va dentro de `FormField`: trae su propio `legend` y su error.

- [ ] **Paso 6: commit**

```bash
git add frontend/src/components/ui/GrupoCasillas.* frontend/src/components/ui/grupoCasillas.render.test.mjs docs/design-system/componentes/GrupoCasillas.md
git commit -m "feat(ui): componente GrupoCasillas"
```

---

### Tarea 3: Frontend — formulario de arreglos e historial

**Archivos:**
- Modificar: `frontend/src/utils/mantenimiento.js` (`validarRegistroMantenimiento` ~l.109-131, función nueva `textoTiposArreglo`)
- Modificar: `frontend/src/utils/mantenimiento.test.js` (~l.168-182)
- Modificar: `frontend/src/components/mantenimiento/PestanaArreglos.jsx`
- Modificar: `frontend/src/components/mantenimiento/PestanaHistorial.jsx` (~l.40)
- Modificar: `frontend/src/components/mantenimiento/mantenimiento.render.test.mjs` (~l.110-130 y ~l.158-180)
- Modificar: `docs/design-system/componentes/Mantenimiento.md` (§ Arreglos l.37, § Historial l.51)

**Interfaces:**
- Consume: la API de la Tarea 1 (`tiposArregloIds` en el body, `tiposArreglo[]` en la respuesta) y `GrupoCasillas` de la Tarea 2.
- Produce:
  - `validarRegistroMantenimiento(form, { hoy, esArreglo = false, tiposArreglo = [], maxTexto, maxResponsable })`. `tiposArreglo` son los **objetos** de los tipos marcados (`{ id, nombre, requiereDetalle }`) y el error va en `tiposArregloIds`.
  - `textoTiposArreglo(registro) → string`: nombres unidos con `' + '`, o `'Arreglo'` si la lista está vacía.

- [ ] **Paso 1: escribir los tests que fallan**

En `mantenimiento.test.js`, el test de arreglo pasa a usar `tiposArregloIds: []`, verifica `sinTipo.tiposArregloIds === 'Elegí al menos un tipo de trabajo'` y agrega:

```js
test('arreglo: "Otro" junto a otro tipo exige detalle; sin "Otro" no', () => {
  const base = { ...valido, descripcion: '', responsable: '', repuestos: '' };
  const engrase = { id: 1, nombre: 'Engrase', requiereDetalle: false };
  const otro = { id: 8, nombre: 'Otro', requiereDetalle: true };
  const conOtro = validarRegistroMantenimiento({ ...base, tiposArregloIds: [1, 8] }, { ...opciones, esArreglo: true, tiposArreglo: [engrase, otro] });
  assert.deepEqual(Object.keys(conOtro), ['descripcion']);
  const sinOtro = validarRegistroMantenimiento({ ...base, tiposArregloIds: [1] }, { ...opciones, esArreglo: true, tiposArreglo: [engrase] });
  assert.deepEqual(sinOtro, {});
});

test('textoTiposArreglo une los nombres con " + "', () => {
  assert.equal(textoTiposArreglo({ tiposArreglo: [{ id: 1, nombre: 'Engrase' }, { id: 3, nombre: 'Cambio de cubiertas' }] }), 'Engrase + Cambio de cubiertas');
  assert.equal(textoTiposArreglo({ tiposArreglo: [] }), 'Arreglo');
});
```

En `mantenimiento.render.test.mjs`:
- La tarjeta del historial usa `tiposArreglo: [{ id: 1, nombre: 'Engrase' }, { id: 4, nombre: 'Frenos' }]` y verifica `Engrase + Frenos`. La del service usa `tiposArreglo: []`.
- `PestanaArreglos` verifica `<fieldset` y la legend `Tipos de trabajo`. Como el SSR no resuelve la carga, el doble de `listarTiposArreglo` deja la lista vacía, así que no se verifican las casillas.

- [ ] **Paso 2: correr los tests para verificar que fallan**

Correr: `cd frontend && node --test src/utils/mantenimiento.test.js src/components/mantenimiento/mantenimiento.render.test.mjs`
Esperado: FALLA.

- [ ] **Paso 3: implementar**

- `validarRegistroMantenimiento` y `textoTiposArreglo` según las Interfaces. El detalle se exige con `tiposArreglo.find((t) => t.requiereDetalle)`.
- `PestanaArreglos.jsx`:
  - En `formVacio`, `tiposArregloIds: []` en lugar de `tipoArregloId`.
  - `tiposElegidos = tipos.filter((t) => form.tiposArregloIds.includes(t.id))` reemplaza a `tipoArreglo`.
  - El `FormField` + `<select>` de tipo se cambia por `<div className="form-field-ancho"><GrupoCasillas id="arreglo-tipos" legend="Tipos de trabajo" required … /></div>` con `opciones = tipos.map((t) => ({ id: t.id, etiqueta: t.nombre, detalle: t.descripcion || undefined }))` y `error={errores.tiposArregloIds || errorTipos}`. Mientras carga se pasa `disabled`.
  - El asterisco de Descripción se activa con `tiposElegidos.some((t) => t.requiereDetalle)`.
  - El body manda `tiposArregloIds: form.tiposArregloIds`.
  - El mapeo de errores del backend ya filtra por `Object.keys(formVacio())`, así que toma `tiposArregloIds` sin cambios.
  - Revisar en la grilla `form-grid` que Fecha y Km sigan de a pares (puede hacer falta mover o sacar el `form-hueco`).
- `PestanaHistorial.jsx` l.40: `{textoTiposArreglo(registro)}`.
- `Mantenimiento.md` § Arreglos:
  - "Tipos de trabajo" es un `GrupoCasillas` con los tipos activos y su descripción debajo. Se puede marcar más de uno.
  - Descripción lleva asterisco si algún tipo marcado lo exige ("Otro").
- `Mantenimiento.md` § Historial: el badge muestra los nombres unidos con " + ".

- [ ] **Paso 4: correr tests, lint y build**

Correr: `cd frontend && npm test && npm run lint && npm run build`
Esperado: tests PASAN, oxlint sin errores, build OK.

- [ ] **Paso 5: probarlo en la app**

- Con el backend local, esto necesita la migración aplicada en la base del `.env`. Si todavía no se aplicó, saltear este paso y avisarle al usuario.
- Registrar Engrase + Cambio de cubiertas.
- Marcar "Otro", ver el asterisco y desmarcarlo.
- Verificar el badge en Historial y el filtro por cada tipo.
- Revisar en un ancho de 375px que la grilla quede en 1 columna.

- [ ] **Paso 6: commit**

```bash
git add frontend/src/utils frontend/src/components/mantenimiento docs/design-system/componentes/Mantenimiento.md
git commit -m "feat(mantenimiento): elegir varios tipos de trabajo en un arreglo"
```

---

## Aplicar la migración (lo decide el usuario, no es parte de la implementación)

La migración **borra la columna `tipo_arreglo_id`**. Si se aplica en la base que usa el grupo antes de mergear, el código de `develop`/`main` deja de poder registrar arreglos y de mostrar el historial. Opciones:

1. **Rama de Neon para desarrollo** (recomendada): crear una branch de la base en la consola de Neon, apuntar `DATABASE_URL`/`DIRECT_URL` del `.env` local a ella y correr `npx prisma migrate deploy`.
2. **Aplicarla en la base compartida al mergear el PR** a `develop`, avisando al grupo (`npx prisma migrate deploy`).

Después de aplicarla, verificar que no se perdió ningún arreglo. El resultado tiene que ser `0`:

```sql
SELECT count(*) FROM mantenimientos_realizados m
WHERE NOT m.es_service_preventivo
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_tipos_arreglo t WHERE t.mantenimiento_id = m.id);
```
