// Texto que el modal de Confirmar viaje muestra ARRIBA de los selects cuando el viaje
// no tiene candidatos cargados, para que se entienda por qué no aparecen los radios
// con "Elegir otro…" y qué hay que hacer.
//
// Un viaje "no tiene candidatos" cuando la lista llegó y está VACÍA. Si la clave no
// vino (un perfil que no la ve, o un viaje de otro origen) no se sabe, y decir "no
// tiene … cargados" sería falso: en ese caso no se muestra nada.
//
// Devuelve dónde va cada texto: arriba del bloque de chofer o arriba del de vehículo.
// Si faltan los dos hay un solo texto, arriba del primero.

export const SIN_CHOFERES_NI_VEHICULOS =
  'Este viaje no tiene choferes ni vehículos posibles cargados. Elegí uno de la lista.';
export const SIN_CHOFERES = 'Este viaje no tiene choferes posibles cargados. Elegí uno de la lista.';
export const SIN_VEHICULOS = 'Este viaje no tiene vehículos posibles cargados. Elegí uno de la lista.';

const llegoVacia = (lista) => Array.isArray(lista) && lista.length === 0;

export function avisosSinCandidatos(viaje) {
  const sinChoferes = llegoVacia(viaje?.choferesCandidatos);
  const sinVehiculos = llegoVacia(viaje?.vehiculosCandidatos);

  if (sinChoferes && sinVehiculos) {
    return { antesDeChofer: SIN_CHOFERES_NI_VEHICULOS, antesDeVehiculo: null };
  }

  return {
    antesDeChofer: sinChoferes ? SIN_CHOFERES : null,
    antesDeVehiculo: sinVehiculos ? SIN_VEHICULOS : null,
  };
}
