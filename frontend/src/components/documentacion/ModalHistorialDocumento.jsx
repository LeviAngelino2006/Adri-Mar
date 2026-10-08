import { useEffect, useState } from 'react';
import api from '../../services/api';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { formatearNombreArchivo } from '../../utils/archivoFormato';
import './ModalDocumentacion.css';

function ModalHistorialDocumento({
  open,
  onClose,
  vehiculo,
  chofer,
  tipoDocumento,
  onVerPdf,
}) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && (vehiculo || chofer) && tipoDocumento) {
      setCargando(true);
      setError('');
      const endpoint = chofer
        ? `/documentos/choferes/${chofer.id}/tipos/${tipoDocumento.id}/historial`
        : `/documentos/vehiculos/${vehiculo.id}/tipos/${tipoDocumento.id}/historial`;

      api
        .get(endpoint)
        .then(({ data }) => setHistorial(data.historial || []))
        .catch((err) => setError(err.response?.data?.error || 'Error al cargar historial'))
        .finally(() => setCargando(false));
    }
  }, [open, vehiculo, chofer, tipoDocumento]);

  if (!open || (!vehiculo && !chofer) || !tipoDocumento) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-historial-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-doc-header">
          <div>
            <h2>Historial de Versiones</h2>
            <p className="modal-doc-subtitle">
              {tipoDocumento.descripcion} —{' '}
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

        {cargando ? (
          <div className="modal-historial-loading">
            <Spinner />
            <p>Cargando historial...</p>
          </div>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : historial.length === 0 ? (
          <p className="modal-historial-vacio">No hay registros históricos para este documento.</p>
        ) : (
          <div className="modal-historial-table-container">
            <table className="modal-historial-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th>Subido el</th>
                  <th>Registrado por</th>
                  <th>Archivo</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className={h.esVigente ? 'fila-vigente' : 'fila-historica'}>
                    <td>
                      <span className={`badge-vigencia ${h.esVigente ? 'vigente' : 'historico'}`}>
                        {h.esVigente ? '● Vigente actual' : '○ Histórico'}
                      </span>
                    </td>
                    <td>{h.fechaVencimiento ? new Date(h.fechaVencimiento).toLocaleDateString() : '—'}</td>
                    <td>{new Date(h.creadoEn).toLocaleDateString()}</td>
                    <td>{h.usuario ? `${h.usuario.nombre} ${h.usuario.apellido}` : '—'}</td>
                    <td>{formatearNombreArchivo(h.nombreOriginal) || 'Sin archivo PDF'}</td>
                    <td>
                      {h.signedUrl && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onVerPdf(h)}
                        >
                          Ver PDF
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-doc-actions">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ModalHistorialDocumento;
