# Índice de Documentación – Adri-Mar Gestión

Este directorio centraliza la documentación técnica, funcional y de diseño del sistema de gestión para la empresa **Adri-Mar**.

---

## 1. Documentos Principales del Proyecto

- [CLAUDE.md](../CLAUDE.md): Guía de contexto, stack tecnológico, estructura, comandos y convenciones para el trabajo con Claude Code.
- [README.md](../README.md): Resumen general del proyecto, requisitos de entorno y pasos de puesta en marcha.
- [CONTEXTO_SPRINT1.md](../CONTEXTO_SPRINT1.md): Fuente de verdad original del Sprint 1 (decisiones de arquitectura, modelo inicial y criterios de aceptación).
- [docs/REPORTE_SETUP.md](./REPORTE_SETUP.md): Reporte de configuración inicial del entorno, estado de herramientas y tareas manuales pendientes.

---

## 2. Dominio y Reglas de Negocio

- [docs/dominio.md](./dominio.md): Reglas de negocio deducidas del repositorio (vehículos, vigencias de documentos, viajes especiales, odómetro, estados y mantenimiento: service, arreglos e historial).
- [docs/INFORMACION_ADICIONAL.md](./INFORMACION_ADICIONAL.md): Relevamiento operativo integral de Adri-Mar (dimensión de la flota de 24 colectivos, frecuencias de service preventivo por tipología, legajos requeridos y análisis del historial operativo).

---

## 3. Especificaciones Técnicas y Flujos Operativos

- [docs/handoff-flujo-viajes.md](./handoff-flujo-viajes.md): Especificación técnica del nuevo flujo de creación y confirmación de viajes en 4 fases (candidatos, paradas intermedias, disponibilidad operativa y avisos por WhatsApp).

---

## 4. Sistema de Diseño (Design System)

- [docs/design-system/README.md](./design-system/README.md): Guía general de estilos visuales, lineamientos de interfaz y accesibilidad.
- [docs/design-system/tokens.json](./design-system/tokens.json): Tokens de diseño (paleta de colores semánticos, espaciados, tipografías y bordes).
- [docs/design-system/componentes/](./design-system/componentes/): Especificaciones de los componentes reutilizables de UI (Button, FormField, ModalOdometro, AvisarPorWhatsApp, EditorRecorrido, PanelViajesPorConfirmar, etc.).

---

## 5. Datos y Modelo de Base de Datos

- [backend/prisma/schema.prisma](../backend/prisma/schema.prisma): Definición formal de las tablas, relaciones, campos y enumeraciones en Prisma ORM (PostgreSQL).
- [database/diagramas/](../database/diagramas/): Diagramas de entidad-relación (DER) y esquemas conceptuales de datos.
