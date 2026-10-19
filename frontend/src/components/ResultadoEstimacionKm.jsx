import { formatearDuracion } from '../utils/estimacionKm';
import './ResultadoEstimacionKm.css';

// Atribución que piden los términos de Google cuando un dato de la Routes API
// se muestra sin un mapa de Google ("Google Maps" en texto si no hay lugar para
// el logo). Va chica, al final de la misma línea.
export const ATRIBUCION_GOOGLE = 'Google Maps';

// Resultado de "Calcular km" debajo del campo de kilómetros estimados: una
// línea con el total y la duración. Si el recorrido cambió después de calcular
// (`desactualizado`), el total queda tachado con un aviso corto en la misma
// línea: no recalcula solo.
//
// resultado: { kilometros, duracionMinutos }
function ResultadoEstimacionKm({ resultado, desactualizado = false }) {
  if (!resultado) return null;

  return (
    <p className="estimacion-km" aria-live="polite">
      <span className={desactualizado ? 'estimacion-km-total estimacion-km-total-viejo' : 'estimacion-km-total'}>
        ≈ {resultado.kilometros} km · {formatearDuracion(resultado.duracionMinutos)}
      </span>
      {desactualizado && (
        <span className="estimacion-km-desactualizado" role="status">
          Cambió el recorrido: recalculá
        </span>
      )}
      <span className="estimacion-km-atribucion">{ATRIBUCION_GOOGLE}</span>
    </p>
  );
}

export default ResultadoEstimacionKm;
