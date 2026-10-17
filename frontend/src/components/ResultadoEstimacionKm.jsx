import { formatearDuracion } from '../utils/estimacionKm';
import './ResultadoEstimacionKm.css';

// Licencia de OpenRouteService y OpenStreetMap: tiene que verse junto a cualquier
// resultado calculado con ORS (en chico, sin competir con el resultado).
export const ATRIBUCION_ORS = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors';

// Resultado de "Calcular km" debajo del campo de kilómetros estimados: una
// línea con el total y la duración, y la atribución. Si el recorrido cambió
// después de calcular (`desactualizado`), el total queda tachado con un aviso
// corto en la misma línea: no recalcula solo.
//
// resultado: { kilometros, duracionMinutos }
function ResultadoEstimacionKm({ resultado, desactualizado = false }) {
  if (!resultado) return null;

  return (
    <div className="estimacion-km" aria-live="polite">
      <p className="estimacion-km-total">
        <span className={desactualizado ? 'estimacion-km-total-viejo' : undefined}>
          ≈ {resultado.kilometros} km · {formatearDuracion(resultado.duracionMinutos)}
        </span>
        {desactualizado && (
          <span className="estimacion-km-desactualizado" role="status">
            Cambió el recorrido: recalculá
          </span>
        )}
      </p>
      <p className="estimacion-km-atribucion">{ATRIBUCION_ORS}</p>
    </div>
  );
}

export default ResultadoEstimacionKm;
