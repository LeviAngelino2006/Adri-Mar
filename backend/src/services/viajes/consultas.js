// Lectura de un viaje desde la base con las relaciones que necesita serializarViaje.
const prisma = require('../prismaClient');
const { INCLUDE_MODELO_Y_MARCA } = require('../../utils/marcaModeloVehiculo');
const { NoEncontradoError } = require('./errores');

// Para cualquier lectura de viaje que vaya a pasar por serializarViaje. Los
// candidatos se cargan siempre, aunque serializarViaje los omita para quien no
// es gestor: son tablas chicas y así ninguna lectura puede olvidarse de
// incluirlos.
const INCLUDE_RELACIONES_VIAJE = {
  choferesCandidatos: { include: { persona: true } },
  vehiculosCandidatos: { include: { vehiculo: true } },
  // Siempre ordenadas: serializarViaje las devuelve tal cual vienen.
  paradas: { include: { ubicacion: true }, orderBy: { orden: 'asc' } },
  chofer: true,
  // Con modelo y marca: el vehículo ya no tiene esas columnas (ver Vehiculo).
  vehiculo: { include: INCLUDE_MODELO_Y_MARCA },
  estadoViaje: true,
  origen: true,
  destino: true,
  cliente: true,
  estadoPagoCliente: true,
  metodoPagoCliente: true,
  estadoPagoChofer: true,
  metodoPagoChofer: true,
};

async function obtenerViaje(id) {
  const viaje = await prisma.viaje.findUnique({
    where: { id: Number(id) },
    include: INCLUDE_RELACIONES_VIAJE,
  });
  if (!viaje) {
    throw new NoEncontradoError();
  }
  return viaje;
}

module.exports = { INCLUDE_RELACIONES_VIAJE, obtenerViaje };
