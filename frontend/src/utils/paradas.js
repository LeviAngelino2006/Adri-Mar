// Lista de paradas intermedias del formulario de viaje, como funciones puras
// (no tocan el estado de React: reciben una lista y devuelven otra).
//
// Cada parada del formulario es { clave, id, nombre }:
//  - `clave` identifica a la FILA, no a la ubicación (una ubicación puede repetirse
//    en un ida y vuelta). Es la `key` de React: al reordenar, cada selector se
//    mueve con su texto en vez de quedarse en el lugar y mostrar el de otra fila.
//  - `id` y `nombre` son la ubicación elegida; '' mientras la fila está vacía.

// Es el límite de puntos intermedios de los links de Google Maps y el que valida
// el backend (MAX_PARADAS en viajeService).
export const MAX_PARADAS = 9;

export const ERROR_PARADA_VACIA = 'Elegí una ubicación o quitá la parada';

let contador = 0;

export function nuevaParada(ubicacion) {
  contador += 1;
  return { clave: `parada-${contador}`, id: ubicacion?.id ?? '', nombre: ubicacion?.nombre ?? '' };
}

// Las paradas que devuelve la API ([{ orden, ubicacion: { id, nombre } }],
// ya ordenadas) como filas del formulario.
export function paradasDesdeViaje(viaje) {
  return (viaje?.paradas ?? []).map((parada) => nuevaParada(parada.ubicacion));
}

// Agrega una fila vacía al final (o sea, antes del destino). Con el máximo
// alcanzado devuelve la misma lista.
export function agregarParada(lista) {
  return lista.length >= MAX_PARADAS ? lista : [...lista, nuevaParada()];
}

export function quitarParada(lista, clave) {
  return lista.filter((parada) => parada.clave !== clave);
}

// Mueve la fila de `indice` una posición hacia arriba (delta -1) o abajo (+1).
// En los bordes (la primera hacia arriba, la última hacia abajo) no hace nada.
export function moverParada(lista, indice, delta) {
  const destino = indice + delta;
  if (indice < 0 || indice >= lista.length || destino < 0 || destino >= lista.length) return lista;

  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

// Elige (o vacía, con `item` null) la ubicación de una fila.
export function elegirUbicacion(lista, clave, item) {
  return lista.map((parada) =>
    parada.clave === clave ? { ...parada, id: item?.id ?? '', nombre: item?.nombre ?? '' } : parada
  );
}

// Arma lo que viaja al backend: los ids de las paradas, en orden. NO descarta
// en silencio las filas vacías: una fila sin ubicación elegida es un error de esa
// fila (`errores`, por clave) y quien guarda tiene que frenar el envío. Así el
// backend solo recibe ids válidos y nadie pierde una parada sin enterarse.
export function paradasAPayload(lista) {
  const ids = [];
  const errores = {};

  for (const parada of lista) {
    if (parada.id === '' || parada.id === null || parada.id === undefined) {
      errores[parada.clave] = ERROR_PARADA_VACIA;
    } else {
      ids.push(Number(parada.id));
    }
  }

  return { ids, errores };
}

// Misma regla que valida el backend, para avisar antes de enviar: en la
// secuencia completa [origen, ...paradas, destino] dos puntos CONSECUTIVOS no
// pueden ser la misma ubicación (una ubicación sí puede repetirse si no es
// consecutiva). Devuelve el mensaje del primer problema o null. Con 0 paradas no
// dice nada: origen == destino lo informa el backend en el campo destino.
export function errorDeSecuencia(origenId, ids, destinoId) {
  if (ids.length === 0) return null;

  const secuencia = [Number(origenId), ...ids, Number(destinoId)];
  for (let i = 1; i < secuencia.length; i += 1) {
    if (secuencia[i] !== secuencia[i - 1]) continue;

    return i === secuencia.length - 1
      ? `La parada ${ids.length} es igual al destino`
      : `La parada ${i} es igual al punto anterior`;
  }
  return null;
}
