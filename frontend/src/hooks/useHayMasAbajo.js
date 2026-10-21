import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Para el cuerpo con scroll propio de un modal: `true` mientras queda contenido
// por ver más abajo. El modal lo usa para mostrar un degradé en el borde de abajo
// del cuerpo, encima del pie con los botones (ver ConfirmModal y ModalMarco).
//
// Devuelve { ref, hayMas, alScrollear }: `ref` (un callback ref) va en el
// elemento que scrollea y `alScrollear` en su onScroll. Se vuelve a medir:
//  - después de cada render del modal (cambió el contenido: un aviso, un error);
//  - cuando el cuerpo cambia de tamaño (la ventana, el teclado del celular);
//  - cuando cambia algo adentro sin que el modal se renderice (un componente
//    hijo que agrega una opción o un mensaje).
export function useHayMasAbajo() {
  const nodo = useRef(null);
  const [hayMas, setHayMas] = useState(false);

  const medir = useCallback(() => {
    const el = nodo.current;
    if (!el) return;
    // 1px de tolerancia: con zoom el scroll puede quedar a medio píxel del final.
    setHayMas(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  // Sin dependencias a propósito: se mide después de cada render. setHayMas con
  // el mismo valor no vuelve a renderizar.
  useLayoutEffect(medir);

  // Callback ref: el modal se puede montar cerrado y abrirse después, así que los
  // observadores se conectan cuando aparece el elemento (y se desconectan con la
  // función de limpieza que devuelve el ref).
  const ref = useCallback(
    (el) => {
      nodo.current = el;
      if (!el) return undefined;
      const observadores = [];
      if (typeof ResizeObserver !== 'undefined') {
        const tamano = new ResizeObserver(medir);
        tamano.observe(el);
        observadores.push(tamano);
      }
      if (typeof MutationObserver !== 'undefined') {
        const contenido = new MutationObserver(medir);
        contenido.observe(el, { childList: true, subtree: true, characterData: true });
        observadores.push(contenido);
      }
      return () => {
        observadores.forEach((o) => o.disconnect());
        nodo.current = null;
      };
    },
    [medir]
  );

  return { ref, hayMas, alScrollear: medir };
}
