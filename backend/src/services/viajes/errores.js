// Errores que lanza el dominio de viajes; viajeController los traduce a códigos HTTP.

class PermisoDenegadoError extends Error {}

// Comenzar un viaje cuando el vehículo o el chofer ya tienen otro En viaje.
// comenzarViaje (ciclo.js) lo chequea antes para dar un mensaje claro, pero la
// garantía dura contra dos requests simultáneos es el índice único parcial de
// la base: si igual choca, el código 23505 (P2002 en Prisma) se relanza como
// este error, nunca como un error crudo de Postgres.
class ViajeEnCursoError extends Error {}

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradoError extends Error {}

// Estado distinto de PROGRAMADO: no se puede ni editar ni cancelar (salvo el
// caso de "ya cancelado", que tiene su propio error: YaCanceladoError).
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
