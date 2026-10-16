// Reglas del recorrido de un viaje (origen → paradas → destino), sin tocar la
// base. Las usan viajeService (alta y edición de viajes) y
// estimacionRecorridoService (cálculo de km), para que un recorrido que se
// puede guardar sea exactamente uno que se puede estimar, y al revés.
//
// Paradas: puntos intermedios ORDENADOS entre origen y destino. El front manda
// solo los ids de ubicación en el orden del recorrido. Una ubicación SÍ puede
// repetirse (un ida y vuelta pasa dos veces por el mismo lugar); lo único que no
// puede es repetirse de forma CONSECUTIVA.

// Es el límite de puntos intermedios de los links de Google Maps.
const MAX_PARADAS = 9;

function campoAusente(valor) {
  return valor === undefined || valor === null || valor === '';
}

// Origen y destino: obligatorios y enteros positivos. origen == destino solo es
// un error si el recorrido NO tiene paradas: con al menos una es un ida y
// vuelta legítimo (Río Tercero → Córdoba → Río Tercero). El caso con paradas lo
// cubre errorDeSecuencia. Devuelve los ids numéricos y los errores por campo.
function validarExtremosRecorrido({ origenId, destinoId }, { hayParadas = false } = {}) {
  const errores = {};

  const origenIdNumero = Number(origenId);
  if (campoAusente(origenId)) {
    errores.origenId = 'El origen es obligatorio';
  } else if (!Number.isInteger(origenIdNumero) || origenIdNumero <= 0) {
    errores.origenId = 'El origen elegido no es válido';
  }

  const destinoIdNumero = Number(destinoId);
  if (campoAusente(destinoId)) {
    errores.destinoId = 'El destino es obligatorio';
  } else if (!Number.isInteger(destinoIdNumero) || destinoIdNumero <= 0) {
    errores.destinoId = 'El destino elegido no es válido';
  }

  if (!errores.origenId && !errores.destinoId && !hayParadas && origenIdNumero === destinoIdNumero) {
    errores.destinoId = 'El destino no puede ser el mismo que el origen';
  }

  return { origenId: origenIdNumero, destinoId: destinoIdNumero, errores };
}

// Forma de la lista de paradas: ausente/null → [], si viene tiene que ser un
// arreglo de enteros positivos y no pasar el máximo.
function validarFormatoParadas(valor) {
  if (valor === undefined || valor === null) return { ids: [], errores: {} };

  if (!Array.isArray(valor)) {
    return { ids: [], errores: { paradas: 'Debe ser una lista de ids de ubicaciones' } };
  }

  const ids = valor.map((v) => (typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return { ids: [], errores: { paradas: 'La lista tiene ubicaciones que no son válidas' } };
  }
  if (ids.length > MAX_PARADAS) {
    return { ids: [], errores: { paradas: `Máximo ${MAX_PARADAS} paradas` } };
  }

  return { ids, errores: {} };
}

// Revisa la secuencia COMPLETA [origen, ...paradas, destino]: dos puntos
// consecutivos no pueden ser la misma ubicación. Devuelve el mensaje del primer
// problema o null. Con 0 paradas, origen == destino no se reporta acá: ya lo
// cubre validarExtremosRecorrido con su mensaje de siempre, en destinoId.
function errorDeSecuencia(origenId, paradas, destinoId) {
  const secuencia = [origenId, ...paradas, destinoId];

  for (let i = 1; i < secuencia.length; i += 1) {
    if (secuencia[i] !== secuencia[i - 1]) continue;

    const esDestino = i === secuencia.length - 1;
    if (!esDestino) return `La parada ${i} es igual al punto anterior`;
    if (paradas.length > 0) return `La parada ${paradas.length} es igual al destino`;
  }

  return null;
}

module.exports = {
  MAX_PARADAS,
  campoAusente,
  validarExtremosRecorrido,
  validarFormatoParadas,
  errorDeSecuencia,
};
