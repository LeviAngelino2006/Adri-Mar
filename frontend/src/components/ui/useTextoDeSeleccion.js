import { useState } from 'react';

// Texto del input de un selector de "buscar o crear" (SelectorBuscarOCrear,
// SelectorUbicacion), atado a la selección que maneja el padre (valor y
// valorNombre).
//
// Si la selección cambia desde afuera (ej. el formulario carga un viaje para
// editar), se muestra su nombre. Cuando el padre la vacía porque el usuario
// empezó a escribir encima (onSeleccionar(null)), el texto NO se toca: si no, se
// borraría lo que está escribiendo. Se ajusta durante el render, no en un efecto
// (patrón de React para estado que depende de una prop).
function useTextoDeSeleccion(valor, valorNombre) {
  const [texto, setTexto] = useState(valorNombre || '');
  const seleccion = `${valor ?? ''}|${valorNombre ?? ''}`;
  const [seleccionPrevia, setSeleccionPrevia] = useState(seleccion);
  if (seleccion !== seleccionPrevia) {
    setSeleccionPrevia(seleccion);
    if (valor) setTexto(valorNombre || '');
  }
  return [texto, setTexto];
}

export default useTextoDeSeleccion;
