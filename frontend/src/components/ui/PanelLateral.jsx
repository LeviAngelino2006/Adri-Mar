import { useEffect, useId, useRef } from 'react';
import './PanelLateral.css';

const ICONO_CERRAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

// Panel lateral (drawer): el detalle de un elemento de una lista y lo que se
// puede hacer con él, sin salir de la lista. Desde 640px se ancla a la derecha
// (hasta 480px de ancho); en el celular ocupa toda la pantalla. Ver
// docs/design-system/componentes/PanelLateral.md.
//  - Se cierra con la ✕, con Escape o tocando el fondo.
//  - Mientras está abierto, la página de atrás no scrollea.
//  - Al abrirse lleva el foco al título; al cerrarse lo devuelve a lo que lo abrió.
//  - `onVolver`: muestra "← Volver" arriba del título (un paso adentro del panel).
//  - `vista`: cuando cambia (por ejemplo, de un resumen a un formulario), el
//    cuerpo vuelve arriba y el foco va al título nuevo.
function PanelLateral({ titulo, subtitulo, onClose, onVolver, vista, children }) {
  const tituloId = useId();
  const refTitulo = useRef(null);
  const refCuerpo = useRef(null);

  useEffect(() => {
    function alTeclear(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  // Bloqueo del scroll de la página y devolución del foco al cerrar.
  useEffect(() => {
    const previo = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previo && typeof previo.focus === 'function' && document.contains(previo)) previo.focus();
    };
  }, []);

  useEffect(() => {
    if (refCuerpo.current) refCuerpo.current.scrollTop = 0;
    refTitulo.current?.focus();
  }, [vista]);

  return (
    <div className="panel-lateral-overlay" onClick={onClose}>
      <aside
        className="panel-lateral"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-lateral-encabezado">
          <div className="panel-lateral-titulos">
            {onVolver && (
              <button type="button" className="back-link panel-lateral-volver" onClick={onVolver}>
                ← Volver
              </button>
            )}
            <h2 id={tituloId} ref={refTitulo} className="panel-lateral-titulo" tabIndex={-1}>
              {titulo}
            </h2>
            {subtitulo && <p className="panel-lateral-subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="panel-lateral-cerrar" onClick={onClose} aria-label="Cerrar">
            {ICONO_CERRAR}
          </button>
        </div>

        <div ref={refCuerpo} className="panel-lateral-cuerpo">
          {children}
        </div>
      </aside>
    </div>
  );
}

export default PanelLateral;
