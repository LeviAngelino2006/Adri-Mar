import Button from '../ui/Button';
import './ModalDocumentacion.css';

function ModalVisorPdf({ open, onClose, documento, vehiculo, chofer }) {
  if (!open || !documento || !documento.signedUrl) return null;

  async function handleDescargar() {
    try {
      const response = await fetch(documento.signedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documento.nombreOriginal || `${documento.tipoDocumento?.codigo || 'documento'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(documento.signedUrl, '_blank');
    }
  }

  const sujetoLabel = chofer
    ? `Chofer: ${chofer.nombre} ${chofer.apellido} (DNI ${chofer.dni || '-'})`
    : `Unidad ${vehiculo?.numeroInterno} (${vehiculo?.dominio})`;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-visor-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-doc-header">
          <div>
            <h2>{documento.tipoDocumento?.descripcion || 'Visor de Documento'}</h2>
            <p className="modal-doc-subtitle">
              {sujetoLabel} — {documento.nombreOriginal || 'archivo.pdf'}
            </p>
          </div>
          <div className="modal-visor-header-actions">
            <Button variant="primary" size="sm" onClick={handleDescargar}>
              Descargar PDF
            </Button>
            <a
              href={documento.signedUrl}
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
            src={documento.signedUrl}
            title={documento.nombreOriginal || 'Visor de PDF'}
            className="modal-visor-iframe"
          />
        </div>

        <div className="modal-visor-footer">
          <span className="modal-visor-meta">
            Subido por: {documento.usuario?.nombre} {documento.usuario?.apellido} — {new Date(documento.creadoEn).toLocaleDateString()}
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
