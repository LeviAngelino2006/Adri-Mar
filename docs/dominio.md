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

### 2.1. Frecuencia y Disparadores de Service
- **Estado en código:** El modelo de planes y órdenes de mantenimiento se encuentra planificado para la siguiente etapa (`TODO: SCRUM-34`). En el código actual existe el registro de odómetro con origen `MANTENIMIENTO` y la validación comentada en `viajeService.js:440`.
- **Regla operativa por kilometraje (según relevamiento de campo):**
  - **Colectivos:** Service programado cada **20.000 km**.
  - **Minibuses:** Service programado cada **20.000 km**.
  - **Tráfics / Combis:** Service programado cada **15.000 km**.
  - **Utilitarios:** Service programado cada **10.000 km**.
- **Disparador por fecha:** `TODO: completar por el equipo` (definir si aplica criterio de tiempo límite si el kilometraje no se alcanza).
- **Anticipación de alertas de service:** `TODO: completar por el equipo` (definir margen en kilómetros o días para emitir alerta amarilla de service próximo).

### 2.2. Tareas del Mantenimiento Preventivo
- Cambio de aceite de motor y reposición de fluidos.
- Sustitución de filtros (aceite, aire y combustible).
- Alineación, balanceo y rotación de neumáticos.
- Revisión general de motor, tren delantero y sistema de frenos.

### 2.3. Ficha Médica e Historial Clínico
- Registro de fecha y kilometraje exacto de la intervención.
- Clasificación entre mantenimiento preventivo vs. correctivo/rotura.
- Detalle de repuestos utilizados y mano de obra de mecánicos/chapistas tercerizados.
- `TODO: completar por el equipo` (definir estados específicos de una orden de mantenimiento: ej. Pendiente, En Taller, Finalizada).

---

## 3. Odómetro y Control de Kilometraje

### 3.1. Orígenes de Lectura
Toda lectura de odómetro (`LecturaOdometro`) debe asociarse a un vehículo y a uno de los siguientes orígenes:
- `ALTA_VEHICULO`: Kilometraje inicial al registrar la unidad en el sistema.
- `INICIO_VIAJE`: Kilometraje registrado al momento de iniciar un viaje.
- `FIN_VIAJE`: Kilometraje registrado al finalizar el viaje (debe ser mayor o igual al inicial).
- `MANUAL`: Lectura ingresada por personal de taller o administración para calibración periódica.
- `CORRECCION`: Ajuste administrativo de una lectura previa errónea.
- `MANTENIMIENTO`: Kilometraje registrado al completar un service en taller.

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
- **Km estimados:** "Calcular km" pide a la Routes API de Google la ruta en auto (origen → paradas → destino), cada punto por `placeId` o por coordenadas, sin interpretar nombres. Coinciden con la ruta que muestra el link de Google Maps. Si alguna ubicación no tiene ni `placeId` ni coordenadas, responde 422 con cuáles y el formulario ofrece ubicarla con el buscador de Google. Es una ayuda: el campo sigue siendo editable y guardar el viaje no depende del cálculo.

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
