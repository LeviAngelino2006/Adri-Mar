// Lectura de viajes desde la base con lo que necesita serializarViaje: sus
// relaciones y las lecturas de odómetro vigentes.
const prisma = require('../prismaClient');
const { serializarLectura, resolverVigentesPorViaje } = require('../lecturaOdometroService');
const { INCLUDE_MODELO_Y_MARCA } = require('../../utils/marcaModeloVehiculo');
const { NoEncontradoError } = require('./errores');
const { serializarViaje } = require('./serializacion');

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

// Lecturas vigentes de INICIO_VIAJE y FIN_VIAJE de cada viaje, serializadas,
// como Map viajeId -> { vigenteInicio, vigenteFin } (null si el viaje no
// tiene esa lectura). Una sola consulta trae todas las lecturas de los viajes,
// correcciones incluidas (llevan el viajeId de la corregida), y la regla la
// aplica lecturaOdometroService.resolverVigentesPorViaje: así el listado no
// hace consultas proporcionales a la cantidad de viajes ni al largo de las
// cadenas de correcciones.
async function obtenerKmDeViajes(viajeIds) {
  const resultado = new Map(viajeIds.map((id) => [id, { vigenteInicio: null, vigenteFin: null }]));
  if (viajeIds.length === 0) return resultado;

  const lecturas = await prisma.lecturaOdometro.findMany({
    where: { viajeId: { in: viajeIds } },
    include: { origen: true },
  });

  for (const [viajeId, { vigenteInicio, vigenteFin }] of resolverVigentesPorViaje(lecturas)) {
    const km = resultado.get(viajeId);
    if (!km) continue;
    km.vigenteInicio = vigenteInicio ? serializarLectura(vigenteInicio) : null;
    km.vigenteFin = vigenteFin ? serializarLectura(vigenteFin) : null;
  }
  return resultado;
}

// Para quien devuelve un solo viaje (alta, edición, ciclo de vida, datos
// administrativos).
async function serializarViajeConKm(viaje, usuarioSolicitante) {
  const km = await obtenerKmDeViajes([viaje.id]);
  return serializarViaje(viaje, usuarioSolicitante, km.get(viaje.id));
}

module.exports = { INCLUDE_RELACIONES_VIAJE, obtenerViaje, obtenerKmDeViajes, serializarViajeConKm };
