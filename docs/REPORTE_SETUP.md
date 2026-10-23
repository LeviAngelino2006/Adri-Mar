# Reporte de Setup y Preparación para Claude Code

**Fecha:** 14 de octubre de 2026  
**Proyecto:** Adri-Mar Gestión (Seminario Integrador 3K1, Grupo 6 - UTN FRC)  
**Objetivo:** Configuración de contexto, reglas de negocio y estándares para el trabajo con Claude Code.

---

## 1. Archivos Creados y Modificados

| Archivo | Tipo de Acción | Descripción |
| :--- | :--- | :--- |
| `CLAUDE.md` | **Creado** | Archivo de contexto principal en la raíz del repositorio siguiendo la plantilla oficial (qué es el sistema, stack, reglas de negocio, estructura, comandos, convenciones y pautas de trabajo). |
| `docs/README.md` | **Creado** | Índice centralizado que organiza y referencia todos los documentos técnicos, operativos y de diseño disponibles en el proyecto. |
| `docs/dominio.md` | **Creado** | Documento exhaustivo con las reglas de negocio del dominio deducidas del código fuente y relevamiento (flota, odómetro, documentación, viajes especiales, seguridad y mantenimiento). |
| `docs/REPORTE_SETUP.md` | **Creado** | Este reporte con el diagnóstico técnico, acciones realizadas, pasos manuales y análisis de riesgos. |
| `.gitignore` | **Modificado** | Reforzado para ignorar de manera exhaustiva archivos de entorno (`.env`, `.env.*` preservando `!.env.example`) y archivos de credenciales/claves (`*.pem`, `*.key`, `*.cert`, `*.crt`, `*.pfx`, `*.p12`, `credentials.json`, `*service-account*.json`). |

---

## 2. Elementos Marcados como `TODO` y Responsables

1. **Módulo de Mantenimiento Preventivo y Planes (`SCRUM-34`):**
   - *Detalle:* El código actual cuenta con el origen de odómetro `MANTENIMIENTO` y la referencia comentada en `viajeService.js:440`, pero no posee aún la tabla ni los modelos de planes de mantenimiento, tareas de service u órdenes de taller en Prisma.
   - *Quién debe completarlo:* El equipo de desarrollo (backend/frontend) durante la implementación de la User Story `SCRUM-34`.
2. **Estados de Mantenimiento:**
   - *Detalle:* Resta formalizar el ciclo de vida de una orden o intervención de service (ej. `PENDIENTE`, `EN_TALLER`, `FINALIZADO`).
   - *Quién debe completarlo:* Equipo de desarrollo al diseñar el modelo de datos en Prisma.
3. **Criterios complementarios de disparo de service preventivo:**
   - *Detalle:* Se dedujeron los umbrales de kilometraje (20.000 km colectivos y minibuses, 15.000 km tráfics, 10.000 km utilitarios), pero queda por definir si se aplicará un disparador por tiempo calendario (ej. cada 6 meses si no alcanza los km) y la ventana de anticipación para las alertas visuales preventivas.
   - *Quién debe completarlo:* El equipo de analistas/desarrolladores en consulta con la empresa Adri-Mar.

---

## 3. Pasos Manuales Pendientes para el Equipo

### 3.1. GitHub CLI (`gh`)
- Al verificar `gh auth status`, se detectó que el CLI de GitHub no está instalado o no se encuentra en el `PATH` del sistema.
- **Acción requerida:**
  1. Instalar GitHub CLI (por ejemplo en Windows con: `winget install --id GitHub.cli`).
  2. Ejecutar `gh auth login` en la terminal para autenticar la cuenta de GitHub del desarrollador.

### 3.2. Integración de Jira con Claude Code (vía MCP)
- No se configuró Jira de manera automatizada.
- **Acción requerida:**
  1. Seguir la documentación oficial de Claude Code (https://docs.claude.com) para habilitar el servidor MCP de Atlassian Jira.
  2. Adoptar de forma uniforme la convención de ramas y commits basada en la clave de Jira del proyecto: `SCRUM` (ejemplo de rama: `feature/SCRUM-42-alta-de-vehiculos`, ejemplo de commit: `SCRUM-42: registrar vehículo`).

### 3.3. Configuración de Entornos Locales
- Asegurarse de que cada desarrollador posea sus archivos locales `backend/.env` y `frontend/.env` configurados a partir de los `.env.example`, sin versionarlos en Git.

---

## 4. Problemas y Riesgos Detectados

1. **Discrepancia de Base de Datos en la Documentación Inicial:**
   - *Observación:* El archivo `README.md` de la raíz y `CONTEXTO_SPRINT1.md` indican MySQL con Docker. Sin embargo, la implementación real del proyecto utiliza **PostgreSQL** alojado en **Neon** (`provider = "postgresql"` en `schema.prisma`, migraciones en PostgreSQL); **Supabase** se usa solo como storage de los PDFs.
   - *Recomendación:* Se reflejó la realidad tecnológica en `CLAUDE.md` y `docs/dominio.md`. Se sugiere que el equipo actualice la sección de Docker/MySQL en el `README.md` de la raíz para evitar confusiones en futuros on-boardings.
2. **Warnings de Linter en Frontend (Oxlint):**
   - *Observación:* La corrida de `npm run lint` en `frontend/` arrojó 15 warnings (0 errores). Varios corresponden a llamadas síncronas a `setState` dentro de `useEffect` (en `Documentacion.jsx`, `ModalConfirmarViaje.jsx`, `ModalSubirDocumento.jsx`).
   - *Recomendación:* Revisar estos efectos para optimizar el ciclo de renderizado de React 19 y prevenir re-renders en cascada.
3. **Estado de Tests:**
   - *Backend:* 271 tests ejecutados con `node --test` y el 100% aprobado.
   - *Frontend:* 131 tests ejecutados con `node --test` y el 100% aprobado.
4. **Seguridad y Credenciales:**
   - Se revisó el historial y árbol de trabajo de Git: no existen archivos con secretos ni variables de entorno expuestas. Las reglas de exclusión en `.gitignore` fueron ampliadas para mayor seguridad preventiva.
