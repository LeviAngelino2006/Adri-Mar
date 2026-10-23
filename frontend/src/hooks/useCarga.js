import { useCallback, useEffect, useState } from 'react';

// Carga de datos de una pantalla o un panel con sus tres estados: cargando,
// error y listo. `pedir` es una función que devuelve una promesa con los datos;
// quien la pasa la memoriza con useCallback, y cada vez que cambia (por ejemplo,
// porque cambiaron los filtros) se vuelve a pedir.
//
// Devuelve { datos, cargando, error, recargar }:
//  - cargando: true desde que se pide hasta que llega la respuesta. No se guarda
//    aparte: se deriva de si el último resultado corresponde al pedido actual
//    (mismo `pedir` y mismo intento), así no hace falta un setState dentro del
//    efecto y una respuesta vieja nunca pisa a una nueva.
//  - error: el error del último pedido (o null). Un error NO es un listado
//    vacío: la pantalla tiene que mostrarlo distinto (ver EstadoCarga).
//  - recargar(): vuelve a pedir con el mismo `pedir` (botón "Reintentar", o
//    después de guardar algo).
//  - datos: los del último pedido que salió bien; mientras se recarga quedan
//    los anteriores.
export function useCarga(pedir) {
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let vigente = true;
    pedir().then(
      (datos) => vigente && setResultado({ pedir, intento, datos, error: null }),
      (error) => vigente && setResultado((anterior) => ({ pedir, intento, datos: anterior?.datos, error }))
    );
    return () => {
      vigente = false;
    };
  }, [pedir, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  const alDia = resultado !== null && resultado.pedir === pedir && resultado.intento === intento;

  return {
    datos: resultado?.datos,
    cargando: !alDia,
    error: alDia ? resultado.error : null,
    recargar,
  };
}

export default useCarga;
