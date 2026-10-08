# Relevamiento y Estructuración de Información Adicional – Sistema Adri-Mar

Documento consolidado a partir de los archivos de relevamiento, notas de campo y planillas operativas ubicadas en la carpeta `Informacion adicional`. Reúne las reglas de negocio, requerimientos operativos, documentación vehicular y flujos de trabajo para la empresa de transporte de pasajeros **Adri-Mar** (Río Tercero, Córdoba).

---

## 1. Información General y Flota de Vehículos

### 1.1. Dimensión de la Flota
- **Total de unidades activas:** 24 vehículos (habitualmente numerados del coche 1 al 24, con refuerzos o unidades especiales puntuales).
- **Control de Kilometraje:** El seguimiento estricto del odómetro es crítico tanto para el mantenimiento preventivo como para la facturación y control de viajes.
- **Sistema actual de seguimiento GPS:** Utilizan **Easytrack**, plataforma telemática que registra los kilómetros reales recorridos. El personal configura umbrales de kilometraje para recibir alertas de service preventivo. Al completar un mantenimiento, se registra la intervención para actualizar y calibrar el kilometraje de referencia.

### 1.2. Tipologías de Vehículos y Frecuencia de Services
La frecuencia del mantenimiento preventivo (cambio de aceite, filtros, alineación y revisión general) varía según la tipología del vehículo:

| Tipo de Vehículo | Capacidad / Asientos | Frecuencia de Service Programado | Notas Operativas |
| :--- | :--- | :--- | :--- |
| **Colectivo** | Ómnibus larga distancia / media distancia | Cada **20.000 km** | Uso intensivo en viajes interurbanos y especiales |
| **Minibús** | 24 asientos | Cada **20.000 km** | Viajes especiales grupales y charters |
| **Tráfic / Combi** | 17 y 19 asientos | Cada **15.000 km** | Servicios rápidos y traslados medianos |
| **Utilitario** | Apoyo operativo / logística interna | Cada **10.000 km** | Vehículos ligeros de auxilio y gestión |

---

## 2. Gestión y Control Documental

Se requiere una estructura organizada en formato digital (tipo legajo por vehículo y chofer) para almacenar y controlar la vigencia de toda la documentación reglamentaria ante inspecciones de tránsito, CNRT, ITV o requerimientos de clientes.

### 2.1. Legajo Digital del Vehículo (Carpeta por Coche)
Cada unidad debe poseer un repositorio digital con los siguientes documentos y controles:

| Documento | Formato / Requisito | Control de Vencimiento | Observaciones |
| :--- | :--- | :--- | :--- |
| **Póliza de Seguro** | Archivo PDF | **Sí vence** | Cobertura contratada vigente |
| **Certificado de Cobertura** | Archivo PDF | **Sí vence** | Resumen oficial emitido por la aseguradora |
| **Comprobante de Pago de Seguro** | Archivo PDF / Comprobante | **Mensual** | Debe mantenerse siempre el último pago al día |
| **ITV (Inspección Técnica Vehicular)** | Archivo PDF | **Sí vence** | Obligatorio para circular; alerta previa al vencimiento |
| **Matafuegos / Extintores** | Registro de fecha | **Sí vence** | Generalmente no posee PDF; se audita la tarjeta/oblea y su fecha de vencimiento |
| **Título del Vehículo** | Archivo PDF | No vence | Documento dominial registral |
| **Tarjeta Verde / Cédula de Identificación** | Archivo PDF | No vence | Identificación oficial del automotor |
| **Certificado de Alta de Unidad / Transporte** | Archivo PDF | No vence | Habilitación de la unidad ante la autoridad de transporte |

### 2.2. Legajo del Personal de Choferes
Documentación individual requerida para habilitar la asignación de viajes:
1. **Licencia de Conducir:** Carnet habilitante profesional con categoría para transporte de pasajeros. Requiere control riguroso de fecha de vencimiento.
2. **DNI (Documento Nacional de Identidad):** Copia digital para verificación de identidad y constancias ante entes de control.
3. **Propósito del módulo:** Envío ágil de constancias y pólizas ante controles camineros o solicitud formal de clientes antes de iniciar un viaje.

---

## 3. Mantenimiento, Taller y "Ficha Médica" del Vehículo

### 3.1. Diagnóstico del Estado Actual
- **Arreglos menores (chicos):** Actualmente no se registran en ningún soporte, ocasionando pérdida de trazabilidad sobre repuestos y desgastes cotidianos.
- **Arreglos mayores:** Se anotan de manera manual e informal en un cuaderno físico dentro del taller/galpón.
- **Mano de obra:** Se cuenta con mecánicos y un chapista externos que prestan servicio por trabajo realizado (tercerizados).
- **Gestión de insumos:** Para optimizar costos, se compran **tambores de aceite y lotes de filtros al por mayor** en galpón.

### 3.2. Requerimiento: "Ficha Médica" (Historial Clínico del Coche)
El sistema debe centralizar el historial de vida útil e intervenciones mecánicas de cada colectivo:
- **Datos obligatorios por intervención:**
  - Fecha del trabajo.
  - Kilometraje exacto del odómetro en el momento de la intervención.
  - Tipo de intervención (Preventivo programado vs. Correctivo).
  - Detalle de tareas realizadas y repuestos empleados.
  - Responsable / Proveedor (mecánico o chapista interviniente) y costo de mano de obra.
- **Tareas habituales del Service Preventivo:**
  1. Cambio de aceite de motor.
  2. Sustitución de filtros (aceite, aire, combustible).
  3. Alineación y balanceo del tren delantero y neumáticos.
  4. Revisión general del motor, frenos y fluidos.

---

## 4. Operaciones en Ruta, Contingencias y Botón de Auxilio

### 4.1. Protocolo de Avería / Extravío de Coche en Ruta
En caso de que un vehículo quede varado, extraviado o presente desperfectos mecánicos durante un trayecto:
1. **Resolución en ruta:** El chofer intenta solucionar el inconveniente menor in situ reportando a la central lo sucedido.
2. **Auxilio y transbordo:** En caso de falla grave que impida continuar, el chofer solicita auxilio inmediato y se despacha otra unidad para realizar el transbordo de pasajeros y completar el recorrido.

### 4.2. Requerimiento: Botón de Auxilio para el Chofer
- Se solicita la inclusión de un **Botón de Auxilio / Pánico** en la interfaz móvil o panel del conductor.
- **Comportamiento:** Al ser presionado ante una emergencia o avería en carretera, emite una alerta prioritaria instantánea a la base operativa (Logística/Administración) y a los coches cercanos para coordinar asistencia mecánica y auxilio de pasaje.

---

## 5. Gestión de Viajes Especiales (Contratados / Chárter)

A diferencia de las líneas regulares con horarios fijos, los **Viajes Especiales** representan traslados a demanda contratados por escuelas, instituciones, clubes, contingentes o particulares.

### 5.1. Dinámica de Carga y Ciclo de Vida del Viaje
- **Carga progresiva de datos:** Los datos no se cargan todos de una sola vez. Es habitual ingresar una reserva con datos parciales (ej. fecha preliminar y cliente) y completar los detalles (coche, chofer, kilometraje, tarifa) a medida que se confirma la logística.
- **Confirmación de viajes futuros:** Muchos viajes a futuro se terminan de definir y coordinar el día anterior a la salida.

### 5.2. Campos Requeridos para el Registro de un Viaje Especial
1. **Fecha y Hora de Salida:** Momento programado de partida.
2. **Origen:** Punto o terminal de partida exacto para notificación al chofer.
3. **Destino:** Localidad o punto final del recorrido.
4. **Chofer Asignado:** Conductor responsable.
5. **Número de Coche:** Unidad vehicular asignada (Interno).
6. **Valor del Viaje (Precio):** Monto total convenido con el cliente.
7. **Cliente:** Razón social, institución educativa, empresa o particular contratante.
8. **Kilometraje:** Kilómetros estimados y reales recorridos.
9. **Importe Chofer:** Viático, remuneración o comisión liquidada al chofer por el servicio.
10. **Método de Pago y Fecha de Cobro:** Medio de cobro del cliente y fecha en la que se efectivizó el pago.

### 5.3. Métodos de Pago Habilitados
- **Efectivo**
- **Banco (Transferencia bancaria / depósito)**
- **Cheque**

### 5.4. Funcionalidades Complementarias Necesarias
- **Consultas y Filtros:** Búsqueda flexible de viajes por fecha, cliente, chofer, coche o estado de cobro.
- **Lista de Pasajeros:** Módulo para cargar o adjuntar la nómina de pasajeros transportados (requerimiento de seguro y fiscalización vial).
- **Despacho y Notificación al Chofer:** Envío o visualización clara para el chofer con los 4 datos operativos esenciales:
  - Lugar de Origen
  - Destino
  - Fecha y Hora de Salida
  - Número de Coche asignado

---

## 6. Análisis del Registro Histórico Operativo (`ESPECIALES VIAJES.xlsx`)

La planilla `ESPECIALES VIAJES.xlsx` contiene el historial operativo real de la empresa:
- **Volumen de datos:** Más de 2.520 viajes especiales registrados entre **mayo de 2022 y fines de 2026**.
- **Estructura tabular de la planilla:**
  - `FECHA`: Fecha de realización del viaje.
  - `VIAJE`: Trayecto descriptivo (ej. *"DALMACIO - VILLA MARÍA"*, *"RÍO TERCERO - CÓRDOBA"*, *"CORRALITO - ELENA"*, *"HERNANDO - CÓRDOBA"*).
  - `COCHE`: Identificador de la unidad (internos 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24; e internos complementarios).
  - `KM`: Kilómetros recorridos por viaje (utilizado para control de combustible, odómetro y tarifas).
  - `CHOFER`: Nombre o apodo del conductor (más de 50 conductores registrados históricamente: *Ruiz, Governatori, Ricky, Pipo, Claudio, José, etc.*).
  - `VALOR VIAJE`: Precio final facturado al cliente.
  - `CLIENTE`: Contratante del servicio (más de 200 clientes históricos, entre colegios, municipios, clubes y empresas: *ENET, Azteca, 25 de Mayo, Crisppy, Maxi Bonardo, etc.*).
  - `PAGO`: Estado del cobro al cliente (`PAGADO`, montos pendientes `DEBE $...`).
  - `IMPORTE CHOFER`: Monto de honorario/viático correspondiente al conductor.
  - `ESTADO PAGO CHOFER` (Columna J): Estado de acreditación al conductor (`PAGADO` / pendiente).
  - `DIA` (Columna K): Fecha de liquidación y pago efectivo al chofer.

---

## 7. Matriz de Requerimientos Funcionales y Reglas de Negocio

A partir de los puntos anteriores, se sintetizan las siguientes necesidades para el desarrollo del sistema:

| ID | Área | Requerimiento / Regla de Negocio | Impacto en el Sistema |
| :--- | :--- | :--- | :--- |
| **RF-01** | Flota | Mantener catálogo de 24 vehículos clasificados por tipo (Colectivo, Minibús, Tráfic, Utilitario) con sus capacidades. | Modelo `Vehiculo`, vistas de flota. |
| **RF-02** | Mantenimiento | Alertas de service preventivo por umbral de kilometraje (10k, 15k, 20k km según tipo) integrando o sincronizando datos de odómetro/Easytrack. | Módulo de Alertas y Taller. |
| **RF-03** | Mantenimiento | Registro digital de intervenciones mecánicas ("Ficha Médica"): fecha, km, trabajos, repuestos y profesional interviniente (mecánico/chapista). | Entidad `HistorialMantenimiento`. |
| **RF-04** | Documentación | Repositorio de documentos vehiculares con control de semáforo de vencimientos (Póliza, ITV, Matafuego, Certificados). | Entidad `DocumentoVehiculo` y alertas de expiración. |
| **RF-05** | Documentación | Legajo digital de choferes con control de vigencia de Licencia de Conducir y DNI. | Entidad `DocumentoChofer` / Perfil Chofer. |
| **RF-06** | Choferes / Ruta | Botón de auxilio para notificación inmediata de incidentes o roturas en carretera a la base y coches cercanos. | WebSockets / Notificaciones push / Alerta de emergencia. |
| **RF-07** | Viajes Especiales | Gestión integral de viajes especiales con carga progresiva de datos (origen, destino, coche, chofer, tarifa, viático chofer, km). | CRUD de Viajes Especiales y estados de viaje. |
| **RF-08** | Finanzas | Registro de medios de pago (efectivo, banco, cheque), seguimiento de cuentas corrientes de clientes y liquidación de viáticos a choferes. | Módulo de cobros y pagos. |
| **RF-09** | Logística | Consulta y despacho operativo al chofer con origen, destino, horario de salida y número de coche asignado. | Vista móvil "Mis Viajes" del Chofer. |
| **RF-10** | Pasajeros | Registro y exportación de la lista de pasajeros asociados a cada viaje especial. | Submódulo de nómina de pasajeros. |
