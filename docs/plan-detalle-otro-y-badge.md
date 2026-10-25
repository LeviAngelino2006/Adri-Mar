# "Otro" con su propio detalle y badge del historial — plan de implementación

> **Para agentes:** sub-skill requerido: superpowers:executing-plans (o superpowers:subagent-driven-development) para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Objetivo:** que "Otro" diga qué se hizo (en el badge y en "Trabajos") en lugar de "Otro", y que el badge del historial no se estire con muchos tipos.

**Arquitectura:** columna nueva `detalle` en `mantenimiento_tipos_arreglo`. Al marcar un tipo con `requiereDetalle` ("Otro"), el formulario pide "¿Qué trabajo?" debajo de esa casilla. El texto viaja en `detallesTipos` y se muestra en lugar del nombre del tipo. La Descripción del arreglo deja de ser obligatoria.

**Stack:** Express 5 + Prisma 6 (PostgreSQL en Neon), React 19 + Vite, `node --test`.

**Spec:** las decisiones de abajo (sesión del 24 oct 2026). Continúa a `docs/plan-arreglos-varios-tipos.md` (ya implementado y con la migración aplicada).

## Decisiones

- **"Otro":**
  - Al marcarlo aparece, debajo de su casilla, un campo obligatorio **"¿Qué trabajo?"** de hasta **60** caracteres.
  - Se guarda en `mantenimiento_tipos_arreglo.detalle`, solo en la fila de ese tipo.
  - En el historial, el badge y "Trabajos" muestran el detalle en lugar del nombre: "Engrase + Cambio de espejo".
- **`requiereDetalle` cambia de significado:** antes hacía obligatoria la Descripción del arreglo; ahora exige el detalle propio del tipo. La **Descripción queda opcional** siempre.
- Los arreglos con "Otro" ya cargados no tienen detalle: siguen mostrando "Otro", con su descripción como línea principal.
- **Badge del historial:**
  - 1 tipo: "Frenos".
  - 2 tipos: "Engrase + Frenos".
  - 3 o más: "N trabajos" (por ejemplo, "6 trabajos").
- **Línea "Trabajos: …"** en el detalle de la tarjeta: con 2 o más tipos (con 1 repetiría el badge), separados por coma y en el orden del catálogo.
- El filtro del historial por "Otro" no cambia.

## Restricciones globales

- Mismas convenciones que el plan anterior: CommonJS/ESM, camelCase con `@map`, `ValidacionError` con `{ campo: mensaje }`, voseo y tokens del design system.
- API: `POST /mantenimientos/arreglos` suma `detallesTipos?: { [tipoArregloId]: string }`. `tiposArregloIds` no cambia. Cada elemento de `tiposArreglo` en las respuestas pasa a `{ id, nombre, detalle }`, con `detalle: string | null`.
- Mensajes exactos (en `errores.detallesTipos`):
  - Falta el detalle: `` Contá qué trabajo se hizo (obligatorio para "${nombre}") ``
  - Detalle muy largo: `Hasta 60 caracteres`
  - Detalle de un tipo que no lo lleva o que no está marcado: `` "${nombre}" no lleva detalle `` (si el id no es un tipo marcado: `El detalle es de un tipo que no está marcado`)
  - `detallesTipos` que no es un objeto: `Los detalles de los tipos no son válidos`
- `MAX_DETALLE_TIPO = 60`, en `backend/src/services/mantenimientoService.js` y en `frontend/src/constants/mantenimiento.js`.
- **No conectarse a la base.** Hay que escribir una migración nueva (la anterior ya está aplicada, no se edita) y no correrla. Se verifica con `npx prisma validate`.
- Sin commits: el usuario commitea. Rama actual `feature/mejora-ui`.

## Foco de revisión

1. Marcar "Otro", escribir el detalle y desmarcarlo → el detalle no se manda ni queda un error colgado (Tarea 3).
2. `detallesTipos: { "8": "   " }` con "Otro" marcado → 400 "Contá qué trabajo…" (no se guarda vacío) (Tarea 1).
3. `detallesTipos` con un id de un tipo sin `requiereDetalle` (Engrase) → 400 explícito, no se ignora (Tarea 1).
4. Un arreglo viejo con "Otro" sin detalle → el badge dice "Otro" (Tarea 3).
5. Un detalle de 60 caracteres en el badge de 2 tipos → no rompe la tarjeta: el badge tiene tope de ancho y corta con "…" (Tarea 3).

---

### Tarea 1: Backend — columna `detalle`, validación y serialización

**Archivos:**
- Modificar: `backend/prisma/schema.prisma` (modelo `MantenimientoTipoArreglo` y comentario de `TipoArreglo.requiereDetalle`)
- Crear: `backend/prisma/migrations/20261025120000_detalle_tipo_arreglo/migration.sql`
- Modificar: `backend/src/services/mantenimientoService.js` (`serializarRegistro`, `registrarArreglo`, `validarTiposArreglo` o una función nueva `validarDetallesTipos`)
- Modificar: `backend/tests/helpers/prismaFalsoConEstado.js` (el `create` guarda `detalle` en la fila intermedia)
- Modificar: `backend/tests/mantenimiento.test.js`
- Modificar: `backend/prisma/seed.js` (solo el comentario, si lo hay) y `docs/dominio.md` §2.3

**Interfaces:**
- Produce (Prisma): `MantenimientoTipoArreglo.detalle String?`. Nested create: `{ tipoArregloId, detalle }`.
- Produce (API): `tiposArreglo: [{ id, nombre, detalle }]`. El body acepta `detallesTipos`.
- Produce (servicio): `async function validarDetallesTipos(valor, tipos, errores) → Map<tipoId, string>`. `tipos` son los ya validados.

- [ ] **Paso 1: tests que fallan** (en `describe('POST /arreglos')`)
  - `'"Otro" guarda su detalle y la descripción es opcional'`: `{ tiposArregloIds: [1, 8], detallesTipos: { 8: '  Cambio de espejo ' } }` → 201, `body.registro.tiposArreglo` es `[{ id: 1, nombre: 'Engrase', detalle: null }, { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' }]` y `descripcion` es `null`.
  - `'"Otro" sin detalle, con detalle vacío o de más de 60 → 400'`: casos `{}`, `{ 8: '   ' }` y `{ 8: 'x'.repeat(61) }`. Verifica `errores.detallesTipos` con el mensaje exacto y que no se guardó nada.
  - `'detalle para un tipo que no lo lleva o no está marcado → 400'`: `{ tiposArregloIds: [1], detallesTipos: { 1: 'x' } }` da `'"Engrase" no lleva detalle'`, y `{ tiposArregloIds: [1], detallesTipos: { 8: 'x' } }` da el mensaje de tipo no marcado.
  - `'detallesTipos que no es un objeto → 400'`: casos `'x'` y `[1]`.
  - Reemplazar los dos tests viejos que exigían Descripción con "Otro" (`'"Otro" exige descripción'` y `'"Otro" combinado con otro tipo también exige descripción'`): ahora `{ tiposArregloIds: [8] }` sin detalle falla en `detallesTipos`, no en `descripcion`.
  - En `GET /historial`, cada tipo trae `detalle` (`null` en los sembrados). `sembrarRegistro` acepta `detalles = {}` y lo pone en la fila intermedia.
- [ ] **Paso 2:** `cd backend && node --test tests/mantenimiento.test.js` → FALLA.
- [ ] **Paso 3: Prisma falso.** El `create` copia `detalle ?? null` en cada fila de `mantenimientosTiposArreglo`. `armarRegistro` ya pasa la fila entera.
- [ ] **Paso 4: servicio.**
  - `validarDetallesTipos`:
    - `undefined` o `null` cuenta como `{}`.
    - Un valor que no es un objeto, o que es un array, devuelve el error de "no válidos".
    - Recorre las claves: la clave se valida con `parsearId`. Si no es un tipo marcado, o si el tipo no tiene `requiereDetalle`, da error.
    - Hace trim de cada texto. Vacío da error de obligatorio; más de `MAX_DETALLE_TIPO` (contando con `[...texto].length`), el de largo.
    - Al final, cada tipo marcado con `requiereDetalle` que no tiene detalle da el error de obligatorio.
    - Se guarda el primer error, en el orden del catálogo.
  - `registrarArreglo`:
    - Se borra el bloque `conDetalle` / `errores.descripcion`.
    - El create pasa a `tipos.map((t) => ({ tipoArregloId: t.id, detalle: detalles.get(t.id) ?? null }))`.
  - `serializarRegistro`: `({ tipoArreglo: t, detalle }) => ({ id: t.id, nombre: t.nombre, detalle: detalle ?? null })`.
- [ ] **Paso 5: schema y migración.**
  - `detalle String?` en `MantenimientoTipoArreglo`, con el comentario "Qué se hizo, para tipos con requiereDetalle (Otro)".
  - Actualizar el comentario de `requiereDetalle`.
  - `migration.sql`: `ALTER TABLE "mantenimiento_tipos_arreglo" ADD COLUMN "detalle" TEXT;`, con un comentario que diga que los arreglos con "Otro" ya cargados quedan con `detalle` NULL y siguen mostrando "Otro".
- [ ] **Paso 6:** `cd backend && npx prisma validate` → válido. Después `npm test` → todos PASAN.
- [ ] **Paso 7: docs.**
  - `docs/dominio.md` §2.3: "Otro" pide "¿Qué trabajo?" (hasta 60 caracteres, en `mantenimiento_tipos_arreglo.detalle`) y la Descripción es opcional.
  - En `CLAUDE.md`, cambiar "("Otro" exige descripción)" por "("Otro" exige indicar qué trabajo se hizo)".

---

### Tarea 2: `GrupoCasillas` — contenido debajo de una opción marcada

**Archivos:** `frontend/src/components/ui/GrupoCasillas.jsx`, `GrupoCasillas.css`, `grupoCasillas.render.test.mjs`, `docs/design-system/componentes/GrupoCasillas.md`

**Interfaces:**
- Produce: prop opcional `contenidoMarcada?: (opcion) => ReactNode`. Si la opción está marcada y la función devuelve algo, se renderiza **debajo del label de esa opción, dentro de su celda de la grilla**. Queda fuera del `<label>`, así un clic en el campo no desmarca la casilla.
- Cada celda pasa a ser `<div className="grupo-casillas-celda">` con el `label` y, debajo, `<div className="grupo-casillas-contenido">`.

- [ ] **Paso 1: tests que fallan.**
  - `'contenidoMarcada aparece solo debajo de las opciones marcadas'`: con `valor = [8]`, un `contenidoMarcada` que devuelve `<input id="extra-8">` solo para el 8 aparece una vez y fuera de cualquier `<label>`. Con `valor = []`, no aparece.
  - `'un clic en el contenido no desmarca la casilla'` (jsdom): se hace clic en el input extra y `onChange` no se llama.
- [ ] **Paso 2:** `cd frontend && node --test src/components/ui/grupoCasillas.render.test.mjs` → FALLA.
- [ ] **Paso 3: implementar.** `.grupo-casillas-contenido` lleva un `padding` lateral igual al que deja el texto de la opción (casilla + gap) y `margin-top: var(--space-2)`. La opción marcada y su contenido comparten el fondo `brand-50`: el borde y el fondo pasan del `label` a la celda cuando está marcada.
- [ ] **Paso 4:** el mismo comando → PASA.
- [ ] **Paso 5: guía.** Agregar la prop a "Lo que provee quien lo usa" y una regla en "Reglas": el contenido va dentro de la celda de la opción y fuera del label, y se usa para el campo "¿Qué trabajo?" de "Otro".

---

### Tarea 3: Formulario de Arreglos e historial

**Archivos:**
- `frontend/src/constants/mantenimiento.js` (`MAX_DETALLE_TIPO = 60`)
- `frontend/src/utils/mantenimiento.js` (`validarRegistroMantenimiento`, `textoTiposArreglo`, `detalleRegistro`, función nueva `nombreTipoArreglo`)
- `frontend/src/utils/mantenimiento.test.js`
- `frontend/src/components/mantenimiento/PestanaArreglos.jsx`
- `frontend/src/components/mantenimiento/pestanaArreglos.render.test.mjs`
- `frontend/src/components/mantenimiento/mantenimiento.render.test.mjs`
- `frontend/src/pages/Mantenimiento.css` (o el CSS de la tarjeta del historial): tope de ancho del badge
- `docs/design-system/componentes/Mantenimiento.md` (§ Arreglos y § Historial)

**Interfaces:**
- Consume: `tiposArreglo[].detalle` y `detallesTipos` de la Tarea 1, y `contenidoMarcada` de la Tarea 2.
- Produce:
  - `nombreTipoArreglo(tipo) → string`: el `detalle`, o el `nombre` si no hay detalle.
  - `textoTiposArreglo(registro)`: 0 tipos → `'Arreglo'`, 1 → `nombreTipoArreglo`, 2 → `'A + B'`, 3 o más → `` `${n} trabajos` ``.
  - `detalleRegistro`: con 2 o más tipos, `Trabajos: ${nombres.join(', ')}` (usando `nombreTipoArreglo`).
  - `validarRegistroMantenimiento(form, { …, tiposArreglo, maxDetalleTipo })`: el error va en `errores.detallesTipos`, con los mismos mensajes que el backend. Se borra la regla que exigía la Descripción.

- [ ] **Paso 1: tests que fallan.**
  - **utils:**
    - `textoTiposArreglo` con 1, 2, 3 y 6 tipos da `'Frenos'`, `'Engrase + Frenos'`, `'3 trabajos'` y `'6 trabajos'`. Con `[{ id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' }, engrase]` da `'Cambio de espejo + Engrase'` en el orden recibido.
    - Un "Otro" viejo con `detalle: null` muestra `'Otro'`.
    - `detalleRegistro` con 2 tipos incluye `Trabajos: Engrase, Cambio de espejo`; con 1 tipo, no.
    - En la validación, "Otro" marcado sin detalle da `errores.detallesTipos`, y con detalle no hay error. Una Descripción vacía con "Otro" ya no da error.
  - **render (historial):** el badge de 2 tipos es `Engrase + Frenos` y el de 3 es `3 trabajos`. "Trabajos: …" está en el detalle.
  - **jsdom (`pestanaArreglos.render.test.mjs`):**
    - El test `'al desmarcar "Otro"…'` pasa a: marcar Otro, verificar que aparece `#arreglo-detalle-8` y que no hay asterisco en Descripción, mandar el formulario y verificar el error "¿Qué trabajo?". Al desmarcar Otro, el campo desaparece y no queda el error.
    - Test nuevo: con Otro marcado y "Cambio de espejo" escrito, el body que llega al doble de `api.post` trae `detallesTipos: { 8: 'Cambio de espejo' }`. Si después se desmarca Otro, el body no trae `detallesTipos[8]`.
- [ ] **Paso 2:** `cd frontend && node --test src/utils/mantenimiento.test.js src/components/mantenimiento/*.test.mjs` → FALLA.
- [ ] **Paso 3: implementar.**
  - `PestanaArreglos`:
    - `formVacio` suma `detallesTipos: {}`.
    - `contenidoMarcada` devuelve, solo para tipos con `requiereDetalle`, un `FormField` con id `arreglo-detalle-${t.id}`, label "¿Qué trabajo?", `required`, placeholder "Por ejemplo, cambio de espejo", `maxLength` 60 y `error={errores.detallesTipos}`.
    - Al desmarcar un tipo se borra su entrada de `detallesTipos`.
    - Cambiar los tipos o un detalle limpia `errores.detallesTipos`.
    - Descripción pierde el `required` dinámico.
    - El body manda `detallesTipos` solo con los tipos marcados.
  - Tarjeta del historial: el badge del arreglo lleva una clase con `max-width` y `text-overflow: ellipsis`, y el texto completo en `title`.
- [ ] **Paso 4:** `cd frontend && npm test && npm run lint && npm run build` → todo OK.
- [ ] **Paso 5: guía `Mantenimiento.md`.**
  - § Arreglos: el campo "¿Qué trabajo?" debajo de "Otro" y la Descripción opcional.
  - § Historial: las reglas del badge (1, 2, 3 o más) y "Trabajos" desde 2 tipos, mostrando el detalle de "Otro".

---

## Después de implementar (lo hace el usuario)

1. Parar `npm run dev` del backend y correr `npx prisma migrate deploy` y `npx prisma generate`, contra la misma base donde se aplicó la migración anterior.
2. Volver a levantar el backend y probar: Engrase + Otro ("Cambio de espejo") → el badge dice "Engrase + Cambio de espejo". Un arreglo con 3 tipos → el badge dice "3 trabajos".
