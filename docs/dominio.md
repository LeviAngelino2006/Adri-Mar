# Reglas de Negocio del Dominio – Adri-Mar Gestión

Este documento sintetiza las reglas de negocio, flujos y políticas operativas del sistema de gestión de flota, viajes especiales y mantenimiento para la empresa de transporte de pasajeros **Adri-Mar** (Río Tercero, Córdoba).

---

## 1. Flota y Vehículos

### 1.1. Identificación y Registro
- Cada unidad vehicular posee los siguientes atributos obligatorios:
  - **Dominio (Patente):** Formato argentino oficial (`ABC123` o `AB123CD`), único en el sistema.
  - **Número de Interno:** Identificador numérico de la unidad en la empresa (habitualmente del 1 al 24).
  - **Marca y Modelo:** Descripción del chasis y carrocería.
  - **Año de Fabricación:** Valor numérico no futuro.
  - **Cantidad de Asientos:** Capacidad nominal de pasajeros sentados.
  - **Kilometraje Actual:** Valor numérico mayor o igual a 0.
- **Tipos de Vehículo:**
  - `Colectivo` (ómnibus de media y larga distancia).
  - `Minibús` (24 asientos).
  - `Tráfic / Combi` (17 a 19 asientos).
  - `Utilitario` (vehículo liviano de apoyo logístico y auxilio).

### 1.2. Estados del Vehículo
- `OPERATIVO`: Unidad en condiciones técnicas y habilitada para circular y realizar viajes.
- `EN_TALLER`: Unidad en mantenimiento, service o reparación mecánica. No puede ser asignada a viajes programados.
- `DADO_DE_BAJA`: Unidad retirada de servicio activo. La baja es lógica: se registra `fechaBaja`, se preserva todo su historial de viajes y documentos, y no puede modificarse ni asignarse a nuevas operaciones.

---

## 2. Mantenimiento Preventivo y Taller

La pantalla tiene tres pestañas: **Service** (estado de cada vehículo y registrar un service), **Arreglos** (registrar cualquier otro trabajo) e **Historial** (services y arreglos de toda la flota). Los perfiles ADMINISTRADOR, ENCARGADO y PERSONAL_TALLER la usan; el CHOFER no.

### 2.1. Frecuencia y Disparadores de Service
- **Intervalo por tipo de vehículo** (tabla `plantillas_mantenimiento`, una por tipo):
  - **Colectivos:** cada **20.000 km**.
  - **Minibuses:** cada **20.000 km**.
  - **Tráfics / Combis:** cada **15.000 km**.
  - **Utilitarios:** cada **10.000 km**.
- **Asignación del plan:** el alta de un vehículo le crea el plan con la plantilla de su tipo. El formulario de alta tiene un campo opcional "Km del último service" (útil para los adquiridos usados); si queda vacío, se toma el kilometraje de alta. Si se edita el tipo del vehículo, el plan pasa a la plantilla del tipo nuevo y conserva el km del último service; si el tipo nuevo no tiene plantilla, el plan se desactiva (Sin plan). Los vehículos cargados antes de este cambio recibieron su plan con la migración `20261023200000_asignar_planes_mantenimiento`, tomando el odómetro como último service.
- **Plan del vehículo** (`planes_mantenimiento`): guarda solo el km del último service. El km del próximo service (último + intervalo) y el estado **no se guardan, se calculan** en `calcularEstadoService` (`backend/src/utils/estadoService.js`), así un cambio de intervalo no deja planes desactualizados.
- **Estados del service:**
  - **Al día:** todavía no llegó al aviso.
  - **Próximo:** recorrió el **95 % del intervalo** desde su último service (`porcentaje_aviso` de la plantilla). Un colectivo avisa a los 19.000 km; una Trafic, a los 14.250; un utilitario, a los 9.500.
  - **Vencido:** recorrió el intervalo completo.
  - **Sin plan:** el vehículo no tiene plan activo (solo pasa si su tipo no tiene plantilla). Se le asigna uno indicando a qué km fue su último service (por defecto, el odómetro actual), o se crea solo al registrarle el primer service.
- **Urgencia:** la lista se ordena por la fracción del intervalo recorrida, no por km restantes (900 km restantes son el 4,5 % de un colectivo pero el 9 % de un utilitario).
- **Vehículos dados de baja:** no aparecen en Service ni en los selectores y no generan alertas. Su historial se conserva.
- **Advertencia en viajes:** al planificar un viaje, si con los km estimados el vehículo pasa su service (o ya lo pasó), el formulario lo avisa. Es informativo: no bloquea.
- **Disparador por fecha:** no aplica; el service se dispara solo por kilometraje. `TODO: completar por el equipo` si se decide sumar un tiempo límite.

### 2.2. El Service
- Es un **paquete fijo**: cambio de aceite; filtros de gasoil, aceite y habitáculo (aire acondicionado); alineado y balanceado; revisión general del motor. Se muestra como lista informativa: no se tilda, porque siempre se hace completo.
- Se registra con **fecha, km del odómetro y observación**. Costo y responsable no se cargan por ahora (las columnas `costo` y `taller_mecanico` quedan en la base).
- **Reinicia el conteo:** el km del último service pasa a ser el del service registrado. Un service viejo (con menos km que el último) se guarda en el historial pero **no** baja el conteo.

### 2.3. Arreglos
- Cualquier trabajo que no es el service, de **uno o más** tipos del catálogo `tipos_arreglo`: Engrase, Rotación de cubiertas (se recomienda cada 10.000 km, pero no genera alerta), Cambio de cubiertas, Frenos, Batería y electricidad, Chapa y pintura, Mecánica general y Otro. Los tipos de cada arreglo se guardan en la tabla intermedia `mantenimiento_tipos_arreglo` (por ejemplo, "Engrase + Cambio de cubiertas" es un solo registro).
- "Otro" se puede combinar con los demás tipos y, si está marcado, exige indicar qué trabajo se hizo ("¿Qué trabajo?", hasta 60 caracteres, `requiere_detalle`). Se guarda en `mantenimiento_tipos_arreglo.detalle` y el historial lo muestra en lugar de "Otro" ("Engrase + Cambio de espejo"). La descripción del arreglo es opcional. Los arreglos con "Otro" cargados antes no tienen detalle y siguen mostrando "Otro". Un tipo que se deja de usar se desactiva (`activo`), no se borra.
- Se registra con fecha, km, descripción, quién hizo el trabajo (texto libre: mecánico, chapista o taller), repuestos y observaciones. Sin costo por ahora.
- Los arreglos **no reinician el conteo del service ni generan alertas**.

### 2.4. Reglas comunes e Historial
- Service y arreglo se guardan en la misma tabla (`mantenimientos_realizados`): un registro es un service (sin tipos de arreglo) o un arreglo (con al menos un tipo), nunca los dos. Lo valida `mantenimientoService`.
- La fecha es un día de Córdoba y no puede ser posterior a hoy. El vehículo no puede estar dado de baja.
- Si el km cargado supera al odómetro del vehículo, se registra una lectura de odómetro con origen `MANTENIMIENTO` (ver §3.1), con la misma regla de "no retroceder".
- El historial muestra toda la flota (también los dados de baja), del más reciente al más antiguo, con buscador por vehículo, filtros (tipo de registro, tipo de arreglo —trae los arreglos que incluyen ese tipo—, tipo de vehículo, fechas), orden y paginado de a 30.
- No hay órdenes de trabajo ni estados de una orden: se registra el trabajo ya hecho.

---

## 3. Odómetro y Control de Kilometraje

### 3.1. Orígenes de Lectura
Toda lectura de odómetro (`LecturaOdometro`) debe asociarse a un vehículo y a uno de los siguientes orígenes:
- `ALTA_VEHICULO`: Kilometraje inicial al registrar la unidad en el sistema.
- `INICIO_VIAJE`: Kilometraje registrado al momento de iniciar un viaje.
- `FIN_VIAJE`: Kilometraje registrado al finalizar el viaje (debe ser mayor o igual al inicial).
- `MANUAL`: Lectura ingresada por personal de taller o administración para calibración periódica.
- `CORRECCION`: Ajuste administrativo de una lectura previa errónea.
- `MANTENIMIENTO`: Kilometraje de un service o un arreglo, cuando supera al odómetro del vehículo.

### 3.2. Regla de Consistencia y Correcciones
- El kilometraje de un vehículo es monótono creciente (no puede retroceder en operaciones normales).
- Ante errores humanos de tipeo, una lectura no se elimina físicamente: se registra una nueva lectura de origen `CORRECCION` referenciando a `lecturaCorregidaId` con un motivo explicativo obligatorio.

---

## 4. Gestión Documental y Vencimientos

### 4.1. Semáforo y Estados de Vigencia
Para cada documento reglamentario, el sistema calcula dinámicamente su estado:
- `VIGENTE`: Documento cargado y al día, con más días restantes que los días de aviso de su tipo (o sin vencimiento requerido).
- `POR_VENCER`: Documento que vence dentro de los días de aviso de su tipo (`0 <= días_restantes <= diasAviso`). Requiere gestión de renovación.
- Los días de aviso se configuran por tipo en `tipos_documento.dias_aviso`: **30 días** para todos, salvo el comprobante de pago del seguro, que avisa con **5 días**.
- `VENCIDO`: Documento cuya fecha de vencimiento ya expiró (`días_restantes < 0`).
- `PENDIENTE`: Documento reglamentario obligatorio que aún no ha sido cargado en el sistema.

### 4.2. Documentos de Vehículos (`DocumentoVehiculo`)
| Tipo de Documento | Requiere Vencimiento | Requiere Archivo PDF | Observaciones |
| :--- | :---: | :---: | :--- |
| **Póliza de seguro** | Sí | Sí | Cobertura integral contratada |
| **Certificado de cobertura** | Sí | Sí | Emitido por la aseguradora para controles viales |
| **Comprobante de pago de seguro** | Sí (mensual, aviso 5 días) | Sí | Último recibo o cupón de pago cancelado |
| **Inspección Técnica Vehicular (ITV)** | Sí | Sí | Habilitación técnica obligatoria para circular |
| **Control de Matafuegos** | Sí | No | Oblea/tarjeta física inspeccionada |
| **Título del automotor** | No | Sí | Documento de propiedad dominial |
| **Cédula de identificación (Tarjeta Verde)** | No | Sí | Identificación oficial del vehículo |
| **Certificado de alta de transporte** | No | Sí | Permiso de habilitación de servicio público |

### 4.3. Documentos de Choferes (`DocumentoChofer`)
| Tipo de Documento | Requiere Vencimiento | Requiere Archivo PDF | Observaciones |
| :--- | :---: | :---: | :--- |
| **Licencia de conducir profesional** | Sí | Sí | Carnet habilitante profesional con categoría de pasajeros |
| **DNI del chofer** | Sí | Sí | Identificación oficial. Pasó a tener vencimiento en la migración `20261011120000_dni_chofer_con_vencimiento` |

> El **Examen psicofísico** existió como tipo de documento y se eliminó en la migración `20261009044602_dias_aviso_tipos_documento`.

### 4.4. Regla de Historial Máximo y Purga de Archivos
- Por cada tipo de documento de un vehículo o chofer, el sistema mantiene un historial de hasta **2 archivos antiguos + 1 archivo vigente actual** (máximo 3 documentos en total).
- Al subir una renovación que exceda este límite, se purga de forma irreversible el documento histórico más antiguo tanto del registro en base de datos como del almacenamiento en la nube (Supabase Storage).
- **Renovación conservando archivo:** Se permite actualizar fechas o notas sin obligar a subir un nuevo PDF si el documento previo continúa utilizando el mismo comprobante.

---

## 5. Gestión de Viajes Especiales

### 5.1. Ciclo de Vida del Viaje
```
[ Crear Viaje ] ──> A_CONFIRMAR ──> [ Confirmar ] ──> PROGRAMADO ──> [ Iniciar ] ──> EN_VIAJE ──> [ Finalizar ] ──> FINALIZADO
                          │                                │
                          └──> [ Cancelar ] ───────────────┴──> CANCELADO
```

- `A_CONFIRMAR`: Estado inicial obligatorio al crear un viaje. Permite precargar clientes, origen, destino, paradas intermedias, precio y múltiples choferes y vehículos candidatos. La `fechaInicio` es obligatoria. No bloquea disponibilidad ni genera solapamientos.
- `PROGRAMADO`: Viaje ratificado con 1 chofer asignado, 1 vehículo asignado, fecha de fin y kilometraje estimado. Requiere validación de disponibilidad operativa completa.
- `EN_VIAJE`: El chofer inició el recorrido e ingresó el odómetro de salida.
- `FINALIZADO`: Recorrido concluido con registro de odómetro de llegada y observación final.
- `CANCELADO`: Viaje anulado administrativamente.

### 5.2. Reglas de Validación Operativa para Confirmar
Para pasar un viaje a `PROGRAMADO`, el sistema valida:
1. El chofer asignado debe tener perfil Chofer, estar activo y tener `habilitadoParaConducir = true`.
2. El vehículo asignado debe estar en estado `OPERATIVO` (no `EN_TALLER` ni `DADO_DE_BAJA`).
3. Ni el chofer ni el vehículo pueden solaparse en horario con otro viaje en estado `PROGRAMADO` o `EN_VIAJE`.
4. Al confirmarse en una única transacción atómica, se eliminan los candidatos preliminares de la base de datos (decisión de negocio: no se preservan candidatos).

### 5.3. Recorrido, Paradas Intermedias y Rutas
- Todo viaje requiere una ubicación de `origen` y una de `destino` (gestionadas con catálogo normalizado).
- Se admiten entre **0 y 9 paradas intermedias ordenadas** (`ViajeParada`).
- No pueden existir puntos consecutivos idénticos en la secuencia `[origen, ...paradas, destino]`.
- Se permite recorrido de "ida y vuelta" (`origen == destino`) únicamente si existe al menos una parada intermedia válida entre ellos.
- Generación automática de enlace a **Google Maps** con waypoints. Cada punto va por su `placeId` de Google si lo tiene (`origin_place_id`, …), si no por sus coordenadas y, en último caso, por su nombre: el chofer llega a la dirección exacta.
- **Ubicaciones FRECUENTES y PARTICULARES** (`esFrecuente`). Las frecuentes (localidades de Georef, aeropuerto, colegios, hoteles) aparecen en el buscador; las particulares (la casa de un pasajero) se crean al elegir una dirección de Google, se llaman como esa dirección, no aparecen en el buscador y no tienen `nombreNormalizado`. Elegir dos veces la misma dirección no duplica la fila (`placeId` único). Una dirección de Google se puede guardar como frecuente con el check "Guardar como frecuente".
- Las localidades de Córdoba vienen de Georef (`scripts/importarLocalidadesCordoba.js`, con `georefId` y sus coordenadas). De Google solo se guarda el `placeId`: sus términos limitan guardar coordenadas (30 días) y direcciones.
- **Km estimados:** "Calcular km" pide a la Routes API de Google la ruta en auto (origen → paradas → destino), cada punto por `placeId` o por coordenadas, sin interpretar nombres. Coinciden con la ruta que muestra el link de Google Maps. Si alguna ubicación no tiene ni `placeId` ni coordenadas, responde 422 con cuáles y el formulario ofrece ubicarla con el buscador de Google. Si no hay ruta en auto, prueba el recorrido tramo por tramo y responde 422 con el primer tramo que falla ("No hay una ruta en auto entre «A» y «B»"); cada tramo es otra llamada a Google y cuenta para el tope diario. Es una ayuda: el campo sigue siendo editable y guardar el viaje no depende del cálculo.
- **Costo de Google:** el selector consulta a Google solo si ninguna frecuente coincide con lo escrito o si el usuario toca "Buscar dirección en Google"; elegir una frecuente no llama a Google. Hay un tope diario propio por tipo de llamada (`GOOGLE_LIMITE_DIARIO_*`). Si Google no está disponible (sin key, tope, caído), el selector ofrece "+ Crear «X»" por nombre y esa ubicación se ubica después con "Ubicarla".

### 5.4. Notificación al Chofer por WhatsApp
- Se genera un link directo `https://wa.me/<telefono>?text=...` con el teléfono del chofer en formato internacional E.164 (`549...`).
- El mensaje incluye: saludo personalizado, fecha y horario en hora de Córdoba (UTC-3), interno del colectivo asignado, recorrido detallado con paradas intermedias, cantidad de pasajeros (si fue informada) y enlace a la ruta en Google Maps.

### 5.5. Aspectos Económicos y de Cobranza
- **Cliente:** Precio total acordado, estado de pago (`PENDIENTE`, `PAGADO`, `PARCIAL`), fecha de cobro y método de pago (`EFECTIVO`, `BANCO`, `CHEQUE`).
- **Chofer:** Importe de viático/honorario convenido, estado de pago al chofer, fecha de liquidación y método de pago.
- La información financiera es visible exclusivamente para roles `ADMINISTRADOR` y `ENCARGADO`.

---

## 6. Usuarios, Perfiles y Seguridad

### 6.1. Perfiles y Permisos
- `ADMINISTRADOR`: Gestión global de usuarios, vehículos, documentación, viajes, finanzas y configuración.
- `ENCARGADO`: Coordinación logística, asignación y confirmación de viajes, gestión de candidatos, despacho y consulta documental.
- `PERSONAL_TALLER`: Visualización de flota, consulta de fichas técnicas, inspección de odómetro y documentación de unidades. Sin acceso a datos económicos ni a candidatos.
- `CHOFER`: Visualización exclusiva de "Mis Viajes" (viajes asignados en estado `PROGRAMADO` o `EN_VIAJE`), registro de odómetro inicial/final y consulta de su propia documentación.

### 6.2. Autenticación y Sesión
- Autenticación mediante tokens JWT firmados.
- Renovación en cada petición (sliding expiration).
- Expiración de sesión por inactividad configurable en `.env`:
  - Choferes: `SESSION_TTL_CHOFER_MIN` (por defecto 720 minutos / 12 horas para turnos de manejo).
  - Otros perfiles: `SESSION_TTL_OTROS_MIN` (por defecto 60 minutos / 1 hora).
- Contraseñas almacenadas exclusivamente como hashes con `bcrypt` (mínimo 8 caracteres). Mensajes de error genéricos para mitigar enumeración de cuentas.
