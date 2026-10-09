import { useEffect, useId } from 'react';
import './ModalDocumentacion.css';

const ICONO_CERRAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

// Marco común de los modales de Documentación (carga, historial y visor): fondo
// `overlay`, tarjeta con título y subtítulo, botón para cerrar y, opcionalmente,
// un pie de acciones. `variante`: 'normal' (formulario), 'ancho' (historial) o
// 'visor' (PDF, ocupa casi toda la pantalla).
function ModalMarco({ titulo, subtitulo, onClose, variante = 'normal', pie, children }) {
  const tituloId = useId();

  useEffect(() => {
    function alTeclear(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <div className="doc-modal-overlay" onClick={onClose}>
      <div
        className={variante === 'normal' ? 'doc-modal' : `doc-modal doc-modal-${variante}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="doc-modal-encabezado">
          <div className="doc-modal-titulos">
            <h2 id={tituloId} className="doc-modal-titulo">
              {titulo}
            </h2>
            {subtitulo && <p className="doc-modal-subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="doc-modal-cerrar" onClick={onClose} aria-label="Cerrar">
            {ICONO_CERRAR}
          </button>
        </div>

        <div className="doc-modal-cuerpo">{children}</div>

        {pie && <div className="doc-modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

export default ModalMarco;
