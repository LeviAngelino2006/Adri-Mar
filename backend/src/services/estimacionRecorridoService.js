const prisma = require('./prismaClient');
const openRouteService = require('./openRouteService');
const {
  validarExtremosRecorrido,
  validarFormatoParadas,
  errorDeSecuencia,
} = require('../utils/recorridoViaje');

const { ErrorMapa } = openRouteService;

// Estimación de los km de un viaje a partir de su recorrido (origen → paradas →
// destino) con OpenRouteService (ORS). Son solo los km del recorrido: sin salida
// desde una base ni vuelta vacía (un ida y vuelta ya se modela con origen =
// destino y paradas en el medio). Es una ayuda para completar el campo: guardar
// un viaje nunca depende de esto.
//
// Flujo de un cálculo:
//  1. Valida el recorrido con las mismas reglas que un viaje (utils/recorridoViaje)
//     y lee las coordenadas guardadas de cada ubicación (un findMany).
//  2. Si a alguna le faltan, 422 con cuáles (el formulario ofrece completarlas).
//  3. Pide la ruta en auto por todos los puntos, en orden: UNA llamada a ORS.
//
// No se geocodifica el nombre al calcular: hacerlo fallaba de forma grosera e
// indetectable ("Cosquin" → una calle de Córdoba capital). Las coordenadas se
// eligen una vez, al crear la ubicación (o vienen de la importación de
// localidades de Georef), y quedan guardadas.

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

const tieneCoordenadas = (u) => Number.isFinite(u.latitud) && Number.isFinite(u.longitud);

// Mismas reglas de recorrido que un viaje; errores por campo como en viajes
// (origenId, destinoId, paradas) para que el formulario los muestre igual.
function validarRecorrido({ origenId, paradaIds, destinoId }) {
  const formato = validarFormatoParadas(paradaIds);
  const extremos = validarExtremosRecorrido({ origenId, destinoId }, { hayParadas: formato.ids.length > 0 });
  const errores = { ...extremos.errores, ...formato.errores };

  if (Object.keys(errores).length === 0) {
    const mensaje = errorDeSecuencia(extremos.origenId, formato.ids, extremos.destinoId);
    if (mensaje) errores.paradas = mensaje;
  }
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  return [extremos.origenId, ...formato.ids, extremos.destinoId];
}

// Todas las ubicaciones del recorrido (un findMany) y su existencia, con los
// mismos mensajes que viajeService.
async function buscarUbicaciones(secuencia) {
  const unicos = [...new Set(secuencia)];
  const encontradas = await prisma.ubicacion.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true, latitud: true, longitud: true },
  });
  const porId = new Map(encontradas.map((u) => [u.id, u]));

  const errores = {};
  const [origenId, ...resto] = secuencia;
  const destinoId = resto.pop();
  if (!porId.has(origenId)) errores.origenId = 'La ubicación elegida no existe';
  if (!porId.has(destinoId)) errores.destinoId = 'La ubicación elegida no existe';
  if (resto.some((id) => !porId.has(id))) errores.paradas = 'Alguna parada elegida no existe';
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  return porId;
}

// 422 que dice cuáles ubicaciones no están ubicadas en el mapa, en el orden del
// recorrido y sin repetir, con sus ids para que el front ofrezca completarlas.
function errorSinCoordenadas(faltantes) {
  const nombres = faltantes.map((u) => `"${u.nombre}"`);
  const mensaje =
    faltantes.length === 1
      ? `Falta ubicar ${nombres[0]} en el mapa.`
      : `Faltan ubicar en el mapa: ${nombres.join(', ')}.`;
  return new ErrorMapa(422, mensaje, {
    ubicacionesSinCoordenadas: faltantes.map((u) => ({ ubicacionId: u.id, nombre: u.nombre })),
  });
}

// { origenId, paradaIds, destinoId } → { kilometros, duracionMinutos }.
async function estimarKm({ origenId, paradaIds, destinoId } = {}, { timeoutMs } = {}) {
  // Sin key no tiene sentido ni leer la base.
  if (!process.env.ORS_API_KEY) throw new ErrorMapa(503, openRouteService.MENSAJES.sinClave);

  const secuencia = validarRecorrido({ origenId, paradaIds, destinoId });
  const ubicaciones = await buscarUbicaciones(secuencia);

  const faltantes = [...new Set(secuencia)].map((id) => ubicaciones.get(id)).filter((u) => !tieneCoordenadas(u));
  if (faltantes.length > 0) throw errorSinCoordenadas(faltantes);

  // ORS usa [longitud, latitud].
  const coordenadas = secuencia.map((id) => [ubicaciones.get(id).longitud, ubicaciones.get(id).latitud]);
  const ruta = await openRouteService.calcularRuta(coordenadas, { timeoutMs });

  return {
    kilometros: Math.round(ruta.metros / 1000),
    duracionMinutos: Math.round(ruta.segundos / 60),
  };
}

module.exports = {
  estimarKm,
  ValidacionError,
  ErrorMapa,
};
