import Button from '../ui/Button';
import { formatearNombreArchivo } from '../../utils/archivoFormato';
import { descargarPdf } from '../../utils/descargarPdf';
import { formatearSoloFecha } from '../../utils/viajeFormato';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import './ModalDocumentacion.css';

// `url` es la URL firmada que pidió la página al abrir el visor.
function ModalVisorPdf({ open, onClose, documento, url, vehiculo, chofer }) {
  if (!open || !documento || !url) return null;

  function handleDescargar() {
    return descargarPdf(url, {
      nombreArchivo: documento.nombreArchivo,
      codigoTipo: documento.tipoDocumento?.descripcion,
    });
  }

  const sujetoLabel = chofer
    ? `Chofer: ${chofer.nombre} ${chofer.apellido} (DNI ${chofer.dni || '-'})`
    : `Unidad ${vehiculo?.numeroInterno} (${vehiculo?.dominio})`;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-visor-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-doc-header">
          <div>
            <h2>{documento.tipoDocumento ? etiquetaTipoDocumento(documento.tipoDocumento.descripcion) : 'Visor de Documento'}</h2>
            <p className="modal-doc-subtitle">
              {sujetoLabel} — {formatearNombreArchivo(documento.nombreArchivo) || 'archivo.pdf'}
            </p>
          </div>
          <div className="modal-visor-header-actions">
            <Button variant="primary" onClick={handleDescargar}>
              Descargar PDF
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-link-action"
            >
              Abrir en pestaña nueva ↗
            </a>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar visor">
              ✕
            </button>
          </div>
        </div>

        <div className="modal-visor-body">
          <iframe
            src={url}
            title={documento.nombreArchivo || 'Visor de PDF'}
            className="modal-visor-iframe"
          />
        </div>

        <div className="modal-visor-footer">
          <span className="modal-visor-meta">
            Subido por: {documento.usuario?.nombre} {documento.usuario?.apellido} — {formatearSoloFecha(documento.creadoEn)}
          </span>
          <div>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModalVisorPdf;
