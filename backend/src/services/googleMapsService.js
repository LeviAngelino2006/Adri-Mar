// Cliente de Google Maps Platform: Places API (New) para buscar direcciones y
// lugares (Autocomplete + Place Details) y Routes API para los km estimados de
// un viaje (computeRoutes). La key vive solo acá, en el backend.
//
// Costos: todas las llamadas usan SKU de nivel Essentials.
//  - Autocomplete (New) con sessionToken: "Autocomplete Requests" (las primeras
//    12 de la sesión; las siguientes, "Autocomplete Session Usage", sin cargo).
//  - Place Details (New) con field mask id,formattedAddress: "Place Details
//    Essentials". OJO: displayName dispara "Place Details Pro", por eso el
//    nombre de una frecuente sale del texto principal de la sugerencia y no
//    del detalle. Usar el mismo sessionToken cierra la sesión.
//  - computeRoutes con TRAFFIC_UNAWARE y hasta 9 paradas: "Compute Routes
//    Essentials" (TRAFFIC_AWARE o más de 10 intermedios pasan a Pro).
//
// Términos: de lo que devuelve Google solo se guarda el placeId (lo único que
// se puede guardar sin límite de tiempo). Las coordenadas de Places tienen un
// máximo de 30 días, así que no se piden ni se guardan.
const URL_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const URL_DETALLE = 'https://places.googleapis.com/v1/places/';
const URL_RUTAS = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Solo los campos que se usan (el field mask decide el SKU en Place Details).
const FIELD_MASK_AUTOCOMPLETE = 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';
const FIELD_MASK_DETALLE = 'id,formattedAddress';
const FIELD_MASK_RUTAS = 'routes.distanceMeters,routes.duration';

const TIMEOUT_MS = 8000;

// Centro de Córdoba capital: las sugerencias priorizan lo cercano (la empresa
// opera en Córdoba). 50 km es el máximo que acepta locationBias.
const SESGO_CORDOBA = { circle: { center: { latitude: -31.4135, longitude: -64.1811 }, radius: 50000 } };

const MENSAJES = {
  sinClave: 'Google Maps no está disponible: falta configurar GOOGLE_MAPS_API_KEY en el servidor.',
  claveInvalida: 'Google Maps no está disponible: la clave no es válida o no tiene habilitadas las APIs.',
  cuota: 'Se agotó la cuota de Google Maps. Intentá más tarde.',
  timeout: 'Google Maps no respondió a tiempo. Intentá de nuevo en un momento.',
  caido: 'No se pudo conectar con Google Maps. Intentá más tarde.',
  errorGoogle: 'Google Maps respondió con un error. Intentá más tarde.',
  lugarInvalido: 'Google Maps no reconoce ese lugar. Buscalo de nuevo.',
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

// La key, o 503 si el servidor no la tiene configurada (el resto de la app
// funciona igual).
function claveGoogle() {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) throw new ErrorMapa(503, MENSAJES.sinClave);
  return clave;
}

// fetch con timeout (AbortController), leyendo el cuerpo adentro del mismo
// plazo. La key va en el header X-Goog-Api-Key, nunca en la URL, para que no
// quede en logs de nadie; tampoco se loguea ni se devuelve. Se usa
// globalThis.fetch al momento de la llamada para que los tests puedan
// reemplazarlo.
async function llamarGoogle(url, { method = 'GET', body, fieldMask, timeoutMs = TIMEOUT_MS }) {
  const clave = claveGoogle();
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await globalThis.fetch(url, {
      method,
      headers: {
        'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': fieldMask,
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

// Errores HTTP comunes a las tres APIs. 403 es tanto key inválida como API no
// habilitada en el proyecto de Google (PERMISSION_DENIED).
function errorPorStatus(status) {
  if (status === 429) return new ErrorMapa(429, MENSAJES.cuota);
  if (status === 401 || status === 403) return new ErrorMapa(503, MENSAJES.claveInvalida);
  return new ErrorMapa(502, MENSAJES.errorGoogle);
}

// Hasta 5 sugerencias para lo que el usuario va escribiendo:
// [{ placeId, textoPrincipal, textoSecundario }]. Solo Argentina, priorizando
// Córdoba, en castellano. El sessionToken agrupa la búsqueda con el Place
// Details que la cierra (ver detalleLugar).
async function sugerencias(texto, sessionToken, { timeoutMs } = {}) {
  const { status, datos } = await llamarGoogle(URL_AUTOCOMPLETE, {
    method: 'POST',
    fieldMask: FIELD_MASK_AUTOCOMPLETE,
    timeoutMs,
    body: {
      input: texto,
      ...(sessionToken ? { sessionToken } : {}),
      includedRegionCodes: ['ar'],
      locationBias: SESGO_CORDOBA,
      languageCode: 'es',
    },
  });
  if (status !== 200) throw errorPorStatus(status);

  return (datos?.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p) => p?.placeId)
    .map((p) => ({
      placeId: p.placeId,
      textoPrincipal: p.structuredFormat?.mainText?.text ?? '',
      textoSecundario: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

// Detalle mínimo de un lugar: { placeId, direccion }. Con el mismo
// sessionToken de la búsqueda cierra la sesión (las sugerencias no se cobran
// por separado). regionCode "ar" saca ", Argentina" del final de la dirección.
async function detalleLugar(placeId, sessionToken, { timeoutMs } = {}) {
  const url = new URL(URL_DETALLE + encodeURIComponent(placeId));
  url.search = new URLSearchParams({
    languageCode: 'es',
    regionCode: 'ar',
    ...(sessionToken ? { sessionToken } : {}),
  }).toString();

  const { status, datos } = await llamarGoogle(url.toString(), { fieldMask: FIELD_MASK_DETALLE, timeoutMs });
  // Un placeId inexistente o vencido: 400 INVALID_ARGUMENT o 404 NOT_FOUND.
  if (status === 400 || status === 404) throw new ErrorMapa(422, MENSAJES.lugarInvalido);
  if (status !== 200) throw errorPorStatus(status);
  if (!datos?.id) throw new ErrorMapa(422, MENSAJES.lugarInvalido);

  return { placeId: datos.id, direccion: datos.formattedAddress ?? null };
}

// Un punto del recorrido como waypoint de Routes: por placeId si lo tiene
// (preciso: la dirección exacta que eligió el usuario), si no por latLng.
function waypoint({ placeId, latitud, longitud }) {
  if (placeId) return { placeId };
  return { location: { latLng: { latitude: latitud, longitude: longitud } } };
}

// "5430s" → 5430.
const segundos = (duracion) => Number.parseFloat(String(duracion ?? '0').replace(/s$/, '')) || 0;

// Ruta en auto por todos los puntos, en orden: UNA llamada a computeRoutes.
// puntos: [{ placeId } | { latitud, longitud }]. Devuelve { metros, segundos }.
async function calcularRuta(puntos, { timeoutMs } = {}) {
  const [origen, ...resto] = puntos;
  const destino = resto.pop();
  const { status, datos } = await llamarGoogle(URL_RUTAS, {
    method: 'POST',
    fieldMask: FIELD_MASK_RUTAS,
    timeoutMs,
    body: {
      origin: waypoint(origen),
      destination: waypoint(destino),
      ...(resto.length > 0 ? { intermediates: resto.map(waypoint) } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'es',
      units: 'METRIC',
    },
  });

  // 400/404: algún placeId que Google ya no reconoce o un punto imposible.
  if (status === 400 || status === 404) throw new ErrorMapa(422, MENSAJES.rutaImposible);
  if (status !== 200) throw errorPorStatus(status);

  // Sin ruta posible Google responde 200 con un objeto vacío.
  const ruta = datos?.routes?.[0];
  if (!ruta) throw new ErrorMapa(422, MENSAJES.rutaImposible);
  // Un recorrido de distancia 0 viene sin distanceMeters.
  return { metros: ruta.distanceMeters ?? 0, segundos: segundos(ruta.duration) };
}

module.exports = {
  sugerencias,
  detalleLugar,
  calcularRuta,
  ErrorMapa,
  MENSAJES,
  URL_AUTOCOMPLETE,
  URL_DETALLE,
  URL_RUTAS,
  FIELD_MASK_AUTOCOMPLETE,
  FIELD_MASK_DETALLE,
  FIELD_MASK_RUTAS,
  TIMEOUT_MS,
};
