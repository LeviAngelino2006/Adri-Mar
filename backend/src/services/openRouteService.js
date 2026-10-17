// Cliente de OpenRouteService (ORS), compartido por el cálculo de km de un viaje
// (estimacionRecorridoService: directions) y por la búsqueda de un lugar al
// crear una ubicación (ubicacionService.buscarEnMapa: geocoding). La key vive
// solo acá, en el backend.
//
// ORS migró a api.heigit.org. La URL base va SIN barra final: con barra, el
// gateway de HeiGIT responde error (bug conocido, reportado en el foro de ORS);
// por las dudas se le sacan las barras finales también a ORS_BASE_URL.
const ORS_BASE_URL_POR_DEFECTO = 'https://api.heigit.org';
const RUTA_GEOCODING = '/pelias/v1/search';
const RUTA_DIRECTIONS = '/openrouteservice/v2/directions/driving-car';

const TIMEOUT_MS = 8000;

// Centro de Córdoba capital: ante nombres repetidos en el país, la búsqueda
// desempata a favor de los cercanos (la empresa opera en Córdoba).
const FOCO_CORDOBA = { lat: '-31.4135', lon: '-64.1811' };

const MAX_CANDIDATOS = 5;

// Hasta cuántos metros puede estar cada punto de una calle para que directions
// lo "enganche" a la red vial. El valor por defecto de ORS (350 m) deja afuera
// puntos reales elegidos a mano: el aeropuerto de Córdoba marcado sobre la
// pista, un campus o una estancia lejos del camino (probado: 2010 con 350 m,
// ruta con 1 km o más). 5 km cubre esos casos y un punto puesto en cualquier
// lado sigue dando "no hay ruta".
const RADIO_ENGANCHE_M = 5000;

// Códigos de error de ORS directions que significan "no hay ruta posible":
// 2009 ruta no encontrada, 2010 punto no ruteable, 2004 límites de la ruta
// excedidos (ej. distancia).
const CODIGOS_RUTA_IMPOSIBLE = new Set([2004, 2009, 2010]);

const MENSAJES = {
  sinClave: 'El mapa no está disponible: falta configurar OpenRouteService en el servidor.',
  claveInvalida: 'El mapa no está disponible: la clave de OpenRouteService no es válida.',
  cuota: 'Se agotó la cuota de OpenRouteService. Intentá más tarde.',
  timeout: 'OpenRouteService no respondió a tiempo. Intentá de nuevo en un momento.',
  caido: 'No se pudo conectar con OpenRouteService. Intentá más tarde.',
  errorOrs: 'OpenRouteService respondió con un error. Intentá más tarde.',
  rutaImposible: 'No hay una ruta en auto que una todos los puntos del recorrido. Revisá las ubicaciones.',
};

// Error para mostrarle al usuario, con el status HTTP que corresponde. `extra`
// se suma a la respuesta (ej. qué ubicaciones no tienen coordenadas). Los
// controllers lo devuelven como { error, ...extra }, nunca como un 500.
class ErrorMapa extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

function urlBase() {
  return (process.env.ORS_BASE_URL || ORS_BASE_URL_POR_DEFECTO).replace(/\/+$/, '');
}

// La key, o 503 si el servidor no la tiene configurada (el resto de la app
// funciona igual).
function claveOrs() {
  const clave = process.env.ORS_API_KEY;
  if (!clave) throw new ErrorMapa(503, MENSAJES.sinClave);
  return clave;
}

// fetch con timeout (AbortController), leyendo el cuerpo adentro del mismo
// plazo. La key va en el header Authorization, nunca en la URL, para que no
// quede en logs de nadie. Se usa globalThis.fetch al momento de la llamada (no
// una referencia guardada al cargar) para que los tests puedan reemplazarlo.
async function llamarOrs(url, { method = 'GET', body } = {}, { clave, timeoutMs = TIMEOUT_MS }) {
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
      throw new ErrorMapa(503, MENSAJES.timeout);
    }
    throw new ErrorMapa(502, MENSAJES.caido);
  } finally {
    clearTimeout(temporizador);
  }
}

// Errores HTTP que valen igual para geocoding y directions.
function errorPorStatus(status) {
  if (status === 429) return new ErrorMapa(429, MENSAJES.cuota);
  if (status === 401 || status === 403) return new ErrorMapa(503, MENSAJES.claveInvalida);
  return new ErrorMapa(502, MENSAJES.errorOrs);
}

// Ruta en auto por todos los puntos, en orden: UNA llamada a directions.
// coordenadas: [[longitud, latitud], ...] (el orden de ORS/GeoJSON).
async function calcularRuta(coordenadas, { timeoutMs } = {}) {
  const clave = claveOrs();
  const { status, datos } = await llamarOrs(
    `${urlBase()}${RUTA_DIRECTIONS}`,
    { method: 'POST', body: { coordinates: coordenadas, radiuses: coordenadas.map(() => RADIO_ENGANCHE_M) } },
    { clave, timeoutMs }
  );

  if (status === 404 || (status === 400 && CODIGOS_RUTA_IMPOSIBLE.has(datos?.error?.code))) {
    throw new ErrorMapa(422, MENSAJES.rutaImposible);
  }
  if (status !== 200) throw errorPorStatus(status);

  const resumen = datos?.routes?.[0]?.summary;
  if (!resumen) throw new ErrorMapa(422, MENSAJES.rutaImposible);
  // Un tramo de distancia 0 (dos puntos en el mismo lugar) viene sin las claves.
  return { metros: resumen.distance ?? 0, segundos: resumen.duration ?? 0 };
}

// Hasta 5 lugares que coinciden con `texto`, en Argentina y priorizando los
// cercanos a Córdoba: [{ etiqueta, latitud, longitud }]. El texto va tal cual lo
// escribió el usuario: probado contra ORS, agregarle ", Córdoba, Argentina"
// empeora los resultados de colegios u hoteles (el foco ya prioriza Córdoba).
// Elegir el candidato correcto es del usuario: ve la etiqueta de cada uno.
async function buscarLugares(texto, { timeoutMs } = {}) {
  const clave = claveOrs();
  const url = new URL(`${urlBase()}${RUTA_GEOCODING}`);
  url.search = new URLSearchParams({
    text: texto,
    'boundary.country': 'AR',
    'focus.point.lat': FOCO_CORDOBA.lat,
    'focus.point.lon': FOCO_CORDOBA.lon,
    size: String(MAX_CANDIDATOS),
  }).toString();

  const { status, datos } = await llamarOrs(url.toString(), {}, { clave, timeoutMs });
  if (status !== 200) throw errorPorStatus(status);

  return (datos?.features ?? [])
    .map((f) => {
      const [longitud, latitud] = f?.geometry?.coordinates ?? [];
      return { etiqueta: f?.properties?.label ?? texto, latitud, longitud };
    })
    .filter((c) => Number.isFinite(c.latitud) && Number.isFinite(c.longitud))
    .slice(0, MAX_CANDIDATOS);
}

module.exports = {
  calcularRuta,
  buscarLugares,
  ErrorMapa,
  MENSAJES,
  ORS_BASE_URL_POR_DEFECTO,
  RUTA_GEOCODING,
  RUTA_DIRECTIONS,
  TIMEOUT_MS,
  MAX_CANDIDATOS,
  RADIO_ENGANCHE_M,
};
