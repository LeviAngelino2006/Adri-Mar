const BASE = 'https://www.google.com/maps/dir/?api=1';
// Sin contexto geográfico, "San Martín" o "Museo del Kempes" pueden
// resolverse en cualquier lado. Si el nombre no trae coma (ej. "Alta Gracia,
// Córdoba"), se le agrega la provincia.
const conContexto = (nombre) => (nombre.includes(',') ? nombre : `${nombre}, Córdoba, Argentina`);

const tieneCoordenadas = (punto) => Number.isFinite(punto?.latitud) && Number.isFinite(punto?.longitud);

// Cómo se escribe un punto en el link, del más preciso al menos:
//  - placeId (lugar elegido en el buscador de Google): el texto es el nombre y
//    el placeId va aparte (origin_place_id, …); Google usa el placeId y el
//    texto solo se muestra. Así el chofer llega a la dirección exacta.
//  - coordenadas "lat,lng" (localidades de Georef);
//  - el nombre con la provincia (ubicaciones que todavía no están en el mapa).
function textoDelPunto(punto) {
  if (!punto.placeId && tieneCoordenadas(punto)) return `${punto.latitud},${punto.longitud}`;
  return conContexto(punto.nombre);
}

// Link a la ruta completa (origen → paradas → destino) en Google Maps, para que
// el encargado lea los km y el tiempo y el chofer navegue. Usa el formato
// oficial de Google Maps URLs: no necesita API key ni tiene costo. Devuelve
// null si falta el origen o el destino. Las paradas sin nombre se ignoran.
//
// waypoint_place_ids va solo si TODAS las paradas tienen placeId: Google los
// empareja por posición con waypoints y no documenta cómo dejar un hueco. Si
// alguna no tiene, las que sí tienen van por su nombre-dirección (las
// particulares se llaman como su dirección) o sus coordenadas.
//
// Google Maps admite hasta 9 puntos intermedios en estos links (el mismo máximo
// que el formulario); en el navegador del celular, hasta 3.
//
// origen / destino / cada parada: { nombre, placeId?, latitud?, longitud? }.
export function urlRecorrido({ origen, paradas = [], destino }) {
  if (!origen?.nombre || !destino?.nombre) return null;
  const params = new URLSearchParams({
    origin: textoDelPunto(origen),
    destination: textoDelPunto(destino),
    travelmode: 'driving',
  });
  if (origen.placeId) params.set('origin_place_id', origen.placeId);
  if (destino.placeId) params.set('destination_place_id', destino.placeId);

  const intermedias = paradas.filter((p) => p?.nombre);
  if (intermedias.length) {
    const todasConPlaceId = intermedias.every((p) => p.placeId);
    params.set(
      'waypoints',
      intermedias
        .map((p) => (todasConPlaceId ? textoDelPunto(p) : textoDelPunto({ ...p, placeId: null })))
        .join('|')
    );
    if (todasConPlaceId) params.set('waypoint_place_ids', intermedias.map((p) => p.placeId).join('|'));
  }
  return `${BASE}&${params.toString()}`;
}
