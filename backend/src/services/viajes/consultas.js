// Lectura de viajes desde la base con lo que necesita serializarViaje: sus
// relaciones y las lecturas de odómetro vigentes.
const prisma = require('../prismaClient');
const { serializarLectura } = require('../lecturaOdometroService');
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

// Lecturas vigentes de INICIO_VIAJE y FIN_VIAJE de cada viaje, como
// Map viajeId -> { vigenteInicio, vigenteFin } (null si el viaje no tiene esa
// lectura). Misma regla que lecturaOdometroService.obtenerLecturaVigente (de
// las correcciones de una lectura vale la más reciente por creadoEn, y se
// sigue la cadena), pero por niveles: una consulta por eslabón de la cadena
// más larga (normalmente 0 o 1) en vez de una por lectura, así el listado no
// hace consultas proporcionales a la cantidad de viajes.
async function obtenerKmDeViajes(viajeIds) {
  const resultado = new Map(viajeIds.map((id) => [id, { vigenteInicio: null, vigenteFin: null }]));
  if (viajeIds.length === 0) return resultado;

  const bases = await prisma.lecturaOdometro.findMany({
    where: { viajeId: { in: viajeIds }, origen: { descripcion: { in: ['INICIO_VIAJE', 'FIN_VIAJE'] } } },
    orderBy: { id: 'asc' },
    include: { origen: true },
  });

  // Lectura vigente hasta ahora de cada lectura base, por id de la base. Un
  // viaje tiene una sola de cada origen; si hubiera más, vale la primera.
  const vigentePorBase = new Map();
  const basePorViajeYOrigen = new Map();
  for (const lectura of bases) {
    const clave = `${lectura.viajeId}:${lectura.origen.descripcion}`;
    if (basePorViajeYOrigen.has(clave)) continue;
    basePorViajeYOrigen.set(clave, lectura.id);
    vigentePorBase.set(lectura.id, lectura);
  }

  // `visitadas` corta la vuelta si una cadena tuviera un ciclo (no debería).
  const visitadas = new Set(vigentePorBase.keys());
  let nivel = [...vigentePorBase.values()];
  while (nivel.length > 0) {
    // eslint-disable-next-line no-await-in-loop
    const correcciones = await prisma.lecturaOdometro.findMany({
      where: { lecturaCorregidaId: { in: nivel.map((l) => l.id) } },
      orderBy: { creadoEn: 'desc' },
      include: { origen: true },
    });
    const masRecientePorCorregida = new Map();
    for (const correccion of correcciones) {
      if (!masRecientePorCorregida.has(correccion.lecturaCorregidaId)) {
        masRecientePorCorregida.set(correccion.lecturaCorregidaId, correccion);
      }
    }

    nivel = [];
    for (const [baseId, actual] of vigentePorBase) {
      const siguiente = masRecientePorCorregida.get(actual.id);
      if (!siguiente || visitadas.has(siguiente.id)) continue;
      visitadas.add(siguiente.id);
      vigentePorBase.set(baseId, siguiente);
      nivel.push(siguiente);
    }
  }

  for (const [clave, baseId] of basePorViajeYOrigen) {
    const [viajeId, origen] = clave.split(':');
    const km = resultado.get(Number(viajeId));
    const vigente = serializarLectura(vigentePorBase.get(baseId));
    if (origen === 'INICIO_VIAJE') km.vigenteInicio = vigente;
    else km.vigenteFin = vigente;
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
