const { normalizarNombre } = require('./normalizarNombre');

// Cuándo una geocodificación de ORS (Pelias) merece que el encargado la revise.
// No hay forma de saber con certeza si ORS eligió bien el lugar ("Cosquin" sin
// tilde resuelve a una calle de Córdoba capital, con coincidencia "exacta"): la
// defensa es mostrar cómo se interpretó cada punto, y estas reglas deciden
// cuáles resaltar. Son a propósito simples y explicables; un falso positivo solo
// pide mirar el punto, un falso negativo es lo que ya pasaba antes.
//
//  CALLE           Pelias lo ubicó en una calle o dirección (layer street/address)
//                  pero el nombre cargado no parece una dirección (sin altura ni
//                  "Av.", "Calle", "Ruta"…). Ej.: "Cosquin" → calle Cosquín.
//  NOMBRE_DISTINTO El nombre cargado no aparece dentro del nombre del lugar
//                  encontrado (sin mayúsculas ni tildes). Ej.: "Villa Gral
//                  Belgrano" → "Vila"; "Museo del Kempes" → "Parque del Kempes".
//  OTRA_PROVINCIA  Se buscó en Córdoba (el nombre no traía coma, ver
//                  conContexto) y quedó en otra provincia. Ej.: → "Vila, SF".

const CAPAS_CALLE = new Set(['street', 'address']);
const CODIGO_CORDOBA = 'CD';

// Altura ("Colón 1000") o un prefijo típico de calle.
const PARECE_DIRECCION =
  /\d|^(calle|av|avda|avenida|bv|bvd|bulevar|boulevard|ruta|rp|rn|pje|pasaje|camino|diagonal|costanera)\b/i;

// Solo la parte antes de la primera coma: "Rosario, Santa Fe" → "Rosario".
const parteLugar = (texto) => (texto || '').split(',')[0];

// interpretado: { capa, nombreInterpretado, provincia } (layer, name y region_a
// de Pelias). Devuelve la lista de motivos, vacía si no hay nada que revisar.
function motivosRevision(nombre, { capa, nombreInterpretado, provincia }) {
  const motivos = [];
  const lugar = parteLugar(nombre).trim();

  if (CAPAS_CALLE.has(capa) && !PARECE_DIRECCION.test(lugar)) motivos.push('CALLE');

  const buscado = normalizarNombre(lugar);
  const encontrado = normalizarNombre(parteLugar(nombreInterpretado));
  if (buscado && !encontrado.includes(buscado)) motivos.push('NOMBRE_DISTINTO');

  if (!nombre.includes(',') && provincia && provincia !== CODIGO_CORDOBA) motivos.push('OTRA_PROVINCIA');

  return motivos;
}

module.exports = { motivosRevision };
