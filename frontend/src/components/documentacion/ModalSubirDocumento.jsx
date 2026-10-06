import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Alert from '../ui/Alert';
import api from '../../services/api';
import './ModalDocumentacion.css';

function ModalSubirDocumento({
  open,
  onClose,
  vehiculo,
  tipoDocumento,
  documentoActual,
  onSuccess,
}) {
  const [archivo, setArchivo] = useState(null);
  const [fechaEmision, setFechaEmision] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setArchivo(null);
      setError('');
      if (documentoActual) {
        setFechaEmision(documentoActual.fechaEmision ? documentoActual.fechaEmision.substring(0, 10) : '');
        setFechaVencimiento(documentoActual.fechaVencimiento ? documentoActual.fechaVencimiento.substring(0, 10) : '');
        setObservaciones(documentoActual.observaciones || '');
      } else {
        setFechaEmision('');
        setFechaVencimiento('');
        setObservaciones('');
      }
    }
  }, [open, documentoActual]);

  if (!open || !vehiculo || !tipoDocumento) return null;

  const esRenovacion = !!documentoActual;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Solo se admiten archivos en formato PDF.');
      setArchivo(null);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('El archivo supera el tamaño máximo permitido (15 MB).');
      setArchivo(null);
      return;
    }

    setError('');
    setArchivo(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (tipoDocumento.requiereArchivo && !archivo && !esRenovacion) {
      setError('Debes adjuntar un archivo PDF para este documento.');
      return;
    }

    if (tipoDocumento.requiereVencimiento && !fechaVencimiento) {
      setError('La fecha de vencimiento es obligatoria.');
      return;
    }

    if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
      setError('La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
      return;
    }

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('tipoDocumentoId', tipoDocumento.id);
      if (fechaEmision) formData.append('fechaEmision', fechaEmision);
      if (fechaVencimiento) formData.append('fechaVencimiento', fechaVencimiento);
      if (observaciones) formData.append('observaciones', observaciones);
      if (archivo) formData.append('archivo', archivo);

      const { data } = await api.post(`/documentos/vehiculos/${vehiculo.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onSuccess(data.documento);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar el documento. Intentá nuevamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-doc-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-doc-header">
          <div>
            <h2>{esRenovacion ? 'Renovar / Actualizar Documento' : 'Registrar Documento'}</h2>
            <p className="modal-doc-subtitle">
              {tipoDocumento.descripcion} — Unidad <strong>{vehiculo.numeroInterno}</strong> ({vehiculo.dominio})
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <form onSubmit={handleSubmit} className="modal-doc-form">
          {tipoDocumento.requiereArchivo ? (
            <div className="file-upload-zone">
              <label className="file-upload-label">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="file-upload-input"
                />
                <div className="file-upload-content">
                  <span className="file-upload-icon">📄</span>
                  {archivo ? (
                    <div>
                      <p className="file-upload-name">{archivo.name}</p>
                      <p className="file-upload-size">{(archivo.size / 1024).toFixed(1)} KB — Click para cambiar</p>
                    </div>
                  ) : esRenovacion ? (
                    <div>
                      <p className="file-upload-text">Seleccioná un nuevo PDF para reemplazar el actual</p>
                      <p className="file-upload-hint">Dejá vacío si solo deseás actualizar fechas/notas</p>
                    </div>
                  ) : (
                    <div>
                      <p className="file-upload-text">Click para seleccionar archivo PDF</p>
                      <p className="file-upload-hint">Máximo 15 MB — Solo formato .PDF</p>
                    </div>
                  )}
                </div>
              </label>
            </div>
          ) : (
            <div className="notice-box">
              <span className="notice-icon">ℹ️</span>
              <div>
                <strong>Trámite sin archivo digital obligatorio</strong>
                <p>Este control ({tipoDocumento.descripcion}) registra la vigencia y observaciones en el legajo de la unidad sin requerir PDF.</p>
              </div>
            </div>
          )}

          <div className="modal-doc-grid">
            <FormField label="Fecha de emisión" error={null}>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
                className="modal-doc-input"
              />
            </FormField>

            <FormField
              label={`Fecha de vencimiento ${tipoDocumento.requiereVencimiento ? '*' : ''}`}
              error={null}
            >
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                required={tipoDocumento.requiereVencimiento}
                className="modal-doc-input"
              />
            </FormField>
          </div>

          <FormField label="Observaciones o notas adicionales" error={null}>
            <textarea
              rows="3"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Póliza N° 584920 - La Segunda Seguros"
              className="modal-doc-textarea"
            />
          </FormField>

          <div className="modal-doc-actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" loading={enviando}>
              {esRenovacion ? 'Guardar renovación' : 'Guardar documento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ModalSubirDocumento;
