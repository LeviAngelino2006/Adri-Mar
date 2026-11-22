# Handoff: partir viajeService.js

## Contexto
`backend/src/services/viajeService.js` tiene ~2080 líneas y ~70 funciones. Cada cambio en viajes obliga a cargar el archivo entero (unos 20-25k tokens). El objetivo es partirlo por responsabilidad **sin cambiar ningún comportamiento**.

Esto es un refactor de **puro movimiento de código**: no renombres funciones, no cambies lógica, mensajes de error ni firmas. Si ves algo para mejorar, anotalo en "Pendientes" del reporte y no lo toques.

## Cómo leer el archivo
No lo leas entero de una. Usá `grep -nE "^(async )?function |^class |^const .* = " src/services/viajeService.js` para ubicar cada función y leé por rangos de líneas.

## Estructura objetivo
Crear `backend/src/services/viajes/` con estos módulos (los rangos son aproximados, verificalos):

| Módulo | Contenido aproximado |
| :--- | :--- |
| `errores.js` | Todas las clases de error (`ValidacionError`, `NoEncontradoError`, `PermisoDenegadoError`, `ViajeEnCursoError`, `EstadoNoEditableError`, `EstadoNoConfirmableError`, `YaCanceladoError`) |
| `permisos.js` | `esElChoferDelViaje`, `puedeOperarViaje`, `puedeVerDatosAdministrativos` |
| `validaciones.js` | `validarCamposCore`, `validarCamposOperativos`, `validarChofer`, `validarVehiculo`, `validarUbicacion`, `validarCliente`, solapamiento, `validarYArmarCore/Operativos`, paradas y candidatos (~l. 118-555 y 737-850) |
| `serializacion.js` | El include de lectura, `serializarPunto`, `serializarViaje`, `serializarCandidatos`, `serializarDatosAdministrativos`, `pendienteAdministrativo` |
| `disponibilidad.js` | `calcularDisponibilidad`, `disponibilidadDeViaje`, `disponibilidadParaAlta` y sus helpers (~l. 1188-1385) |
| `datosAdministrativos.js` | Validación y actualización de datos administrativos, `listarEstadosPago`, `listarMetodosPago` (~l. 1385-1585) |
| `ciclo.js` | `confirmarViaje`, `cancelarViaje`, `comenzarViaje`, `finalizarViaje` |
| `listado.js` | `listarViajes` y sus helpers de filtros, búsqueda y orden (~l. 1826-2056) |

`crearViaje`, `obtenerViaje` y `actualizarViaje` pueden quedar en `viajeService.js` o ir a `viajes/abm.js`, decidilo según cómo queden las dependencias.

**`viajeService.js` queda como fachada**: re-exporta exactamente el mismo `module.exports` que tiene hoy (mismos nombres, incluidas las constantes y las clases de error). Así `viajeController.js`, `viajeRoutes.js` y los tests no cambian.

## Cuidados
- Los tests reemplazan `prismaClient` en el cache de `require` (ver la cabecera de `tests/helpers/prismaFalsoConEstado.js`). Los módulos nuevos tienen que requerir el mismo archivo (`require('../prismaClient')`) para que el mock siga funcionando.
- Evitá dependencias circulares entre los módulos nuevos. Si dos módulos se necesitan mutuamente, la función compartida va a un tercero.
- Respetá el orden de las dependencias: errores y permisos no importan nada de viajes; validaciones y serialización importan errores; el resto importa lo que necesite.

## Pasos
1. **Línea base**: en `backend/`, corré `node --test 2>&1 | tail -9` (solo el resumen final, porque el reporter `dot` no muestra totales) y anotá cuántos pasan y cuántos fallan. Si ya hay tests fallando, anotalos y no los arregles.
2. Extraé **un módulo por vez**, en el orden de la tabla. Después de cada uno, corré solo los tests de viajes:
   `node --test --test-reporter=dot tests/viajes*.test.js tests/estimacionRecorrido.test.js`
   Si falla algo, arreglalo antes de pasar al módulo siguiente.
3. Hacé un commit por módulo extraído, por ejemplo: `refactor(viajes): extraer errores a services/viajes/errores.js`. Así, si algo se rompe, es fácil encontrar qué paso lo rompió.
4. Al final, delegá a un subagente la suite completa del backend (`node --test 2>&1 | tail -9`). El subagente devuelve solo el resumen. Tiene que coincidir con la línea base del paso 1.
5. Verificá que `viajeService.js` exporta exactamente las mismas claves que antes (compará con `git show HEAD~N:backend/src/services/viajeService.js`).

## Reporte
En español, con referencias `archivo:línea`. Incluí:
- tabla de módulos creados con su cantidad de líneas
- resultado de los tests de la línea base y del final
- dependencias entre módulos (quién importa a quién)
- "Pendientes": mejoras que viste y no hiciste
- "Estado final"
