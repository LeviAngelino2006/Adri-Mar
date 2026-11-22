// Errores que lanza el dominio de viajes; viajeController los traduce a códigos HTTP.

class PermisoDenegadoError extends Error {}

// Se dispara al intentar Comenzar un viaje cuando el vehículo o el chofer ya
// tienen otro viaje En viaje en curso. El chequeo de acá adentro es best
// effort para dar un mensaje claro en el camino feliz; la garantía dura
// contra la carrera entre dos requests simultáneos es el índice único
// parcial de la base (Paso 1) — si esta validación pasa pero el INSERT/UPDATE
// igual choca contra ese índice, se captura el código 23505 (P2002 en
// Prisma) y se relanza como este mismo error, nunca como un error crudo de
// Postgres.
class ViajeEnCursoError extends Error {}

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradoError extends Error {}

// Estado distinto de PROGRAMADO: no se puede ni editar ni cancelar (salvo el
// caso de "ya cancelado", que tiene su propio error más específico abajo).
class EstadoNoEditableError extends Error {
  constructor(estadoActual) {
    super(`El viaje está en estado ${estadoActual}`);
    this.estadoActual = estadoActual;
  }
}

class YaCanceladoError extends Error {}

class EstadoNoConfirmableError extends Error {
  constructor(estadoActual) {
    super(`El viaje está en estado ${estadoActual}`);
    this.estadoActual = estadoActual;
  }
}

module.exports = {
  PermisoDenegadoError,
  ViajeEnCursoError,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  YaCanceladoError,
  EstadoNoConfirmableError,
};
