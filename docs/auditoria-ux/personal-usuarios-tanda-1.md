# Personal y Usuarios, tanda 1: seguridad

Fecha: 25 oct 2026. Rama: `fix/seguridad-sesion-y-cuentas`, creada desde `main` actualizado (`043e3a2`), con siete commits, uno por punto, sin pushear.

Base: [personal-usuarios.md](personal-usuarios.md), hallazgos H1, H2, H3, H4, H5, H10, H12 y H13, con los escenarios G1 a G8 de `pruebas-api.log` como guion de pruebas.

**Cómo se trabajó**
- Base local propia, en un cluster PostgreSQL 18 del scratchpad. No me conecté a Neon.
- No leí ningún `.env`.
  - Los tests, el build y el lint corrieron sobre una copia del árbol hecha con `git ls-files`, que no incluye archivos ignorados y por lo tanto tampoco el `.env`. Es como el checkout del CI.
  - El backend de las pruebas manuales corrió desde esa misma copia, con las variables en el entorno y `dotenv` bloqueado.
  - El frontend corrió con una config de Vite cuyo `envDir` apunta a una carpeta vacía.

---

## 1. La sesión refleja la base (H1)

**Qué cambió**
- **`autenticar`** ([auth.js:6-48](../../backend/src/middlewares/auth.js#L6-L48)):
  - Después de verificar la firma, llama a `buscarSesion(payload)` ([sesionService.js:13-41](../../backend/src/services/sesionService.js#L13-L41)).
  - Si la cuenta no existe, no está ACTIVO o la persona está dada de baja, responde 401 "Tu sesión ya no es válida. Iniciá sesión de nuevo." y **no** renueva el token ([auth.js:33-36](../../backend/src/middlewares/auth.js#L33-L36)).
  - Si no, `req.usuario` es la sesión de la base y el token renovado se firma con esos datos. `autorizar` y todo lo que lee `req.usuario.perfil`, `personaId` o `habilitadoParaConducir` usan los valores actuales.
- **La consulta** es **una sola, por clave primaria**: un `SELECT` con JOIN a `usuarios`, `estado_usuario`, `personas` y `perfiles`, `WHERE u.id = $1` ([sesionService.js:17-29](../../backend/src/services/sesionService.js#L17-L29)).
  - Está escrita en SQL, con `$queryRaw` parametrizado, porque el `select` anidado de Prisma 6 resuelve cada relación con un SELECT aparte. Lo medí: **4 consultas contra 1**.
  - Ya había un precedente de `$queryRaw` en `lecturaOdometroService.js:135`.
  - Si cambia un nombre de tabla o de columna, falla el test de integración, que corre la consulta contra la base migrada.
- **`/auth/me`** devuelve el usuario de la base con la misma forma que el login, nombre y apellido incluidos ([authService.js:38-60](../../backend/src/services/authService.js#L38-L60), [authController.js:22](../../backend/src/controllers/authController.js#L22)).
- **Front:**
  - [AuthContext.jsx](../../frontend/src/context/AuthContext.jsx) pide `/auth/me` al montar ([:31](../../frontend/src/context/AuthContext.jsx#L31)) y cuando llega el evento `adrimar:sesion-cambiada` ([:40](../../frontend/src/context/AuthContext.jsx#L40)).
  - El interceptor de [api.js:19-37](../../frontend/src/services/api.js#L19-L37) lee el payload del token renovado ([utils/sesion.js](../../frontend/src/utils/sesion.js)) y dispara ese evento si el perfil o la habilitación no coinciden con el usuario guardado. Lo hace **también en las respuestas de error**: a quien le sacaron el perfil, la pantalla que ya no le corresponde le devuelve un 403 que igual trae el token nuevo, porque `autenticar` renueva antes de que `autorizar` corte.
  - Al refrescar, pisa solo los campos que vinieron. Así, mientras el back viejo siga en Render y el front nuevo ya esté en Vercel, el `/auth/me` viejo (sin nombre) no le borra el nombre al usuario.
  - Ante un 401, el login muestra "Tu sesión venció. Iniciá sesión de nuevo." ([Login.jsx:73](../../frontend/src/pages/Login.jsx#L73)).
- **Tests de los demás módulos:** firman tokens con el perfil que necesitan (el mismo id con distintos perfiles) y sus dobles de Prisma no tienen esas tablas. Usan [helpers/sesionDelToken.js](../../backend/tests/helpers/sesionDelToken.js), que toma la sesión del token, como suponían antes. Son 18 archivos, con dos líneas cada uno. La sesión real la prueban `sesion.test.js` y la integración.

**Por qué alcanza sin cache.** Medí la consulta en local con 2000 pedidos contra la base de la auditoría:

| Consulta | Promedio | p50 | p95 | p99 | Consultas SQL |
| --- | --- | --- | --- | --- | --- |
| `buscarSesion` (JOIN a mano) | **0,69 ms** | 0,62 | 1,19 | 1,93 | 1 |
| `select` anidado de Prisma, solo para comparar | 1,96 ms | 1,72 | 3,30 | 4,44 | 4 |

- En producción, el costo es **una ida y vuelta más a Neon por pedido**. Cada pedido de la app ya hace varias (un listado son entre 2 y 5 consultas), así que es una fracción chica.
- La consulta va por clave primaria y los JOIN por claves primarias y foráneas de tablas chicas (decenas de filas).
- Un cache volvería a abrir el agujero: durante su TTL, una cuenta bloqueada seguiría entrando. Invalidarlo a mano obligaría a que cada escritura de personas o cuentas se acuerde de hacerlo. No vale la pena para menos de un milisegundo.

**Cómo se probó**
- **[sesion.test.js](../../backend/tests/sesion.test.js)**, con 10 tests y el sesionService real sobre un doble de la consulta:
  - G3b: con la cuenta bloqueada, el token previo da 401 en `mis-viajes` y en `comenzar` (en la auditoría, comenzó y finalizó un viaje).
  - G2: con la persona dada de baja, 401; y un Administrador pasado a Chofer ya no crea Administradores.
  - G1: un Encargado pasado a Taller recibe 403 en Personal y en Usuarios.
  - G6: el token renovado lleva el perfil y la habilitación de la base.
  - Una cuenta que ya no existe da 401.
  - Hay un test que verifica que `autenticar` hace **una** consulta y nada más.
- **Integración** ([consultasPrisma.integracion.js](../../backend/tests/integracion/consultasPrisma.integracion.js), "Sesión contra la base"):
  1. Se crea un chofer con cuenta y se hace login.
  2. Con su token, `/auth/me` responde 200 y renueva el token.
  3. El Administrador bloquea la cuenta por la API.
  4. El mismo token da 401 con el mensaje y sin renovar.
- **Front:**
  - [sesion.render.test.mjs](../../frontend/src/context/sesion.render.test.mjs), 6 tests: refresco al cargar, refresco con un token de otro perfil (en una respuesta 2xx y en un 403), ningún pedido si no cambió nada, back anterior sin nombre, y 401 que lleva al login con el mensaje.
  - [utils/sesion.test.js](../../frontend/src/utils/sesion.test.js), 6 tests.
- **En el navegador:** ver "Verificación".

## 2. Siempre queda un Administrador activo (H2)

**Qué cambió**
- [utils/administradoresActivos.js](../../backend/src/utils/administradoresActivos.js):
  - Un "Administrador activo" tiene perfil ADMINISTRADOR, la persona activa y la cuenta ACTIVO ([:21-27](../../backend/src/utils/administradoresActivos.js#L21-L27)).
  - `asegurarOtroAdministradorActivo` ([:39-51](../../backend/src/utils/administradoresActivos.js#L39-L51)) corre **dentro de la transacción del cambio**: toma un advisory lock de Postgres (`pg_advisory_xact_lock`, [:40](../../backend/src/utils/administradoresActivos.js#L40)) y cuenta los **otros** Administradores activos. Si no queda ninguno, lanza `UltimoAdministradorError`, que llega como 409 "Tiene que quedar al menos un Administrador activo", y la transacción se deshace.
- Lo aplican los cuatro caminos que hoy pueden sacar a un Administrador activo:
  - el cambio de perfil, en [personaService.js:234-246](../../backend/src/services/personaService.js#L234-L246);
  - la baja, dentro de la transacción que ya existía, en [personaService.js:286-288](../../backend/src/services/personaService.js#L286-L288);
  - el bloqueo por `PUT activo=false`, en [usuarioService.js:267-277](../../backend/src/services/usuarioService.js#L267-L277);
  - el bloqueo por `PATCH /usuarios/:id/baja`, en `darDeBajaUsuario` ([usuarioService.js](../../backend/src/services/usuarioService.js), con el mismo `protegerUltimoAdministrador`).
- Los cambios que no sacan a un Administrador activo siguen sin transacción, como antes.

**Por qué con lock.** Con READ COMMITTED, dos Administradores que se bajan el perfil uno al otro a la vez ven, cada uno, al otro todavía activo (el cambio del otro no está confirmado). Los dos pasan y el sistema queda sin Administradores. El lock serializa solo esos cambios, que son raros: el segundo espera a que el primero confirme y cuenta con ese cambio ya hecho.

Desde H1 y H3, a este hueco solo se llega por cambios simultáneos o hechos con datos viejos. Quien pide es un Administrador activo según la base y no puede actuar sobre sí mismo, así que siempre queda él.

**Cómo se probó**
- [cuentas.test.js](../../backend/tests/cuentas.test.js), "H2", 7 tests:
  - G2: con Carlos pasado a Chofer, dar de baja a Adriana da 409.
  - A la última Administradora no se le puede cambiar el perfil, ni darla de baja, ni bloquearle la cuenta por ninguno de los dos caminos. La persona y la cuenta quedan como estaban (rollback).
  - Con otro Administrador activo sí se puede, y se verifica que se toma el lock.
  - Un Administrador que no está activo y quien no es Administrador no pasan por el chequeo.
- **Integración, "Último Administrador contra la base":** dos transacciones reales que se pisan a propósito. La primera cuenta y queda abierta 300 ms; la segunda arranca mientras tanto. Pasa una sola, y en la base queda exactamente un Administrador activo.
- **Contraexperimento** sobre la copia de verificación, no en el repo: sin el lock, ese test **falla 3 de 3 veces**. La primera versión del test, con dos llamadas al service sin forzar que se pisaran, pasaba aun sin el lock. Por eso la cambié: no probaba nada.

## 3. Nadie actúa sobre sí mismo (H3)

**Qué cambió**
- **Back:** los controllers pasan `personaIdSolicitante: req.usuario.personaId`, que desde H1 sale de la base ([personaController.js:61](../../backend/src/controllers/personaController.js#L61), [:91](../../backend/src/controllers/personaController.js#L91); [usuarioController.js:56](../../backend/src/controllers/usuarioController.js#L56), [:86](../../backend/src/controllers/usuarioController.js#L86)). Los services responden 409:
  - "No podés darte de baja a vos mismo" ([personaService.js:266-268](../../backend/src/services/personaService.js#L266-L268)).
  - "No podés bloquear tu propia cuenta", por `/baja` y por `PUT activo=false` ([usuarioService.js:238](../../backend/src/services/usuarioService.js#L238), [:295](../../backend/src/services/usuarioService.js#L295)).
  - "No podés cambiar tu propio perfil", si cambia el perfil **o la habilitación para conducir** ([personaService.js:213-220](../../backend/src/services/personaService.js#L213-L220)). El front manda el formulario completo, así que solo cuenta como cambio si el valor difiere. Los demás datos propios (nombre, teléfono, email) se siguen editando.
- **Front:**
  - En la ficha propia de Personal no aparece "Dar de baja" ([Personal.jsx:474](../../frontend/src/pages/Personal.jsx#L474)).
  - En la cuenta propia de Usuarios no aparece "Desactivar acceso" ([Usuarios.jsx:434](../../frontend/src/pages/Usuarios.jsx#L434)).
  - Al editarse a sí mismo, el select de perfil queda deshabilitado con el hint "Tu perfil lo cambia un Administrador." ([Personal.jsx:266-269](../../frontend/src/pages/Personal.jsx#L266-L269)). El switch de conducir también queda deshabilitado ([:220](../../frontend/src/pages/Personal.jsx#L220)): el back lo rechaza igual, y dejarlo activo era ofrecer algo que falla.

**Cómo se probó**
- [cuentas.test.js](../../backend/tests/cuentas.test.js), "H3", 7 tests:
  - G2: la Administradora no se puede dar de baja.
  - G1: el Encargado no se cambia el perfil ni la habilitación, pero sí sus otros datos.
  - G1 y G3: nadie se bloquea la cuenta por ningún camino.
  - Sobre otra persona sí se puede.
  - La comparación es por persona, no por id de cuenta: Ramiro tiene la cuenta 11 y la persona 14.
- [cuentaPropia.render.test.mjs](../../frontend/src/pages/cuentaPropia.render.test.mjs), "la ficha propia" y "la cuenta propia".

## 4. Un Encargado no toma la cuenta de otro (mínimo de H4)

**Qué cambió**
- **Back:** un `PUT /usuarios/:id` de un Encargado sobre una cuenta con perfil Encargado (otra o la propia) responde 403 "Solo un Administrador puede cambiar el usuario o la contraseña de un Encargado." si cambia el nombre de usuario o manda contraseña ([usuarioService.js:229-236](../../backend/src/services/usuarioService.js#L229-L236)). El controller ahora muestra el mensaje del error cuando lo tiene ([usuarioController.js:64](../../backend/src/controllers/usuarioController.js#L64)).
- Lo demás que un Encargado puede hacer sobre otro Encargado queda **como estaba**: bloquearle la cuenta, editar sus datos de persona, bajarle el perfil, darlo de baja. Se decide en otra tanda.
- **Front:** un Encargado no ve "Modificar credenciales" en la cuenta de un Encargado ([Usuarios.jsx:428](../../frontend/src/pages/Usuarios.jsx#L428)).

**Ojo.** Como todavía no existe "Cambiar mi contraseña" (H11, fuera de alcance), hoy **un Encargado no puede cambiar la suya**: se la tiene que cambiar un Administrador. Es lo que pide este punto, pero conviene que H11 venga pronto.

**Cómo se probó**
- [cuentas.test.js](../../backend/tests/cuentas.test.js), "H4", 6 tests:
  - G1: Diego no le cambia la contraseña ni el usuario a Lucía (el hash no cambia).
  - Tampoco puede con los de su propia cuenta.
  - Un Administrador sí puede, y un Encargado sigue gestionando los de un Chofer.
  - Bloquear a otro Encargado sigue permitido.
- [cuentaPropia.render.test.mjs](../../frontend/src/pages/cuentaPropia.render.test.mjs), "las credenciales de un Encargado", 4 tests.

## 5. GET /usuarios/:id (H5) y revisión de los demás endpoints

**Qué cambió**
- `GET /usuarios/:id` usa `consultarUsuario` ([usuarioService.js:130-136](../../backend/src/services/usuarioService.js#L130-L136)) con la misma regla que `GET /personas/:id`: si un Encargado pide la cuenta de un Administrador, 403 "No tiene permisos para consultar este usuario" ([usuarioController.js:34](../../backend/src/controllers/usuarioController.js#L34)).

**Revisión de los endpoints de personas y usuarios**

| Endpoint | Regla para un Encargado | Estado |
| --- | --- | --- |
| `GET /personas`, con o sin `sinUsuario` | Filtra a los Administradores | Ya estaba bien |
| `GET /personas/:id` | 403 si es Administrador | Ya estaba bien |
| `POST /personas`, `PUT /personas/:id`, `PATCH /personas/:id/baja` | No crea, no edita ni da de baja a un Administrador, y no asigna ese perfil | Ya estaba bien |
| `GET /usuarios` | Filtra a los Administradores | Ya estaba bien |
| `GET /usuarios/:id` | No controlaba | **Corregido** |
| `POST /usuarios`, `PUT /usuarios/:id`, `PATCH /usuarios/:id/baja` | No toca la cuenta de un Administrador | Ya estaba bien |
| `GET /personas/disponibles-chofer` y su alias `/usuarios/disponibles-chofer` | No puede ocultar a un Administrador que maneja: se lo tiene que poder asignar como chofer | **Corregido de otra forma:** devolvía la persona completa (DNI, email, teléfono, usuario) de todos los habilitados. Ahora devuelve solo `id`, `nombre` y `apellido`, lo único que usan los selectores de chofer ([personaService.js:357-363](../../backend/src/services/personaService.js#L357-L363)) |
| `/auth/me` | La propia cuenta | OK |

- **Fuera de Personal y Usuarios**, Documentación › Choferes (`GET /documentos/estado-choferes` y `GET /documentos/choferes/:id`) devuelve DNI, email y nombre de usuario de un Administrador habilitado para conducir.
- Lo dejé así porque el Encargado gestiona la licencia y el DNI de quien maneja, y ocultarlo rompería esa tarea.
- Sugiero que esos endpoints devuelvan solo lo que usa la pantalla (sin email ni usuario) en la tanda de Documentación (H8).

**Cómo se probó.** [cuentas.test.js](../../backend/tests/cuentas.test.js), "H5", 3 tests:
- G1: `GET /usuarios/1` da 403 a un Encargado, igual que `/personas/1`.
- La cuenta de otro Encargado sí la ve, y un Administrador las ve todas.
- Los dos endpoints de disponibles para conducir incluyen al Administrador que maneja, con exactamente `{ id, nombre, apellido }`.

## 6. La cuenta de una persona dada de baja (H10)

**Qué cambió.** Un `PUT /usuarios/:id` sobre la cuenta de una persona dada de baja que la activa, le cambia el nombre de usuario o le manda contraseña responde 409 "Reactivá primero a la persona." ([usuarioService.js:240-247](../../backend/src/services/usuarioService.js#L240-L247), [usuarioController.js:75](../../backend/src/controllers/usuarioController.js#L75)). Bloquear la cuenta de una persona activa y volver a activarla sigue funcionando.

**Cómo se probó.** [cuentas.test.js](../../backend/tests/cuentas.test.js), "H10", 3 tests:
- G4: la cuenta de Néstor no se activa y queda INACTIVO.
- Tampoco se le cambian la contraseña ni el usuario.
- La cuenta bloqueada de Ramiro, que está activo, sí se reactiva.

## 7. Login y contraseñas (parte de H12 y H13)

**Contraseñas** ([usuarioService.js:81-104](../../backend/src/services/usuarioService.js#L81-L104)):
- **En el alta**, vacía da "La contraseña es obligatoria" y con solo espacios da "La contraseña no puede tener solo espacios". Antes, 8 espacios eran una contraseña válida (G7).
- **Al editar**, no mandar el campo sigue siendo "no cambiarla". Si se manda vacío, da "La contraseña no puede estar vacía"; con solo espacios, el mismo error que en el alta. Antes, el back ignoraba las dos cosas y la pantalla decía "guardado".
- Una contraseña con espacios adentro sigue siendo válida.
- **El front** ya no descarta en silencio una contraseña de solo espacios: la manda y el error sale en el campo ([Usuarios.jsx:198](../../frontend/src/pages/Usuarios.jsx#L198)).

**Límite de intentos** ([middlewares/limiteLogin.js](../../backend/src/middlewares/limiteLogin.js), montado en [authRoutes.js:8](../../backend/src/routes/authRoutes.js#L8)):
- **Qué cuenta:**
  - Cuenta los intentos **fallidos** (respuestas 401) en una ventana deslizante de 15 minutos.
  - Los cuenta por **nombre de usuario**: en minúsculas y sin espacios alrededor, exista o no la cuenta. Así el 429 no delata qué cuentas existen y "AMartinez" no esquiva el límite de "amartinez".
  - Los cuenta también por **IP**.
- **Topes:** 5 por usuario y 20 por IP ([:25-27](../../backend/src/middlewares/limiteLogin.js#L25-L27)).
  - Los 5 por usuario son los del pedido.
  - Para la IP subí el tope: 5 bloquearía a toda la oficina, que sale por una sola IP, o a varios choferes, que salen por el NAT compartido de las telefónicas (CGNAT), por errores de otros. Con 20, un ataque desde una IP prueba como máximo 20 contraseñas cada 15 minutos, y nunca más de 5 contra la misma cuenta.
- **Al llegar al tope:**
  - Responde 429 "Demasiados intentos. Probá de nuevo en unos minutos." **aunque la contraseña sea la correcta**, con `Retry-After` en segundos.
  - Deja en el log `[login] 429 ip=… usuario=…` ([:71](../../backend/src/middlewares/limiteLogin.js#L71)).
  - Un ingreso correcto borra los fallos de ese usuario, no los de la IP.
- **Contador en memoria:** el backend corre en **una sola instancia** de Render, así que no hay otra réplica con la que compartirlo. Un reinicio o un deploy lo vacía, y eso solo le da a un atacante, como mucho, una ventana nueva. Una limpieza cada 5 minutos, que no retiene el proceso, borra las claves viejas para que el mapa no crezca con nombres inventados ([:104-105](../../backend/src/middlewares/limiteLogin.js#L104-L105)). Si algún día hay más de una instancia, el contador tiene que pasar a la base o a Redis.

**El mismo mensaje y el mismo tiempo, exista o no la cuenta:**
- El mensaje ya era el mismo ("Usuario o contraseña incorrectos"). Lo que cambiaba era el **tiempo**: si la cuenta no existía o estaba inactiva, se respondía sin comparar la contraseña y la respuesta era más rápida.
- Ahora siempre se hace una comparación de bcrypt, contra un hash de relleno cuando hace falta ([authService.js:11](../../backend/src/services/authService.js#L11), [:22-27](../../backend/src/services/authService.js#L22-L27)).
- Además, un login sin cuerpo o con tipos raros ahora da 400 y no 500 ([authController.js:5-7](../../backend/src/controllers/authController.js#L5-L7)).

**`trust proxy`** ([app.js:21-31](../../backend/src/app.js#L21-L31)): `app.set('trust proxy', 2)`, no `true`.

- **Topología de Render:**
  - Todo el tráfico pasa por Cloudflare antes del balanceador de Render ([artículo de Render sobre DDoS](https://render.com/articles/how-render-handles-ddos-attacks)).
  - Un pedido llega a la app con `X-Forwarded-For: <cliente>, <borde de Cloudflare>`, desde una dirección 10.x del balanceador ([issue que lo documenta](https://github.com/FullmetalBober/Indexterity/issues/574)).
  - Cloudflare **agrega** su entrada a `X-Forwarded-For` en vez de reemplazar la que manda el cliente ([guía de Render para PocketBase](https://render.com/articles/host-pocketbase-on-render)).
- Por eso:
  - con `true`, la IP sería la primera de la lista, que el cliente puede inventar;
  - con `1`, sería la del borde de Cloudflare, que cambia y la comparten muchos clientes;
  - con `2`, es la del cliente.
- **Verificación local** con la misma cadena: `verificar-proxy.mjs`, resultado en `verificar-proxy.log`.
  - Armé el cliente en 127.0.0.5 o 127.0.0.6, un proxy "Cloudflare" en 127.0.0.10 que agrega al cliente y un proxy "balanceador" en 127.0.0.20 que agrega a Cloudflare y se conecta a la app desde su dirección.
  - Apps de eco con cada configuración, con el cliente mandando además `X-Forwarded-For: 6.6.6.6`:

    | trust proxy | IP que ve la app | Con un `X-Forwarded-For` inventado |
    | --- | --- | --- |
    | 1 | 127.0.0.10 (Cloudflare) | 127.0.0.10 |
    | **2** | **127.0.0.5 (el cliente)** | **127.0.0.5** |
    | true | 127.0.0.5 | **6.6.6.6** (el valor inventado) |

  - **Backend real**, detrás de la cadena:
    - 20 fallos desde 127.0.0.5, con usuarios distintos y un `X-Forwarded-For` inventado distinto en cada intento, dieron 20 respuestas 401.
    - El intento 21 dio **429**, y el log dijo `[login] 429 ip=127.0.0.5 … ip=20`.
    - El primer intento desde 127.0.0.6 dio 401.
  - Las IP del cliente y de los proxies son locales, no las de Render: lo que prueba esto es que con esa topología `2` es el valor correcto.
- **Qué falta verificar en Render:** que la topología sea la documentada. No pude probarlo en Render sin desplegar.
  - Si hubiera un solo proxy, `2` dejaría que un cliente se invente la IP con un `X-Forwarded-For` propio.
  - Si hubiera tres, todos los clientes compartirían la IP de Cloudflare y el límite por IP bloquearía a todos juntos. El límite por usuario seguiría funcionando.
  - **Cómo verificarlo después del deploy:**
    1. Averiguar la IP pública propia, por ejemplo con `curl ifconfig.me`.
    2. Hacer 6 intentos fallidos contra un nombre de usuario de prueba que no exista.
    3. En los logs de Render, la línea `[login] 429 ip=…` tiene que mostrar esa IP.
    4. Repetirlo con otro usuario de prueba, mandando `-H 'X-Forwarded-For: 1.2.3.4'`: la IP del log tiene que seguir siendo la propia.
  - Si no coincide, se corrige el número en `SALTOS_DE_PROXY`.

**Cómo se probó**
- [login.test.js](../../backend/tests/login.test.js), 12 tests:
  - Contraseña incorrecta, cuenta inexistente, cuenta bloqueada, persona dada de baja y cuenta activa de una persona dada de baja dan un 401 idéntico.
  - Siempre se compara una contraseña.
  - G8: después de 5 fallos, 429 aun con la contraseña correcta, con `Retry-After`.
  - Las mayúsculas no esquivan el límite, y un usuario inexistente también se limita.
  - Un ingreso correcto borra los fallos, y los fallos de un usuario no bloquean a otro.
  - 20 fallos desde una IP bloquean esa IP y no otra.
  - Un `X-Forwarded-For` inventado no cambia la IP que se cuenta.
  - La ventana de 15 minutos, con un reloj inyectado.
- [cuentas.test.js](../../backend/tests/cuentas.test.js), "G7", 5 tests.
- [cuentaPropia.render.test.mjs](../../frontend/src/pages/cuentaPropia.render.test.mjs), "la contraseña al editar", 2 tests.

---

## Verificación

**Lo mismo que el CI.** Mi script (`verificar.sh`, en el scratchpad) hace lo mismo que `.github/workflows/ci.yml`:

1. `prisma generate`.
2. `npm test` del back.
3. Una base vacía y `prisma migrate deploy`.
4. `prisma migrate diff --exit-code`.
5. `npm run test:integracion`.
6. `npm test`, `npm run build` y `npm run lint` del front.

Corre con `set -e` y un `trap` que dice qué paso falló, y se detiene en el primero que falla. Lo corrí antes de cada commit sobre el árbol de trabajo. Después del último *fixup*, que reescribió la historia, lo corrí de nuevo **sobre cada uno de los siete commits** (`git archive` de cada uno), en orden:

| Commit | Back | Integración | Front | Build y lint |
| --- | --- | --- | --- | --- |
| `4c46fcc` (H1) | 734 / 0 fallos | 52 / 0 | 649 / 0 | OK |
| `1f8a4ac` (H2) | 741 / 0 | 53 / 0 | 649 / 0 | OK |
| `990975b` (H3) | 748 / 0 | 53 / 0 | 655 / 0 | OK |
| `ec07de8` (H4) | 754 / 0 | 53 / 0 | 659 / 0 | OK |
| `124f759` (H5) | 757 / 0 | 53 / 0 | 659 / 0 | OK |
| `205deb1` (H10) | 760 / 0 | 53 / 0 | 659 / 0 | OK |
| `4b977a2` (H12, H13) | **777 / 0** | **53 / 0** | **661 / 0** | OK |

Migraciones: `migrate deploy` desde cero y `migrate diff --exit-code` sin diferencias en todos los commits (no hay cambios de schema). Hubo un intento intermedio en el que `prisma generate` falló: el backend de la prueba manual, que estaba levantado y comparte `node_modules`, tenía tomado el motor de Prisma, y Windows no deja pisar una DLL en uso. Apagué ese backend y volví a correr los siete commits desde el primero.

Línea de base en `main` (`043e3a2`): back 724, integración 51 y front 637, con build y lint OK. Lint: ningún error y los mismos 3 warnings que ya había en `main` (`set-state-in-effect` en Usuarios, Personal y Flota).

**Los tests nuevos fallan contra `main`.** Armé una copia de `main` con `git archive`, sin `.env`, y le puse encima los tests nuevos. Dos módulos que no existen en `main` llevan un stub que hace lo que hace `main`, para que los tests carguen y fallen por la regla y no por un `require`:

- `sesionService`: devuelve el token, como `main`, cuyo `autenticar` no lo llama.
- `limiteLogin`: deja pasar todo, porque `main` no tiene límite.

| Archivo | Contra `main` | Lo que falla | Lo que pasa (controles) |
| --- | --- | --- | --- |
| `sesion.test.js` | **9 de 10 fallan** | G1, G2, G3b y G6, cuenta inexistente, una sola consulta, `/auth/me` desde la base | Una cuenta activa sigue funcionando |
| `cuentas.test.js` | **19 de 31 fallan** | Todos los escenarios G1, G2, G3, G4 y G7 de H2, H3, H4, H5, H10 y contraseñas | Los controles de que lo legítimo sigue andando: editar los datos propios, cambiar el perfil a otro, un Administrador sobre un Encargado, un Encargado sobre un Chofer, contraseña con espacios adentro, bloquear a otro Encargado (sin cambios en esta tanda) |
| `login.test.js` | **7 de 12 fallan** | G8 (límite por usuario y por IP), mayúsculas, usuario inexistente, `X-Forwarded-For` inventado, ventana, comparación siempre | El mensaje ya era el mismo y los demás son controles |
| Integración | **2 de 53 fallan** | El token de una cuenta bloqueada da 401 (en `main` da 200). La carrera: el módulo no existe en `main` porque no hay ningún chequeo | Los 51 de siempre |
| `sesion.render.test.mjs` | **6 de 6 fallan** | Todo (en `main` el front nunca pide `/auth/me` ni muestra el motivo) | |
| `cuentaPropia.render.test.mjs` | **6 de 12 fallan** | Ficha propia, cuenta propia, credenciales de Encargado, solo espacios | Las fichas ajenas, que no cambian |
| `utils/sesion.test.js` | Falla | Es un módulo nuevo | |

**Prueba en el navegador.** Corrí el backend de la rama (copia de `HEAD`, sin `.env`), el front con Vite y la base de la auditoría restaurada.

Usé dos sesiones abiertas a la vez, en contextos de navegador separados, como dos computadoras, y entré por el formulario de login real. Script `prueba-navegador.mjs`; capturas en `capturas-tanda1/`.

1. **Bloquear a un chofer con la sesión abierta:**
   1. Martín (chofer) está en Mis viajes.
   2. Adriana (Administradora) le desactiva el acceso desde Usuarios.
   3. Martín toca "Dashboard" y queda en **/login con "Tu sesión venció. Iniciá sesión de nuevo."** (`1c-chofer-vuelve-al-login.png`).
2. **Bajarle el perfil a un Encargado con la sesión abierta:**
   1. Diego (Encargado) está en Viajes, con el menú Dashboard | Viajes | Flota | Mantenimiento | Documentación | Presupuestos | Personal | Usuarios.
   2. Adriana le cambia el perfil a Personal de Taller.
   3. Diego toca "Flota de vehículos": el menú pasa a Dashboard | Viajes | Flota | Mantenimiento y la sidebar dice "Personal de Taller" (`2b-encargado-despues-menu-de-taller.png`).
3. **El mismo caso, con el Encargado en una pantalla que pierde:** Lucía está en Personal cuando Adriana la pasa a Chofer, y busca en el listado.
   - Esta prueba **encontró un hueco en mi primera versión**: el `GET /personas` le daba 403, el front solo leía el token renovado en las respuestas 2xx, y Lucía seguía con el menú de Encargada. Además, el listado viejo seguía en pantalla (PL4 de la auditoría).
   - Lo corregí leyendo el token también en los errores y lo sumé al commit 1 como *fixup*, con su test.
   - Ahora Lucía termina en el Dashboard con el menú Dashboard | Mis viajes y la sidebar dice "Chofer" (`2c-encargada-en-personal-despues.png`).
4. **Límite en el login:** cinco intentos fallidos contra `cferreyra` dan "Usuario o contraseña incorrectos" y el sexto, **con la contraseña correcta**, da "Demasiados intentos. Probá de nuevo en unos minutos." (`3-login-demasiados-intentos.png`).

---

## Estado final

**Commits** en `fix/seguridad-sesion-y-cuentas`, sin pushear:

| Hash | Punto |
| --- | --- |
| `4c46fcc` | 1. La sesión de cada pedido sale de la base, no del token (H1) |
| `1f8a4ac` | 2. Siempre queda al menos un Administrador activo (H2) |
| `990975b` | 3. Nadie se da de baja, se bloquea ni se cambia el perfil a sí mismo (H3) |
| `ec07de8` | 4. El usuario y la contraseña de un Encargado solo los cambia un Administrador (H4) |
| `124f759` | 5. GET /usuarios/:id con la misma regla que la ficha de persona (H5) |
| `205deb1` | 6. La cuenta de una persona dada de baja no se activa ni cambia credenciales (H10) |
| `4b977a2` | 7. Límite de intentos de login y contraseñas sin solo espacios (H12, H13) |

No hay migraciones ni cambios de schema. Tampoco hay variables de entorno nuevas.

**Efecto del deploy sobre las sesiones abiertas**
- **Quien tiene la cuenta activa y la persona activa** sigue trabajando sin volver a iniciar sesión. Su próximo pedido pasa por la base y el token renovado ya sale con los datos de la base. Si su perfil o su habilitación habían cambiado desde que inició sesión, el cambio vale desde ese pedido. Con el front nuevo, además, el menú se actualiza solo.
- **Quien tiene la cuenta bloqueada o la persona dada de baja, y todavía conservaba una sesión viva**, queda afuera en su próximo pedido. Es justamente el agujero que cierra H1. Por ejemplo, alguien dado de baja la semana pasada que nunca cerró la app.
  - Con el front nuevo, vuelve al login con "Tu sesión venció. Iniciá sesión de nuevo.".
  - Con el front viejo, todavía cargado en una pestaña, vuelve al login sin mensaje, que era el comportamiento de antes.
- **Orden de despliegue:** Vercel (front) y Render (back) se despliegan por separado y el front suele terminar antes. Las dos combinaciones intermedias funcionan:
  - **Front nuevo con back viejo:** `/auth/me` responde el payload del token, sin nombre. El front pisa solo los campos que vienen, así que el nombre no se pierde. Lo que todavía no hay en ese momento es el corte de sesión, que llega con el back.
  - **Front viejo con back nuevo:** el front ignora el perfil del token renovado (el menú se actualiza recién en el próximo login) y los 401 lo llevan al login como siempre.
- **Contadores del límite de login:** arrancan vacíos con cada deploy o reinicio, y también si Render duerme el servicio por inactividad.
- **`trust proxy`:** solo lo usa el límite de login. Nada más del backend lee `req.ip`, `req.protocol` ni `req.hostname`. Queda pendiente la verificación en Render descrita en el punto 7.

**Lo que no hice, y por qué**
- **Fuera de alcance, por pedido:**
  - los viajes de un chofer dado de baja o deshabilitado (H6 y H7);
  - la documentación de solo consulta (H8);
  - reactivar (H9) y cambiar la propia contraseña (H11);
  - el resto de H4;
  - la ficha y el listado nuevos;
  - unificar Personal y Usuarios;
  - recortar los datos de un Administrador que maneja en Documentación (ver el punto 5).
- **El `trust proxy` en Render real:** no hice deploy. Está verificado contra una réplica local de la topología documentada y queda el procedimiento para confirmarlo en producción.
- **Node:** el CI usa Node 22; localmente corrí Node 24.

**Decisiones que conviene revisar con el equipo**
- Que un Encargado no pueda cambiar su propia contraseña hasta que exista H11 (punto 4).
- El tope de 20 intentos por IP en vez de 5 (punto 7).
- Al editar, mandar la contraseña vacía ahora da error en vez de ignorarse. El front no la manda vacía.
- Desde H3, si la única Administradora necesita que la habiliten para conducir, lo tiene que hacer otro Administrador.

**Entorno al terminar.** Apagué el backend, el front y la base del scratchpad. El árbol de trabajo quedó limpio, salvo `docs/auditoria-ux/`, que no se commitea.
