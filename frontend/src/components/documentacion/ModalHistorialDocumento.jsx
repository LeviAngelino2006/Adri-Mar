import { useEffect, useState } from 'react';
import api from '../../services/api';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import EstadoBadge from '../ui/EstadoBadge';
import Spinner from '../ui/Spinner';
import ModalMarco from './ModalMarco';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { formatearFechaCorta } from '../../utils/documentacion';

// Versiones de un documento, de la más nueva a la más vieja (el backend guarda la
// vigente y hasta dos anteriores). Se monta solo mientras está abierto.
function ModalHistorialDocumento({ subtitulo, vehiculo, chofer, tipoDocumento, onVerPdf, onClose }) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const endpoint = chofer
    ? `/documentos/choferes/${chofer.id}/tipos/${tipoDocumento.id}/historial`
    : `/documentos/vehiculos/${vehiculo.id}/tipos/${tipoDocumento.id}/historial`;

  useEffect(() => {
    api
      .get(endpoint)
      .then(({ data }) => setHistorial(data.historial || []))
      .catch((err) => setError(err.response?.data?.error || 'No se pudo cargar el historial.'))
      .finally(() => setCargando(false));
  }, [endpoint]);

  return (
    <ModalMarco
      titulo={`Historial de ${etiquetaTipoDocumento(tipoDocumento.descripcion)}`}
      subtitulo={subtitulo}
      onClose={onClose}
      variante="ancho"
      pie={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {cargando && (
        <div className="loading-state">
          <Spinner label="Cargando historial" />
          <span>Cargando historial…</span>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {!cargando && !error && historial.length === 0 && (
        <p className="doc-versiones-vacio">No hay versiones de este documento.</p>
      )}

      {historial.length > 0 && (
        <ul className="doc-versiones">
          {historial.map((version) => (
            <li key={version.id} className="doc-version">
              <div className="doc-version-info">
                <p className="doc-version-linea">
                  <EstadoBadge tono={version.esVigente ? 'success' : 'neutral'} size="sm">
                    {version.esVigente ? 'Vigente' : 'Anterior'}
                  </EstadoBadge>{' '}
                  {version.fechaVencimiento
                    ? `Vence el ${formatearFechaCorta(version.fechaVencimiento)}`
                    : 'Sin vencimiento'}
                </p>
                <p className="doc-version-meta">
                  Cargado el {formatearFechaCorta(version.creadoEn)}
                  {version.usuario ? ` por ${version.usuario.nombre} ${version.usuario.apellido}` : ''}
                </p>
              </div>
              {version.tieneArchivo && (
                <Button variant="secondary" onClick={() => onVerPdf(version)}>
                  Ver PDF
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ModalMarco>
  );
}

export default ModalHistorialDocumento;
