const BASE = 'https://www.google.com/maps/dir/?api=1';
// Sin contexto geográfico, "San Martín" o "Museo del Kempes" pueden
// resolverse en cualquier lado. Si el nombre no trae coma (ej. "Alta Gracia,
// Córdoba"), se le agrega la provincia.
const conContexto = (nombre) => (nombre.includes(',') ? nombre : `${nombre}, Córdoba, Argentina`);

// Link a la ruta completa (origen → paradas → destino) en Google Maps, para que
// el encargado lea los km y el tiempo. Usa el formato oficial de Google Maps
// URLs: no necesita API key ni tiene costo. Devuelve null si falta el origen o
// el destino. Las paradas sin nombre se ignoran.
//
// Google Maps admite hasta 9 puntos intermedios en estos links (el mismo máximo
// que el formulario); la app del celular puede mostrar menos.
export function urlRecorrido({ origen, paradas = [], destino }) {
  if (!origen?.nombre || !destino?.nombre) return null;
  const params = new URLSearchParams({
    origin: conContexto(origen.nombre),
    destination: conContexto(destino.nombre),
    travelmode: 'driving',
  });
  const intermedias = paradas.map((p) => p?.nombre).filter(Boolean).map(conContexto);
  if (intermedias.length) params.set('waypoints', intermedias.join('|'));
  return `${BASE}&${params.toString()}`;
}
