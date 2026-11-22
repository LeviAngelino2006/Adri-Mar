# Personal y Usuarios, tanda 2: bajas, reactivación y contraseñas

Fecha: 25 oct 2026. Rama: `fix/personal-bajas-y-contrasenas`, creada desde `main` actualizado (`590e780`, con la tanda 1 ya mergeada), con seis commits, uno por punto, sin pushear.

Base: [personal-usuarios.md](personal-usuarios.md) (H6, H7, H8, H9, H11, H12 y H17) y [personal-usuarios-tanda-1.md](personal-usuarios-tanda-1.md), con las decisiones del equipo y del cliente del pedido.

**Cómo se trabajó**
- Base local propia: un cluster PostgreSQL 18 en el scratchpad (puerto 5434), creado con el mismo proveedor de locale que el CI. No me conecté a Neon.
- No leí ningún `.env`:
  - Los tests, el build y el lint corrieron sobre una copia del árbol hecha con `git ls-files` (o `git archive` de cada commit), sin archivos ignorados.
  - El backend de la prueba manual corrió desde otra copia igual, con las variables en el entorno y `dotenv` bloqueado con un preload. El front corrió con una config de Vite cuyo `envDir` apunta a una carpeta vacía.
  - **Un desliz:** una vez corrí `npx prisma generate` dentro de `backend/` del repo. Prisma CLI carga solo `backend/.env` si existe. No vi su contenido y `generate` no se conecta a ninguna base, pero lo dejo dicho. Desde ahí, el cliente lo generó solo el script, sobre la copia.
- Personal.jsx y Usuarios.jsx: solo lo mínimo para que no queden mintiendo (ver los puntos 1 y 5). Usuarios.jsx no se tocó.

---

## 1. Baja y deshabilitación con viajes asignados (H6, H7)

**Qué cambió**
- **`liberarComoChofer`** ([personaService.js:81](../../backend/src/services/personaService.js#L81)), dentro de la transacción de la baja o de la deshabilitación:
  - Busca los viajes **Programados** a nombre de la persona, de cualquier fecha, ordenados por fecha. Si hay alguno, corta con `ChoferConViajesProgramadosError` ([:42](../../backend/src/services/personaService.js#L42)).
  - Si no, borra sus candidaturas en viajes **A confirmar** y devuelve cuántas. Las de viajes en otro estado (por ejemplo, un A confirmar que después se canceló) quedan: son historia.
- **El 409** ([personaController.js:77](../../backend/src/controllers/personaController.js#L77) y [:113](../../backend/src/controllers/personaController.js#L113)):

  ```json
  {
    "error": "Tiene 2 viajes programados. Reasignalos antes de darla de baja.",
    "viajes": [
      { "id": 6, "fecha": "2026-10-30T09:30:00.000Z", "origen": "Río Tercero", "destino": "Rosario" },
      { "id": 7, "fecha": "2026-11-02T09:30:00.000Z", "origen": "Río Tercero", "destino": "Villa Carlos Paz" }
    ]
  }
  ```

  Con uno solo, en singular: "Tiene 1 viaje programado. Reasignalo antes de deshabilitarla.". `origen` y `destino` son el nombre de la ubicación, o `null` si el viaje no los tiene cargados.
- **Baja** ([personaService.js:358](../../backend/src/services/personaService.js#L358)): el chequeo y el borrado van en la transacción que ya existía, junto con el último Administrador y la cuenta.
- **Deshabilitar** ([personaService.js:286-317](../../backend/src/services/personaService.js#L286-L317)): ahora "deshabilitar" es pasar de habilitada a no habilitada. Antes se miraba cualquier `false` que llegara, aunque ya estuviera en `false`. Cuando deshabilita (o saca a un Administrador), el cambio va en una transacción; si no, directo, como antes.
- **Respuesta:** `PATCH /personas/:id/baja` y `PUT /personas/:id` devuelven `{ persona, candidaturasQuitadas }` ([personaController.js:63](../../backend/src/controllers/personaController.js#L63), [:99](../../backend/src/controllers/personaController.js#L99)).
- **En viaje** sigue como antes: se mira primero y da su 409 de siempre, aunque además haya Programados.
- **El motivo** de disponibilidad pasa a "Dado de baja" ([viajeService.js:1180](../../backend/src/services/viajeService.js#L1180)).
- **Front, lo mínimo:** al guardar una persona, Personal mostraba "No se pudieron guardar los cambios" ante cualquier error que no fuera 400, así que el motivo del 409 no se veía. Ahora muestra el `error` del backend ([Personal.jsx:212](../../frontend/src/pages/Personal.jsx#L212)). La baja ya lo mostraba ([:134](../../frontend/src/pages/Personal.jsx#L134)). El modal con la lista de viajes queda para la pantalla unificada.

**Por qué así**
- Bloquear hasta reasignar es lo que decidió el cliente, y es lo mismo que ya pasaba con En viaje.
- Las candidaturas no bloquean porque en A confirmar todavía no hay nada asignado. Borrarlas en la misma transacción evita que la persona siga apareciendo como candidata con el motivo "Dado de baja".

**Lo que no cubre:** una carrera entre la baja y una confirmación hecha al mismo tiempo en otra ventana. La confirmación valida al chofer fuera de la transacción de la baja, así que en ese instante podría quedar un Programado a nombre de alguien que se acaba de dar de baja. Si pasa, se ve como hoy: "El chofer elegido está inactivo" al comenzar o editar el viaje. Cerrarlo del todo pide bloquear la fila de la persona también al confirmar y al editar viajes. No lo hice porque toca Viajes y es un caso de dos gestores en el mismo segundo.

**Cómo se probó**
- [bajasChofer.test.js](../../backend/tests/bajasChofer.test.js), 13 tests, con los escenarios G5, G5b y G6 de la auditoría:
  - G5b: Ramiro, con los viajes 6 y 7 Programados, da 409 con la lista ordenada por fecha. La persona, la cuenta y la candidatura quedan como estaban.
  - El mensaje en singular, un Programado de una fecha que ya pasó y uno sin origen ni destino.
  - Con solo candidaturas, la baja pasa y borra la del A confirmar, no la del cancelado ni las de los demás.
  - G6: deshabilitar a Lucía (Encargada que maneja) con un Programado da 409.
  - Las candidaturas se borran en la misma transacción: si el cambio falla después (un DNI repetido), vuelven.
  - Editar otros datos no mira los viajes, y mandar `false` a quien ya no estaba habilitado no es deshabilitar.
  - En viaje, como antes, para la baja y para la deshabilitación.
- [viajesCandidatos.test.js:564](../../backend/tests/viajesCandidatos.test.js#L564): el motivo "Dado de baja".
- Integración, "Bajas con viajes contra la base": las consultas nuevas (los Programados con origen y destino, y el borrado filtrado por el estado del viaje) contra el schema real.
- Front: [cuentaPropia.render.test.mjs](../../frontend/src/pages/cuentaPropia.render.test.mjs), "el motivo de un 409 al guardar".

## 2. Documentación de solo consulta según la persona (H8)

**Qué cambió**
- La ficha de un chofer trae **`soloConsulta: !chofer.activo`** ([documentoService.js:155](../../backend/src/services/documentoService.js#L155)). Es la misma regla con la que el backend ya rechazaba registrar documentos de una persona dada de baja.
- Documentación lo usa ([Documentacion.jsx:460](../../frontend/src/pages/Documentacion.jsx#L460)). Mientras siga desplegado el backend anterior, que no lo manda, decide por `activo` de la persona, no por la cuenta. El aviso dice "Persona dada de baja: la documentación es de solo consulta" ([:485](../../frontend/src/pages/Documentacion.jsx#L485)).
- `estadoUsuario` sigue en la respuesta ([documentoService.js:149](../../backend/src/services/documentoService.js#L149)), comentado, porque lo usa el front anterior en pestañas que queden abiertas. Se puede borrar en la tanda de Documentación.

**Por qué:** bloquear la cuenta es una decisión sobre el acceso, no sobre el legajo. Con la regla anterior, a alguien que seguía manejando no se le podía renovar la licencia (G9).

**Cómo se probó**
- [documentos.test.js](../../backend/tests/documentos.test.js): con la cuenta bloqueada y la persona activa, `soloConsulta` es `false` y el backend deja registrar; dada de baja es `true`, tenga o no cuenta.
- [documentacionSoloConsulta.render.test.mjs](../../frontend/src/pages/documentacionSoloConsulta.render.test.mjs), 4 tests: G9 (Pablo Medina, con la cuenta bloqueada, tiene "Actualizar"); dada de baja no lo tiene y muestra el aviso; manda lo que dice el backend; y con el backend anterior decide por la persona.

## 3. Persona dada de baja: solo consulta (H12)

**Qué cambió**
- `PUT /personas/:id` sobre una persona dada de baja responde **409 "Reactivá primero a la persona."** ([personaService.js:266](../../backend/src/services/personaService.js#L266), [personaController.js:71](../../backend/src/controllers/personaController.js#L71)), aunque el formulario venga igual que lo guardado. El error vive en personaService ([:57](../../backend/src/services/personaService.js#L57)) y usuarioService usa el mismo.
- La cuenta de una persona dada de baja, igual: **cualquier** `PUT /usuarios/:id` da ese 409 ([usuarioService.js:245](../../backend/src/services/usuarioService.js#L245)). En la tanda 1 (H10) solo se rechazaba si la activaba o le cambiaba las credenciales.
- Un Encargado sobre un Administrador dado de baja sigue recibiendo 403, antes que el 409.
- **Lo que ya estaba bien y no cambió:** dar de baja otra vez (409 "La persona ya está inactiva"), crearle una cuenta (400), registrarle documentos (400) y asignarla como chofer (400).
- **Lo que dejé como está:** un Administrador puede borrar una versión de un documento de una persona dada de baja, igual que en un vehículo dado de baja. Es una corrección de algo mal cargado, no un cambio de datos. Si el cliente quiere que tampoco se pueda, es una línea en `eliminarDocumento`.

**Cómo se probó.** [personaDadaDeBaja.test.js](../../backend/tests/personaDadaDeBaja.test.js), 6 tests: G4 (editar a Néstor da 409 y no cambia nada, también con el formulario igual), el 403 del Encargado, que una persona activa se siga editando, la baja repetida y cualquier `PUT` a la cuenta de Néstor.

## 4. Reactivar (H9)

**Qué cambió**
- **`PATCH /personas/:id/reactivar`** ([personaService.js:377](../../backend/src/services/personaService.js#L377), [personaController.js:126](../../backend/src/controllers/personaController.js#L126), [personaRoutes.js:24](../../backend/src/routes/personaRoutes.js#L24)): `activo=true` y `fechaBaja=null`, con los mismos datos, viajes y documentos. **No reactiva la cuenta.** Ya activa: 409 "La persona ya está activa".
- **`PATCH /usuarios/:id/reactivar`** ([usuarioService.js:323](../../backend/src/services/usuarioService.js#L323), [usuarioController.js:109](../../backend/src/controllers/usuarioController.js#L109), [usuarioRoutes.js:24](../../backend/src/routes/usuarioRoutes.js#L24)): pasa la cuenta a ACTIVO, solo si la persona está activa (si no, 409 "Reactivá primero a la persona."). Ya activa: 409 "La cuenta ya está activa".
  - Elegí un endpoint nuevo, simétrico a `PATCH /usuarios/:id/baja`, porque es más claro para el botón que vendrá. `PUT /usuarios/:id { activo: true }` sigue andando con las mismas reglas.
- **Permisos:** Administrador y Encargado (`autorizar`). Un Encargado no reactiva a un Administrador ni su cuenta (403). Un Encargado sí reactiva a otro Encargado y su cuenta, porque hoy también puede darlo de baja y bloquearle la cuenta.
- Sin botones: van con la pantalla unificada.

**Cómo se probó**
- [reactivar.test.js](../../backend/tests/reactivar.test.js), 14 tests:
  - G4: el Administrador reactiva a Néstor y su cuenta sigue inactiva. Conserva sus datos y después ya se lo puede editar.
  - Encargado sobre un Chofer y sobre otro Encargado: pasa. Sobre un Administrador: 403. El Administrador sí puede.
  - Taller y Chofer: 403. Ya activa: 409. Inexistente: 404.
  - La cuenta: con la persona dada de baja, 409. Néstor completo, primero la persona y después la cuenta. Las mismas reglas de permisos.
- Integración, "Reactivar contra la base": alta, cuenta, baja, reactivar a la persona (el login todavía da 401), reactivar la cuenta y el login entra.

## 5. Perfil Chofer implica habilitado (H17)

**Qué cambió**
- **`calcularHabilitadoParaConducir`** ([personaService.js:142](../../backend/src/services/personaService.js#L142)): con perfil Chofer devuelve `true` siempre, mande lo que mande el front. Para los otros perfiles, lo que venga. Si no viene, `false` en el alta ([:240](../../backend/src/services/personaService.js#L240)) y sin cambios al editar ([:272](../../backend/src/services/personaService.js#L272)).
  - Pasar de Chofer a otro perfil conserva la habilitación si no viene. Si viene en `false`, es deshabilitar, con los chequeos del punto 1.
  - El chequeo de "no te cambies tu propio perfil" (H3) usa el valor ya calculado.
- **Migración de datos** [20261027120000_perfil_chofer_habilitado_para_conducir](../../backend/prisma/migrations/20261027120000_perfil_chofer_habilitado_para_conducir/migration.sql): pone `habilitado_para_conducir = true` a las personas con perfil Chofer que no lo estaban, activas o dadas de baja (si se las reactiva, vuelven con la regla). No toca los demás perfiles.
- **Documentación › Choferes.** ¿Sigue haciendo falta el "o"? No. Con la regla, "perfil Chofer **o** habilitado" es lo mismo que "habilitado". Quedó así:
  - el listado: `where: { activo: true, habilitadoParaConducir: true }` ([documentoService.js:576](../../backend/src/services/documentoService.js#L576));
  - el alta de documentos de chofer: solo la habilitación ([:123](../../backend/src/services/documentoService.js#L123)), con el mensaje "La persona no está habilitada para conducir.".

  Sin cambio de comportamiento una vez corrida la migración. Una persona que deja de manejar (Encargado deshabilitado) deja de aparecer en el listado, pero su carpeta se sigue consultando por su id.
- **Front, lo mínimo:** con el backend forzando `true`, el switch editable al editar a un Chofer mentía (se apagaba y se guardaba encendido). Ahora queda encendido y bloqueado con perfil Chofer también al editar ([Personal.jsx:225](../../frontend/src/pages/Personal.jsx#L225)). Pasar a alguien a Chofer lo enciende, y sacarlo de Chofer al editar conserva el valor ([:173](../../frontend/src/pages/Personal.jsx#L173)). En el alta, salir de Chofer lo sigue apagando, como antes.

**Consulta para correr en Neon (solo lectura).** La primera lista a las personas que habilita la migración. La segunda, los Programados que ya están a nombre de alguien dado de baja o no habilitado, de antes de esta tanda: el punto 1 impide crear casos nuevos, pero no arregla los que existen. Las dos van dentro de una transacción `READ ONLY` que se deshace.

```sql
BEGIN TRANSACTION READ ONLY;

-- 1) Personas con perfil Chofer que NO están habilitadas para conducir.
--    Son las que habilita la migración 20261027120000.
SELECT p.id,
       p.nombre,
       p.apellido,
       p.dni,
       p.activo,
       p.fecha_baja,
       u.nombre_usuario,
       (SELECT count(*)
          FROM viajes v
          JOIN estado_viaje ev ON ev.id_estadoviaje = v.estado_viaje_id
         WHERE v.chofer_persona_id = p.id
           AND ev.descripcion = 'PROGRAMADO') AS viajes_programados
  FROM personas p
  JOIN perfiles f      ON f.id_perfil = p.perfil_id
  LEFT JOIN usuarios u ON u.persona_id = p.id
 WHERE f.descripcion = 'CHOFER'
   AND p.habilitado_para_conducir = false
 ORDER BY p.activo DESC, p.apellido, p.nombre;

-- 2) Viajes Programados a nombre de alguien dado de baja o no habilitado.
SELECT v.id,
       v.fecha_inicio,
       o.nombre AS origen,
       d.nombre AS destino,
       p.id     AS persona_id,
       p.nombre || ' ' || p.apellido AS chofer,
       p.activo,
       p.habilitado_para_conducir,
       f.descripcion AS perfil
  FROM viajes v
  JOIN estado_viaje ev    ON ev.id_estadoviaje = v.estado_viaje_id
  JOIN personas p         ON p.id = v.chofer_persona_id
  JOIN perfiles f         ON f.id_perfil = p.perfil_id
  LEFT JOIN ubicaciones o ON o.id = v.origen_id
  LEFT JOIN ubicaciones d ON d.id = v.destino_id
 WHERE ev.descripcion = 'PROGRAMADO'
   AND (p.activo = false OR p.habilitado_para_conducir = false)
 ORDER BY v.fecha_inicio;

ROLLBACK;
```

Las probé contra mi base local: vacías, y con un Chofer sin habilitar y un Programado a su nombre, dentro de una transacción que deshice.

**Efecto de la migración:** las personas activas de la primera consulta **empiezan a aparecer entre los choferes para asignar** (en el alta de un viaje, al confirmarlo y en la disponibilidad) y, si tienen cuenta, ven "Mis viajes" desde su próximo pedido (la sesión sale de la base desde la tanda 1). En Documentación › Choferes ya aparecían. Si en la consulta aparece alguien con perfil Chofer que de verdad no maneja, hay que cambiarle el perfil: el switch ya no es la forma.

**Cómo se probó**
- [perfilChofer.test.js](../../backend/tests/perfilChofer.test.js), 9 tests:
  - G7: un alta de Chofer con `false` queda habilitado; sin el campo, también; los otros perfiles toman lo que venga.
  - Al editar, a un Chofer no se lo deshabilita por mandar `false`, aunque tenga Programados (no es deshabilitar).
  - Pasar a alguien a Chofer lo habilita. Sacarlo de Chofer conserva la habilitación; quitarla es deshabilitar (409 con Programados, pasa sin ellos).
- [documentos.test.js](../../backend/tests/documentos.test.js): lo que decide el alta y el listado es la habilitación, sea cual sea el perfil, con el mensaje nuevo.
- Integración, "Migración: el perfil Chofer queda habilitado para conducir": corre el `migration.sql` sobre personas cargadas directo en la base como antes de la regla (Chofer sin habilitar, Chofer dado de baja, Encargado, Taller que maneja). Habilita a los dos Choferes y a nadie más (`2` filas), el Chofer aparece en `/personas/disponibles-chofer` y repetirla no cambia nada.
- Front: [cuentaPropia.render.test.mjs](../../frontend/src/pages/cuentaPropia.render.test.mjs), "el perfil Chofer implica estar habilitado", 2 tests.

## 6. Contraseñas (H11)

**Backend**
- **Migración** [20261027130000_debe_cambiar_contrasena](../../backend/prisma/migrations/20261027130000_debe_cambiar_contrasena/migration.sql): `usuarios.debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT false` ([schema.prisma:69](../../backend/prisma/schema.prisma#L69)). Generada con `prisma migrate diff` y comprobada con `--exit-code`.
- **Cuándo queda en `true`:**
  - un gestor crea la cuenta ([usuarioService.js:200](../../backend/src/services/usuarioService.js#L200));
  - un gestor le cambia la contraseña a otra persona ([:259](../../backend/src/services/usuarioService.js#L259)).

  Si un Administrador se cambia la suya desde Usuarios, no queda provisoria: la eligió él. La ficha de la cuenta trae el flag ([:64](../../backend/src/services/usuarioService.js#L64)), para la pantalla unificada.
- **El bloqueo, en un solo lugar:** `autenticar` ([auth.js:12](../../backend/src/middlewares/auth.js#L12), [:55](../../backend/src/middlewares/auth.js#L55)).
  - La sesión de la base (tanda 1) trae el flag, en la misma consulta ([sesionService.js:21](../../backend/src/services/sesionService.js#L21)).
  - Con el flag en `true`, todo lo que no sea `GET /api/auth/me` o `PUT /api/auth/contrasena` responde **403 `{ error: "Tenés que cambiar tu contraseña antes de seguir.", codigo: "DEBE_CAMBIAR_CONTRASENA" }`**.
  - El 403 sale después de renovar el token: la sesión sigue viva mientras la persona cambia la contraseña.
  - Cualquier ruta nueva que use `autenticar` queda bloqueada sin hacer nada.
- **El login** funciona igual y devuelve `debeCambiarContrasena` en el usuario, igual que `/auth/me` ([authService.js:49](../../backend/src/services/authService.js#L49)).
- **`PUT /auth/contrasena`** ([authService.js:68](../../backend/src/services/authService.js#L68), [authController.js:27](../../backend/src/controllers/authController.js#L27), [authRoutes.js:13](../../backend/src/routes/authRoutes.js#L13)), para todos los perfiles:
  - Pide `contrasenaActual` y `contrasenaNueva`. La nueva, con las reglas del alta: obligatoria, sin solo espacios y de 8 o más. Además, distinta de la actual.
  - Una actual incorrecta da 400 en su campo: "La contraseña actual no es correcta". No da 401, porque el front lo tomaría como sesión vencida.
  - Si está todo bien, guarda el hash nuevo, pone el flag en `false` y devuelve el usuario.
- **Límite de intentos** (no estaba pedido): la ruta usa el mismo límite que el login, generalizado ([limiteLogin.js:41](../../backend/src/middlewares/limiteLogin.js#L41), [:114](../../backend/src/middlewares/limiteLogin.js#L114)).
  - 5 contraseñas actuales incorrectas por cuenta, o 20 por IP, en 15 minutos, dan 429.
  - Los errores de formato de la nueva no cuentan.
  - Sin esto, quien tuviera una sesión ajena abierta podía probar contraseñas actuales sin fin, sin pasar por el límite del login.

**Frontend** (completo, es independiente de Personal)
- **La detección:** el interceptor de [api.js:44](../../frontend/src/services/api.js#L44) reconoce el 403 con el código y avisa (`adrimar:debe-cambiar-contrasena`). [AuthContext.jsx:65](../../frontend/src/context/AuthContext.jsx#L65) marca al usuario. El flag también llega por el login y por `/auth/me`, con la misma regla de "pisar solo lo que vino" de la tanda 1 ([:23](../../frontend/src/context/AuthContext.jsx#L23)).
- **Las rutas:** [ProtectedRoute.jsx:15](../../frontend/src/components/ProtectedRoute.jsx#L15) lleva cualquier ruta a `/cambiar-contrasena` mientras el flag esté en `true`. Solo esa ruta lo permite ([App.jsx:99](../../frontend/src/App.jsx#L99)).
- **La pantalla** [CambiarContrasena.jsx](../../frontend/src/pages/CambiarContrasena.jsx) tiene tres campos: contraseña actual, nueva y "Repetí la contraseña nueva". Valida todo junto antes de enviar, con las reglas del backend más que coincidan las dos nuevas ([:20](../../frontend/src/pages/CambiarContrasena.jsx#L20)), y los errores del backend salen en su campo. Tiene dos formas:
  - **Obligatoria** ([:112](../../frontend/src/pages/CambiarContrasena.jsx#L112)): sin la navegación, con el panel de marca y la card del login, "Cambiá tu contraseña", un texto que explica por qué y "Cerrar sesión" como única salida. Al cambiarla, entra al Dashboard.
  - **Por elección:** dentro del Layout, como un formulario (`form-card`, `form-grid` en pares, "Cancelar" y "Cambiar contraseña"). Al cambiarla, muestra el toast "Contraseña cambiada correctamente." y se queda en la pantalla.
- **"Cambiar mi contraseña" en el menú del usuario de la sidebar** ([Layout.jsx:173-190](../../frontend/src/components/Layout.jsx#L173-L190)): el usuario del pie (avatar, nombre y perfil) es un botón que abre el menú, con `aria-expanded` y un chevron. "Cerrar sesión" queda como estaba.
- **Design system:** solo tokens y clases existentes (`login-*`, `form-*`, `layout-nav-link`, `Button`, `FormField`, `Alert`, `Toast`). En el par de botones, el secundario va primero, como pide `Button.md`. Lo documenté en [CambiarContrasena.md](../design-system/componentes/CambiarContrasena.md), [Navegacion.md](../design-system/componentes/Navegacion.md), [Avatar.md](../design-system/componentes/Avatar.md) y el [README](../design-system/README.md).

**Cómo se probó**
- [contrasenaProvisoria.test.js](../../backend/tests/contrasenaProvisoria.test.js), 18 tests, con el `sesionService` **real**: le sumé al doble de cuentas la consulta de la sesión. Así, un cambio hecho por otro vale desde el próximo pedido, como en producción.
  - Cuándo queda provisoria: alta de cuenta, cambio de un gestor a otro; no al cambiar solo el usuario, ni a un Administrador que se cambia la suya.
  - Con el flag: `/auth/me` responde y renueva el token; otro endpoint da 403 con el código y también renueva; el login avisa.
  - **Recorre las 76 rutas de la app**, leídas de `src/routes` con el prefijo de `app.js`. Solo `GET /api/auth/me`, `PUT /api/auth/contrasena` y `POST /api/auth/login` (que no pasa por `autenticar`) no responden el 403 con el código.
  - Después del cambio, el mismo token vuelve a andar. Si un gestor la cambia con la sesión abierta, queda bloqueada desde el próximo pedido.
  - Cambiar la propia: con la actual incorrecta, 400 sin cambios; con la correcta, 200, flag en `false`, la vieja ya no entra y la nueva sí. Las reglas de la nueva, los dos errores juntos, todos los perfiles, un Encargado que se cambia la suya (antes no podía, ver la tanda 1), el límite de 5 intentos (y que los errores de formato no cuentan) y sin sesión 401.
- [sesion.test.js](../../backend/tests/sesion.test.js): la forma de `/auth/me` suma `debeCambiarContrasena`.
- Integración, "Contraseña provisoria contra la base": la cuenta que crea un gestor entra, `/auth/me` da 200 con el flag, `mis-viajes` da 403 con el código, la actual incorrecta da 400, la correcta da 200, `mis-viajes` da 200 y en la base queda `false`. Prueba la columna en la consulta de la sesión.
- [cambiarContrasena.render.test.mjs](../../frontend/src/pages/cambiarContrasena.render.test.mjs), 12 tests. Usa `ProtectedRoute` y la pantalla reales, y la API real con sus interceptores (un adapter de axios falso):
  - después del login y en cualquier ruta, lleva a la pantalla obligatoria sin navegación;
  - la actual incorrecta sale en el campo; con la correcta entra a la app; "Cerrar sesión";
  - un 403 con el código, con la sesión abierta, lleva a la pantalla; un 403 de permisos sin el código, no;
  - el menú del usuario, la forma por elección dentro del Layout, las validaciones y el toast.
- En el navegador: ver "Verificación".

---

## Verificación

**Lo mismo que el CI.** Mi script (`verificar.sh`, en el scratchpad) hace los pasos de `.github/workflows/ci.yml`, sobre una copia sin `.env`:

1. `prisma generate`.
2. `npm test` del back.
3. Una base vacía y `prisma migrate deploy`.
4. `prisma migrate diff --exit-code`.
5. `npm run test:integracion`.
6. `npm test`, `npm run build` y `npm run lint` del front.

Corre con `set -e` y un `trap` que dice qué paso falló, y se detiene en el primero que falla. Lo corrí sobre el árbol de trabajo antes de cada commit y, al final, **sobre cada uno de los seis commits** (`git archive` de cada uno), en orden:

| Commit | Back | Migraciones | Integración | Front | Build y lint |
| --- | --- | --- | --- | --- | --- |
| `2f3694d` (H6, H7) | 790 / 0 fallos | 36, sin diferencias | 54 / 0 | 662 / 0 | OK |
| `34ffde5` (H8) | 792 / 0 | 36, sin diferencias | 54 / 0 | 666 / 0 | OK |
| `209f482` (H12) | 798 / 0 | 36, sin diferencias | 54 / 0 | 666 / 0 | OK |
| `ea2e200` (H9) | 812 / 0 | 36, sin diferencias | 55 / 0 | 666 / 0 | OK |
| `23fdcaf` (H17) | 823 / 0 | 37, sin diferencias | 56 / 0 | 668 / 0 | OK |
| `a997c27` (H11) | **841 / 0** | **38, sin diferencias** | **57 / 0** | **680 / 0** | OK |

Línea de base en `main` (`590e780`): back 777, integración 53 y front 661, con build y lint OK. Lint: ningún error y los mismos 8 warnings que en `main` (los `set-state-in-effect` y el `only-export-components` de AuthContext; los de AuthContext cambian de línea).

**Los tests nuevos fallan contra `main`.** Armé una copia de `main` con `git archive`, le puse encima los tests de `HEAD` (con sus dobles) y los corrí archivo por archivo, más la integración sobre una base migrada con las migraciones de `main`:

| Archivo | Contra `main` | Lo que pasa (controles) |
| --- | --- | --- |
| `bajasChofer.test.js` | **9 de 13 fallan** | En viaje (las dos), "mandar `false` a quien no estaba habilitado" y el rollback del DNI, que no cambian |
| `personaDadaDeBaja.test.js` | **3 de 6 fallan** | El 403 del Encargado, editar a una persona activa y la baja repetida |
| `reactivar.test.js` | **13 de 14 fallan** (404) | "Conserva sus datos": en `main` el `PATCH` no hace nada y el `PUT` pasa |
| `perfilChofer.test.js` | **4 de 9 fallan** | Lo que ya hacía `main`: Chofer sin el campo, otros perfiles, conservar al salir de Chofer, "no es deshabilitar" y quitarla sin viajes |
| `contrasenaProvisoria.test.js` | **18 de 18 fallan** | |
| `documentos.test.js` | **3 de 73 fallan** | `soloConsulta` (2) y el mensaje nuevo; el resto es el módulo de siempre |
| `viajesCandidatos.test.js` | **1 de 64 falla** | El motivo "Dado de baja" |
| `sesion.test.js` | **1 de 10 falla** | La forma de `/auth/me` |
| Integración | **4 de 57 fallan** | Las cuatro nuevas: bajas con viajes, migración, contraseña provisoria y reactivar |
| `cuentaPropia.render.test.mjs` | **3 de 15 fallan** | El motivo del 409 y el switch de Chofer (2) |
| `documentacionSoloConsulta.render.test.mjs` | **4 de 4 fallan** | |
| `cambiarContrasena.render.test.mjs` | **12 de 12 no corren** (la página no existe en `main`) | |

`personas`, `cuentas`, `usuarios` y `login` pasan igual contra `main`: solo cambié sus dobles.

**Prueba en el navegador.** Corrí el backend de la rama (copia sin `.env`, `dotenv` bloqueado), el front con Vite y una base nueva con el seed y un chofer, Martín Gómez, cuya cuenta creó la Administradora por la API (contraseña provisoria). Usé Chromium con Playwright, con dos sesiones a la vez en contextos separados, como dos ventanas, y entré por el formulario de login real. Script `prueba-navegador.mjs`; capturas en `capturas-tanda2/`; todo en el scratchpad.

1. **Primer ingreso con la provisoria:**
   - Martín entra y queda en "Cambiá tu contraseña", sin la navegación (`1a-chofer-primer-ingreso.png`).
   - Escribir `/mis-viajes` en la barra lo vuelve a traer.
   - Repetir la misma contraseña da "Tiene que ser distinta de la actual".
   - La cambia, entra al Dashboard y va a Mis viajes (`1b-chofer-usa-la-app.png`).
2. **El gestor cambia la contraseña con la sesión del chofer abierta:** en la otra ventana, Adriana abre la cuenta de Martín en Usuarios › "Modificar credenciales", escribe una contraseña nueva y guarda: "Credenciales actualizadas correctamente." (`2a-admin-cambia-la-contrasena.png`).
3. **El próximo pedido del chofer:**
   - Martín toca "Dashboard" y **queda en "Cambiá tu contraseña"**, sin navegación (`3a-chofer-al-proximo-pedido.png`).
   - Con su contraseña de antes da "La contraseña actual no es correcta" (`3b-chofer-actual-incorrecta.png`): la actual es la que le puso Adriana.
   - Con esa, la cambia y **usa la app normal**: Dashboard y Mis viajes (`3c-chofer-despues-del-cambio.png`).
4. **Por elección:**
   - Abre el menú del usuario de la sidebar (`4a-menu-del-usuario.png`) y "Cambiar mi contraseña" lo lleva al formulario dentro del Layout.
   - Enviar vacío muestra los tres errores juntos (`4b-por-eleccion-errores.png`).
   - La cambia: toast y sigue en la pantalla (`4c-por-eleccion-cambiada.png`). "Cancelar" vuelve a Mis viajes.
5. **Celular, 390 px:** la pantalla obligatoria sin scroll horizontal (`5a-celular-obligatoria.png`), los errores (`5b-celular-errores.png`) y el menú del usuario con la sidebar abierta (`5c-celular-menu-del-usuario.png`).

La prueba encontró un detalle visual: el chevron del menú abierto se veía torcido por un `translate`. Lo corregí antes del commit y lo verifiqué con una captura nueva (`6a-pie-cerrado.png`, `6b-sidebar-menu-abierto.png`). La primera corrida del guion se cortó en el paso 2 por una carrera del propio guion: buscaba el botón antes de que terminara el login. Lo corregí, volví la cuenta de Martín a una contraseña provisoria y corrí todo de nuevo desde el paso 1.

---

## Estado final

**Commits** en `fix/personal-bajas-y-contrasenas`, sin pushear:

| Hash | Punto |
| --- | --- |
| `2f3694d` | 1. No se da de baja ni se deshabilita a un chofer con viajes Programados (H6, H7) |
| `34ffde5` | 2. La carpeta de un chofer es de solo consulta según la persona, no según la cuenta (H8) |
| `209f482` | 3. Los datos de una persona dada de baja son de solo consulta (H12) |
| `ea2e200` | 4. Reactivar a una persona y a su cuenta (H9) |
| `23fdcaf` | 5. El perfil Chofer implica estar habilitado para conducir (H17) |
| `a997c27` | 6. Contraseña provisoria y cambiar la propia contraseña (H11) |

**Efecto del deploy**
- **Migraciones** (Render las aplica en el build, en este orden):
  1. `20261027120000_perfil_chofer_habilitado_para_conducir`, de datos: habilita a las personas con perfil Chofer que no lo estaban. Antes del deploy conviene correr la primera consulta del punto 5 para saber quiénes son.
  2. `20261027130000_debe_cambiar_contrasena`: una columna con default `false`.

  Las dos son compatibles con el código anterior mientras termina el deploy: el código viejo no conoce la columna y sus altas toman el default.
- **Qué cambia para los usuarios actuales:**
  - **Nadie tiene que cambiar la contraseña por el deploy:** las cuentas existentes quedan con `false`. La provisoria empieza a regir para las cuentas que se creen, o a las que un gestor les cambie la contraseña, desde ese momento.
  - **Todos pueden cambiar la suya** desde el menú del usuario. Para el Encargado, esto cierra lo que quedó pendiente en la tanda 1, que no tenía forma de cambiar la propia.
  - Los Choferes que no estaban habilitados **empiezan a aparecer para asignar** y ven "Mis viajes" desde su próximo pedido.
  - Dar de baja o deshabilitar a alguien con Programados ahora da el 409 con el motivo, que Personal muestra. Antes pasaba sin aviso.
  - Los datos de una persona dada de baja ya no se editan. En la pantalla no cambia nada: Personal ya no ofrecía "Editar datos".
  - En Viajes, el motivo de disponibilidad dice "Dado de baja".
  - En Documentación, el legajo de un chofer activo con la cuenta bloqueada vuelve a tener "Actualizar".
- **Orden de despliegue** (Vercel y Render por separado):
  - **Front nuevo con back viejo:**
    - `/auth/me` no trae el flag, y el front no lo pisa.
    - "Cambiar mi contraseña" da error hasta que llegue el back: `PUT /auth/contrasena` responde 404 y la pantalla muestra "Recurso no encontrado".
    - Documentación decide por `activo`.
  - **Front viejo con back nuevo:**
    - Solo afecta a una cuenta con la provisoria, que no existe hasta que un gestor cree una o cambie una contraseña con el back nuevo.
    - Esa cuenta vería errores por todos lados hasta recargar con el front nuevo.
    - Documentación sigue con `estadoUsuario`, como antes.
- **Variables de entorno:** ninguna nueva.

**Lo que no hice, y por qué**
- **Fuera de alcance, por pedido:**
  - la pantalla unificada de Personal y Usuarios;
  - los botones de reactivar;
  - el modal con los viajes del 409;
  - las validaciones de teléfono y nombre de usuario (H13);
  - buscar por DNI (H14);
  - PUT vs PATCH (H15).
- **Usuarios no avisa que la contraseña que escribe el gestor es provisoria** (UFm2: "Contraseña provisoria — la va a cambiar en su primer inicio de sesión"). Funciona igual, pero el gestor no lo ve. Va con la pantalla unificada.
- **Otras sesiones de la misma persona:** cuando alguien cambia su propia contraseña, sus otras sesiones abiertas (otro celular) siguen vivas. Cortarlas pide una versión de sesión en la cuenta, como proponía H1. Cuando la cambia un gestor, en cambio, todas quedan bloqueadas en "Cambiar contraseña" hasta que la persona la cambie.
- **La carrera baja contra confirmación** del punto 1.
- **`dominio.md`** (H16) sigue diciendo que el chofer de un viaje "debe tener perfil Chofer". Con la regla de esta tanda conviene reescribirlo como "habilitado para conducir (el perfil Chofer lo implica)".
- **Node:** el CI usa Node 22; localmente corrí Node 24.

**Decisiones que conviene revisar con el equipo**
- El mensaje del 409 va en singular cuando hay un solo viaje.
- La contraseña nueva tiene que ser distinta de la actual.
- El límite de intentos en el cambio de contraseña.
- Un Administrador que se cambia la suya desde Usuarios no queda con una provisoria.
- Cualquier `PUT /usuarios/:id` sobre la cuenta de una persona dada de baja da 409.
- Un Encargado puede reactivar a otro Encargado y su cuenta.
- Las candidaturas de viajes cancelados no se borran.
- Borrar versiones de documentos de una persona dada de baja sigue permitido para el Administrador.

**Entorno al terminar.** Apagué el backend y el front de la prueba manual y la base del scratchpad. El árbol de trabajo quedó limpio, salvo `docs/auditoria-ux/`, que no se commitea.
