import { useLayoutEffect, useRef } from 'react';
import './BarraAccionFija.css';

const VARIABLE_ALTO = '--alto-barra-accion';

// Acción principal de una ficha ("Comenzar viaje", "Finalizar viaje"). En el
// celular (menos de 768px) va en una barra fija al pie, a todo el ancho y por
// encima del safe area de iPhone; en escritorio queda en su lugar, debajo de la
// ficha, como cualquier fila de acciones (`className` le pone esa clase).
//
// Mientras está fija publica su alto en --alto-barra-accion (en <html>): el
// contenido (.layout-content) lo suma a su padding de abajo para que la barra no
// tape el último dato, y el Toast se muestra encima de la barra. En escritorio
// el alto publicado es 0.
function BarraAccionFija({ className = '', children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const barra = ref.current;
    const raiz = document.documentElement;
    function medir() {
      const fija = window.getComputedStyle(barra).position === 'fixed';
      raiz.style.setProperty(VARIABLE_ALTO, `${fija ? barra.offsetHeight : 0}px`);
    }

    medir();
    // Cambia de alto con el contenido (el motivo de un "Comenzar viaje"
    // deshabilitado) y de ancho al cruzar los 768px (fija o en su lugar).
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    observador?.observe(barra);
    return () => {
      observador?.disconnect();
      raiz.style.removeProperty(VARIABLE_ALTO);
    };
  }, []);

  return (
    <div ref={ref} className={`barra-accion-fija ${className}`.trim()}>
      {children}
    </div>
  );
}

export default BarraAccionFija;
