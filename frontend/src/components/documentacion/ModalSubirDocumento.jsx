import { useState } from 'react';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Alert from '../ui/Alert';
import ModalMarco from './ModalMarco';
import api from '../../services/api';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { diasHasta, formatearFechaCorta } from '../../utils/documentacion';
import { fechaCordobaISO, hoyCordobaISO } from '../../utils/fechaCordoba';
import { formatearNombreArchivo } from '../../utils/archivoFormato';

const MAX_BYTES = 15 * 1024 * 1024;

// Fecha "YYYY-MM-DD" para un <input type="date"> a partir de un instante de la API.
const aInputFecha = (valor) => (valor ? fechaCordobaISO(valor) : '');

// Aviso de lo que pasa con la versión actual al guardar una actualización.
function avisoVersionActual(documento) {
  const final = 'Al guardar, pasa al historial y esta queda como vigente.';
  if (!documento.fechaVencimiento) {
    return `La versión actual se cargó el ${formatearFechaCorta(documento.creadoEn)}. ${final}`;
  }
  const verbo = diasHasta(documento.fechaVencimiento) < 0 ? 'venció' : 'vence';
  return `La versión actual ${verbo} el ${formatearFechaCorta(documento.fechaVencimiento)}. ${final}`;
}

// Cargar un documento que todavía no existe, o actualizarlo (una versión nueva
// que pasa a ser la vigente). Se monta solo mientras está abierto, así el
// formulario arranca siempre desde los datos del documento actual.
function ModalSubirDocumento({ subtitulo, vehiculo, chofer, tipoDocumento, documentoActual, onClose, onSuccess }) {
  const esActualizacion = Boolean(documentoActual);
  const [archivo, setArchivo] = useState(null);
  const [fechaEmision, setFechaEmision] = useState(aInputFecha(documentoActual?.fechaEmision));
  const [fechaVencimiento, setFechaVencimiento] = useState(aInputFecha(documentoActual?.fechaVencimiento));
  const [observaciones, setObservaciones] = useState(documentoActual?.observaciones ?? '');
  const [enviando, setEnviando] = useState(false);
  // Un mensaje por campo (archivo, fechaEmision, fechaVencimiento), igual que los
  // `errores` del backend; `error` es el mensaje general.
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');

  const etiqueta = etiquetaTipoDocumento(tipoDocumento.descripcion);

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
    if (tipoDocumento.requiereArchivo && !archivo && !esActualizacion) {
      nuevos.archivo = 'Adjuntá un archivo PDF.';
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
      if (tipoDocumento.requiereVencimiento && fechaVencimiento) formData.append('fechaVencimiento', fechaVencimiento);
      if (observaciones) formData.append('observaciones', observaciones);
      if (archivo) formData.append('archivo', archivo);

      const endpoint = chofer ? `/documentos/choferes/${chofer.id}` : `/documentos/vehiculos/${vehiculo.id}`;
      await api.post(endpoint, formData);
      onSuccess();
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        // tipoDocumentoId no tiene campo en el formulario: va como mensaje general.
        const { tipoDocumentoId, ...porCampo } = delBackend;
        setErrores(porCampo);
        if (tipoDocumentoId) setError(tipoDocumentoId);
      } else {
        setError(mensaje || 'No se pudo guardar el documento. Intentá de nuevo.');
      }
      setEnviando(false);
    }
  }

  const archivoActual = documentoActual?.nombreArchivo ? formatearNombreArchivo(documentoActual.nombreArchivo) : null;
  const hintArchivo =
    esActualizacion && archivoActual
      ? `Si no adjuntás uno nuevo, se mantiene el PDF actual (${archivoActual}). Máximo 15 MB.`
      : 'Máximo 15 MB.';
  const vencimientoPasado = Boolean(fechaVencimiento && fechaVencimiento < hoyCordobaISO());

  return (
    <ModalMarco
      titulo={`${esActualizacion ? 'Actualizar' : 'Cargar'} ${etiqueta}`}
      subtitulo={subtitulo}
      onClose={onClose}
      pie={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-documento" loading={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="form-documento" className="doc-modal-form" onSubmit={handleSubmit} noValidate>
        {esActualizacion && <Alert variant="info">{avisoVersionActual(documentoActual)}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {tipoDocumento.requiereArchivo && (
          <FormField id="documento-archivo" label="Archivo PDF" required={!esActualizacion} hint={hintArchivo} error={errores.archivo}>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
          </FormField>
        )}

        <div className="form-grid">
          <FormField id="documento-fecha-emision" label="Fecha de emisión" error={errores.fechaEmision}>
            <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </FormField>

          {tipoDocumento.requiereVencimiento && (
            <FormField id="documento-fecha-vencimiento" label="Fecha de vencimiento" required error={errores.fechaVencimiento}>
              <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
            </FormField>
          )}
        </div>

        {vencimientoPasado && (
          <Alert variant="warning">La fecha de vencimiento ya pasó: el documento va a quedar como vencido.</Alert>
        )}

        <FormField id="documento-observaciones" label="Observaciones">
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows="3" />
        </FormField>
      </form>
    </ModalMarco>
  );
}

export default ModalSubirDocumento;
