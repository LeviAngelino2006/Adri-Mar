import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Alert from '../ui/Alert';
import api from '../../services/api';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { fechaCordobaISO, hoyCordobaISO } from '../../utils/fechaCordoba';
import './ModalDocumentacion.css';

const MAX_BYTES = 15 * 1024 * 1024;

function ModalSubirDocumento({
  open,
  onClose,
  vehiculo,
  chofer,
  tipoDocumento,
  documentoActual,
  onSuccess,
}) {
  const [archivo, setArchivo] = useState(null);
  const [fechaEmision, setFechaEmision] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Mensaje por campo (archivo, fechaEmision, fechaVencimiento), igual que los
  // `errores` que devuelve el backend; `error` es el mensaje general.
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setArchivo(null);
      setErrores({});
      setError('');
      if (documentoActual) {
        setFechaEmision(documentoActual.fechaEmision ? fechaCordobaISO(documentoActual.fechaEmision) : '');
        setFechaVencimiento(documentoActual.fechaVencimiento ? fechaCordobaISO(documentoActual.fechaVencimiento) : '');
        setObservaciones(documentoActual.observaciones || '');
      } else {
        setFechaEmision('');
        setFechaVencimiento('');
        setObservaciones('');
      }
    }
  }, [open, documentoActual]);

  if (!open || (!vehiculo && !chofer) || !tipoDocumento) return null;

  const esRenovacion = !!documentoActual;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrores((prev) => ({ ...prev, archivo: 'Solo se permiten archivos PDF.' }));
      setArchivo(null);
      return;
    }

    if (file.size > MAX_BYTES) {
      setErrores((prev) => ({ ...prev, archivo: 'El archivo supera el máximo de 15 MB.' }));
      setArchivo(null);
      return;
    }

    setErrores((prev) => ({ ...prev, archivo: undefined }));
    setArchivo(file);
  }

  function validar() {
    const nuevos = {};
    if (tipoDocumento.requiereArchivo && !archivo && !esRenovacion) {
      nuevos.archivo = 'Adjuntá un archivo PDF para este documento.';
    }
    if (tipoDocumento.requiereVencimiento && !fechaVencimiento) {
      nuevos.fechaVencimiento = 'La fecha de vencimiento es obligatoria.';
    } else if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
      nuevos.fechaVencimiento = 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.';
    }
    return nuevos;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const invalidos = validar();
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) return;

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('tipoDocumentoId', tipoDocumento.id);
      if (fechaEmision) formData.append('fechaEmision', fechaEmision);
      if (fechaVencimiento) formData.append('fechaVencimiento', fechaVencimiento);
      if (observaciones) formData.append('observaciones', observaciones);
      if (archivo) formData.append('archivo', archivo);

      const endpoint = chofer
        ? `/documentos/choferes/${chofer.id}`
        : `/documentos/vehiculos/${vehiculo.id}`;

      const { data } = await api.post(endpoint, formData);

      onSuccess(data.documento);
      onClose();
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        // tipoDocumentoId no tiene campo en el formulario: va como mensaje general.
        const { tipoDocumentoId, ...porCampo } = delBackend;
        setErrores(porCampo);
        if (tipoDocumentoId) setError(tipoDocumentoId);
      } else {
        setError(mensaje || 'Error al guardar el documento. Intentá nuevamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  const hoyStr = hoyCordobaISO();
  const esFechaVencida = Boolean(fechaVencimiento && fechaVencimiento < hoyStr);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-doc-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-doc-header">
          <div>
            <h2>{esRenovacion ? 'Renovar / Actualizar Documento' : 'Registrar Documento'}</h2>
            <p className="modal-doc-subtitle">
              {etiquetaTipoDocumento(tipoDocumento.descripcion)} —{' '}
              {chofer ? (
                <strong>{chofer.nombre} {chofer.apellido}</strong>
              ) : (
                <>Unidad <strong>{vehiculo.numeroInterno}</strong> ({vehiculo.dominio})</>
              )}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="modal-doc-form" noValidate>
          {tipoDocumento.requiereArchivo ? (
            <div className="file-upload-zone">
              <label className="file-upload-label">
                <input
                  id="documento-archivo"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="file-upload-input"
                  aria-invalid={errores.archivo ? true : undefined}
                  aria-describedby={errores.archivo ? 'documento-archivo-error' : undefined}
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
              {errores.archivo && (
                <p id="documento-archivo-error" className="form-field-error" role="alert">
                  {errores.archivo}
                </p>
              )}
            </div>
          ) : (
            <div className="notice-box">
              <span className="notice-icon">ℹ️</span>
              <div>
                <strong>Trámite sin archivo digital obligatorio</strong>
                <p>Este control ({etiquetaTipoDocumento(tipoDocumento.descripcion)}) registra la vigencia y observaciones en el legajo de la unidad sin requerir PDF.</p>
              </div>
            </div>
          )}

          <div className="modal-doc-grid">
            <FormField id="documento-fecha-emision" label="Fecha de emisión" error={errores.fechaEmision}>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
                className="modal-doc-input"
              />
            </FormField>

            <FormField
              id="documento-fecha-vencimiento"
              label="Fecha de vencimiento"
              required={tipoDocumento.requiereVencimiento}
              error={errores.fechaVencimiento}
            >
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="modal-doc-input"
              />
            </FormField>
          </div>

          {esFechaVencida && (
            <Alert variant="warning">
              ⚠️ Atención: La fecha seleccionada ya pasó. El documento se registrará con estado <strong>Vencido</strong>.
            </Alert>
          )}

          <FormField id="documento-observaciones" label="Observaciones o notas adicionales">
            <textarea
              rows="3"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Póliza N° 584920 - La Segunda Seguros"
              className="modal-doc-textarea"
            />
          </FormField>

          <div className="modal-doc-actions" style={{ justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button variant="secondary" type="button" onClick={onClose} disabled={enviando}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" loading={enviando}>
                {esRenovacion ? 'Guardar renovación' : 'Guardar documento'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ModalSubirDocumento;
