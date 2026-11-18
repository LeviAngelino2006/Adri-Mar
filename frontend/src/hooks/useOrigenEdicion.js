import { useCallback, useState } from 'react';

export const VOLVER_A_LA_FICHA = '← Volver a la ficha';
export const VOLVER_AL_LISTADO = '← Volver al listado';

// A dónde vuelve un formulario de alta o edición en las páginas que alternan
// listado / ficha / formulario en una sola ruta (Flota, Viajes, Personal,
// Usuarios). La regla (SCRUM-263):
//  - Abierto desde una ficha: cancelar o guardar vuelve a ESA ficha; al guardar,
//    con el registro que devolvió el backend (los datos actualizados).
//  - Abierto desde el listado: cancelar o guardar vuelve al listado.
//  - Alta: cancelar vuelve al listado; guardar abre la ficha del registro nuevo.
//
// `setSeleccionado` es el setter de la ficha abierta de la página: el
// formulario la cierra al abrirse (las vistas son excluyentes) y la vuelve a
// abrir al salir, si corresponde.
//
// Uso:
//   const origen = useOrigenEdicion(setSeleccionado);
//   abrirEditar(v)  → origen.abrir(seleccionado)   (o origen.abrir() desde el listado)
//   abrirNuevo()    → origen.abrir()
//   cancelar        → origen.cancelar()
//   guardado OK     → origen.guardado(registroDelBackend, { esAlta })
//   link de arriba  → {origen.textoVolver}
export function useOrigenEdicion(setSeleccionado) {
  // El registro de la ficha desde la que se abrió el formulario, o null.
  const [fichaOrigen, setFichaOrigen] = useState(null);

  const abrir = useCallback(
    (ficha = null) => {
      setFichaOrigen(ficha);
      setSeleccionado(null);
    },
    [setSeleccionado]
  );

  const cancelar = useCallback(() => {
    setSeleccionado(fichaOrigen);
    setFichaOrigen(null);
  }, [fichaOrigen, setSeleccionado]);

  // Si la respuesta no trajera el registro, se vuelve a la ficha de origen tal
  // como estaba (o al listado, en un alta) en vez de a una ficha vacía.
  const guardado = useCallback(
    (registro, { esAlta = false } = {}) => {
      setSeleccionado(esAlta || fichaOrigen ? (registro ?? fichaOrigen) : null);
      setFichaOrigen(null);
    },
    [fichaOrigen, setSeleccionado]
  );

  return {
    vuelveAFicha: fichaOrigen !== null,
    textoVolver: fichaOrigen ? VOLVER_A_LA_FICHA : VOLVER_AL_LISTADO,
    abrir,
    cancelar,
    guardado,
  };
}

export default useOrigenEdicion;
