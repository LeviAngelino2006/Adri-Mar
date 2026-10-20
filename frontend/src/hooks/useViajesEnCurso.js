import { useCallback } from 'react';
import api from '../services/api';
import { useCarga } from './useCarga';

// Viajes En viaje que pueden impedir comenzar el viaje abierto en una ficha (ver
// viajeEnCursoQueBloquea). `endpoint` es '/viajes' (gestores: todos los viajes en
// curso) o '/viajes/mis-viajes' (los del propio usuario). Solo se pide mientras
// `clave` no es null (una ficha de un viaje Programado abierta); cambiar la clave
// (otro viaje, o el mismo con otro estado) vuelve a pedir, así después de
// finalizar un viaje no queda bloqueado el siguiente.
//
// Si el pedido falla devuelve [] y "Comenzar viaje" queda habilitado: el backend
// rechaza igual el comienzo con otro viaje en curso.
export function useViajesEnCurso(endpoint, clave) {
  const pedir = useCallback(
    () =>
      clave === null
        ? Promise.resolve([])
        : api.get(endpoint, { params: { estado: 'EN_VIAJE' } }).then(({ data }) => data.viajes),
    [endpoint, clave]
  );
  const { datos, error } = useCarga(pedir);
  return error ? [] : (datos ?? []);
}

export default useViajesEnCurso;
