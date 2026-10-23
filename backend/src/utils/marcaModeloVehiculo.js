// El vehículo guarda solo modeloId; la marca sale de modelo.marca. Las
// respuestas de la API siguen exponiendo `marca` y `modelo` como texto (lo que
// devolvían cuando eran columnas libres), así el front que solo los muestra no
// cambia. Lo usan vehiculoService, viajeService y documentoService: vive en
// utils para no importar un service desde otro.

// Para el `include` de Prisma de cualquier lectura de vehículo que vaya a
// pasar por nombresMarcaModelo.
const INCLUDE_MODELO_Y_MARCA = { modelo: { include: { marca: true } } };

// Para un `select` anidado (ej. el vehículo de una alerta de documentación).
const SELECT_MODELO_Y_MARCA = { modelo: { select: { nombre: true, marca: { select: { nombre: true } } } } };

function nombresMarcaModelo(vehiculo) {
  return { marca: vehiculo.modelo.marca.nombre, modelo: vehiculo.modelo.nombre };
}

module.exports = { INCLUDE_MODELO_Y_MARCA, SELECT_MODELO_Y_MARCA, nombresMarcaModelo };
