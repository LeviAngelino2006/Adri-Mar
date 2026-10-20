import Alert from './Alert';
import Button from './Button';
import Cargando from './Cargando';
import { mensajeErrorCarga } from '../../utils/errorCarga';
import './EstadoCarga.css';

// Error al cargar: el mensaje y el botón "Reintentar", dentro de un Alert error.
export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    <Alert variant="error">
      <span className="error-carga">
        <span className="error-carga-mensaje">{mensaje}</span>
        <Button variant="secondary" className="error-carga-reintentar" onClick={onReintentar}>
          Reintentar
        </Button>
      </span>
    </Alert>
  );
}

// Los tres estados de algo que se carga (un listado, un panel), siempre en este
// orden y siempre distintos:
//  1. cargando → Cargando con la `forma` del contenido;
//  2. error    → ErrorCarga ("No pudimos cargar {que}. …") con "Reintentar";
//  3. vacío    → lo que venga en `vacio` (el texto de "no hay …" de cada pantalla);
//  4. si no, los children.
// `carga` es lo que devuelve useCarga: { cargando, error, recargar }. `vacio` se
// pasa solo cuando de verdad no hay datos (por ejemplo `lista.length === 0 && …`):
// así un error nunca se muestra como "no hay datos".
function EstadoCarga({ carga, forma, cantidad, que, vacio, children }) {
  if (carga.cargando) return <Cargando forma={forma} cantidad={cantidad} />;
  if (carga.error) return <ErrorCarga mensaje={mensajeErrorCarga(carga.error, que)} onReintentar={carga.recargar} />;
  if (vacio) return vacio;
  return children;
}

export default EstadoCarga;
