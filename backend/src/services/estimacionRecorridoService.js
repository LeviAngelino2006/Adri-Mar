const prisma = require('./prismaClient');
const { conContexto } = require('../utils/contextoUbicacion');
const {
  validarExtremosRecorrido,
  validarFormatoParadas,
  errorDeSecuencia,
} = require('../utils/recorridoViaje');

// Estimación de los km de un viaje a partir de su recorrido (origen → paradas →
// destino) con OpenRouteService (ORS). Son solo los km del recorrido: sin salida
// desde una base ni vuelta vacía (un ida y vuelta ya se modela con origen =
// destino y paradas en el medio). Es una ayuda para completar el campo: guardar
// un viaje nunca depende de esto.
//
// Flujo de un cálculo:
//  1. Valida el recorrido con las mismas reglas que un viaje (utils/recorridoViaje)
//     y busca los nombres en la base (un findMany).
//  2. Geocodifica cada ubicación DISTINTA una sola vez, en paralelo (un ida y
//     vuelta repite el origen: se pide una vez).
//  3. Pide la ruta en auto por todos los puntos, en orden (una llamada).
//
// ORS migró a api.heigit.org. La URL base va SIN barra final: con barra, el
// gateway de HeiGIT responde error (bug conocido, reportado en el foro de ORS);
// por las dudas se le sacan las barras finales también a ORS_BASE_URL.
const ORS_BASE_URL_POR_DEFECTO = 'https://api.heigit.org';
const RUTA_GEOCODING = '/pelias/v1/search';
const RUTA_DIRECTIONS = '/openrouteservice/v2/directions/driving-car';

const TIMEOUT_MS = 8000;

// Centro de Córdoba capital: ante nombres repetidos en el país, desempata a
// favor de los cercanos (la empresa opera en Córdoba).
const FOCO_CORDOBA = { lat: '-31.4135', lon: '-64.1811' };

// Capas administrativas de Pelias. Si la respuesta es un `fallback` a una de
// estas, Pelias no encontró el nombre propio y se quedó solo con el contexto
// ("Xqzwvlk, Córdoba, Argentina" → "Córdoba, Argentina"): se trata como no
// encontrada en vez de calcular la ruta al centro de la ciudad. Un fallback a un
// lugar concreto (venue, calle) sí se acepta: queda en `interpretadoComo` para
// que el encargado lo verifique.
const CAPAS_ADMINISTRATIVAS = new Set([
  'continent', 'empire', 'country', 'dependency', 'macroregion', 'region', 'macrocounty', 'county',
  'localadmin', 'locality', 'borough', 'macrohood', 'neighbourhood', 'postalcode', 'ocean', 'marinearea',
]);

// Códigos de error de ORS directions que significan "no hay ruta posible":
// 2009 ruta no encontrada, 2010 punto no ruteable, 2004 límites de la ruta
// excedidos (ej. distancia).
const CODIGOS_RUTA_IMPOSIBLE = new Set([2004, 2009, 2010]);

const MENSAJES = {
  sinClave: 'El cálculo de km no está disponible: falta configurar OpenRouteService en el servidor. Cargá los km a mano.',
  claveInvalida: 'El cálculo de km no está disponible: la clave de OpenRouteService no es válida. Cargá los km a mano.',
  cuota: 'Se agotó la cuota de cálculos de OpenRouteService. Intentá más tarde o cargá los km a mano.',
  timeout: 'OpenRouteService no respondió a tiempo. Intentá de nuevo en un momento.',
  caido: 'No se pudo conectar con OpenRouteService. Intentá más tarde o cargá los km a mano.',
  errorOrs: 'OpenRouteService respondió con un error. Intentá más tarde o cargá los km a mano.',
  rutaImposible: 'No hay una ruta en auto que una todos los puntos del recorrido. Revisá las ubicaciones.',
};

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

// Error para el usuario, con el status HTTP que corresponde. `extra` se suma a
// la respuesta (ej. qué ubicaciones no se encontraron).
class EstimacionError extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

function urlBase() {
  return (process.env.ORS_BASE_URL || ORS_BASE_URL_POR_DEFECTO).replace(/\/+$/, '');
}

// fetch con timeout (AbortController), leyendo el cuerpo adentro del mismo
// plazo. La key va en el header Authorization, nunca en la URL, para que no
// quede en logs de nadie. Se usa globalThis.fetch al momento de la llamada (no
// una referencia guardada al cargar) para que los tests puedan reemplazarlo.
async function llamarOrs(url, { method = 'GET', body } = {}, { clave, timeoutMs }) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await globalThis.fetch(url, {
      method,
      headers: {
        Authorization: clave,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controlador.signal,
    });
    const texto = await respuesta.text();
    let datos = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = null;
    }
    return { status: respuesta.status, datos };
  } catch (err) {
    if (controlador.signal.aborted || err?.name === 'AbortError') {
      throw new EstimacionError(503, MENSAJES.timeout);
    }
    throw new EstimacionError(502, MENSAJES.caido);
  } finally {
    clearTimeout(temporizador);
  }
}

// Errores HTTP que valen igual para geocoding y directions.
function errorPorStatus(status) {
  if (status === 429) return new EstimacionError(429, MENSAJES.cuota);
  if (status === 401 || status === 403) return new EstimacionError(503, MENSAJES.claveInvalida);
  return new EstimacionError(502, MENSAJES.errorOrs);
}

// Una ubicación → { coordenadas: [lon, lat], interpretadoComo } o null si ORS no
// la encuentra. Mismo texto que el link de Google Maps (conContexto).
async function geocodificar(nombre, opciones) {
  const url = new URL(`${urlBase()}${RUTA_GEOCODING}`);
  url.search = new URLSearchParams({
    text: conContexto(nombre),
    'boundary.country': 'AR',
    'focus.point.lat': FOCO_CORDOBA.lat,
    'focus.point.lon': FOCO_CORDOBA.lon,
    size: '1',
  }).toString();

  const { status, datos } = await llamarOrs(url.toString(), {}, opciones);
  if (status !== 200) throw errorPorStatus(status);

  const resultado = datos?.features?.[0];
  const coordenadas = resultado?.geometry?.coordinates;
  if (!resultado || !Array.isArray(coordenadas) || coordenadas.length < 2) return null;

  const { match_type: tipoCoincidencia, layer: capa, label } = resultado.properties ?? {};
  if (tipoCoincidencia === 'fallback' && CAPAS_ADMINISTRATIVAS.has(capa)) return null;

  return { coordenadas: [coordenadas[0], coordenadas[1]], interpretadoComo: label ?? nombre };
}

// Ruta en auto por todos los puntos, en orden. ORS usa [longitud, latitud].
async function calcularRuta(coordenadas, opciones) {
  const { status, datos } = await llamarOrs(
    `${urlBase()}${RUTA_DIRECTIONS}`,
    { method: 'POST', body: { coordinates: coordenadas } },
    opciones
  );

  if (status === 404 || (status === 400 && CODIGOS_RUTA_IMPOSIBLE.has(datos?.error?.code))) {
    throw new EstimacionError(422, MENSAJES.rutaImposible);
  }
  if (status !== 200) throw errorPorStatus(status);

  const resumen = datos?.routes?.[0]?.summary;
  if (!resumen) throw new EstimacionError(422, MENSAJES.rutaImposible);
  // Un tramo de distancia 0 (dos puntos en el mismo lugar) viene sin las claves.
  return { metros: resumen.distance ?? 0, segundos: resumen.duration ?? 0 };
}

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

// Nombres de todas las ubicaciones del recorrido (un findMany) y existencia,
// con los mismos mensajes que viajeService.
async function buscarUbicaciones(secuencia) {
  const unicos = [...new Set(secuencia)];
  const encontradas = await prisma.ubicacion.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true },
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

// { origenId, paradaIds, destinoId } → { kilometros, duracionMinutos, puntos }.
// `puntos` va en el orden del recorrido (con repetidos), con lo que ORS entendió
// de cada uno, para que el encargado lo verifique.
async function estimarKm({ origenId, paradaIds, destinoId } = {}, { timeoutMs = TIMEOUT_MS } = {}) {
  const clave = process.env.ORS_API_KEY;
  if (!clave) throw new EstimacionError(503, MENSAJES.sinClave);
  const opciones = { clave, timeoutMs };

  const secuencia = validarRecorrido({ origenId, paradaIds, destinoId });
  const ubicaciones = await buscarUbicaciones(secuencia);

  // Una geocodificación por ubicación distinta. allSettled: si una falla por
  // cuota o timeout se informa eso, aunque otra no se haya encontrado.
  const ids = [...ubicaciones.keys()];
  const resultados = await Promise.allSettled(ids.map((id) => geocodificar(ubicaciones.get(id).nombre, opciones)));
  const fallida = resultados.find((r) => r.status === 'rejected');
  if (fallida) throw fallida.reason;

  const geocodificadas = new Map(ids.map((id, i) => [id, resultados[i].value]));
  const noEncontradas = ids.filter((id) => !geocodificadas.get(id));
  if (noEncontradas.length > 0) {
    const nombres = noEncontradas.map((id) => ubicaciones.get(id).nombre);
    const mensaje =
      nombres.length === 1
        ? `No se encontró "${nombres[0]}" en el mapa. Revisá el nombre de la ubicación o cargá los km a mano.`
        : `No se encontraron en el mapa: ${nombres.map((n) => `"${n}"`).join(', ')}. Revisá los nombres o cargá los km a mano.`;
    throw new EstimacionError(422, mensaje, {
      ubicacionesNoEncontradas: noEncontradas.map((id) => ({ ubicacionId: id, nombre: ubicaciones.get(id).nombre })),
    });
  }

  const ruta = await calcularRuta(secuencia.map((id) => geocodificadas.get(id).coordenadas), opciones);

  return {
    kilometros: Math.round(ruta.metros / 1000),
    duracionMinutos: Math.round(ruta.segundos / 60),
    puntos: secuencia.map((id) => ({
      ubicacionId: id,
      nombre: ubicaciones.get(id).nombre,
      interpretadoComo: geocodificadas.get(id).interpretadoComo,
    })),
  };
}

module.exports = {
  estimarKm,
  ValidacionError,
  EstimacionError,
  ORS_BASE_URL_POR_DEFECTO,
  RUTA_GEOCODING,
  RUTA_DIRECTIONS,
  TIMEOUT_MS,
};
