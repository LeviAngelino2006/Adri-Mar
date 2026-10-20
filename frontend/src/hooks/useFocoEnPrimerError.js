import { useCallback, useEffect, useRef, useState } from 'react';
import { enfocarSinAbrir } from '../utils/focoSinAbrir';

// Lleva el foco (y el scroll) al primer campo con error de un formulario,
// después de que se pintan los errores. El "primero" es el primero en pantalla:
// se busca en el DOM el primer control con aria-invalid (lo pone FormField), así
// el orden no hay que mantenerlo a mano en cada formulario. Si el error no es de
// un campo (por ejemplo, el general del backend), se scrollea hasta el mensaje.
//
// Uso: const [refForm, enfocarPrimerError] = useFocoEnPrimerError();
//      <form ref={refForm}> … y enfocarPrimerError() junto con setErrores(…).
export function useFocoEnPrimerError() {
  const refForm = useRef(null);
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (pedido === 0 || !refForm.current) return;
    const campo = refForm.current.querySelector('[aria-invalid="true"]');
    const destino = campo || refForm.current.querySelector('[role="alert"]');
    if (!destino) return;
    // Centrado: arriba de todo quedaría tapado por el encabezado fijo.
    destino.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    // Sin abrir la lista de un selector: taparía los errores de abajo.
    if (campo) enfocarSinAbrir(campo);
  }, [pedido]);

  const enfocarPrimerError = useCallback(() => setPedido((n) => n + 1), []);
  return [refForm, enfocarPrimerError];
}
