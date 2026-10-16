import { formatearDuracion } from '../utils/estimacionKm';
import './ResultadoEstimacionKm.css';

// Licencia de OpenRouteService y OpenStreetMap: tiene que verse junto a cualquier
// resultado calculado con ORS.
export const ATRIBUCION_ORS = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors';

// Resultado del botón "Calcular km" debajo del campo de kilómetros estimados:
// el total aproximado, cómo se interpretó cada punto (colapsado), la indicación
// de verificar con Google Maps y la atribución. Si el recorrido cambió después
// de calcular (`desactualizado`), lo avisa: no recalcula solo.
//
// resultado: { kilometros, duracionMinutos, puntos: [{ ubicacionId, nombre, interpretadoComo }] }
function ResultadoEstimacionKm({ resultado, desactualizado = false }) {
  if (!resultado) return null;

  return (
    <div className="estimacion-km" aria-live="polite">
      {desactualizado ? (
        <p className="estimacion-km-desactualizado" role="status">
          El recorrido cambió después del cálculo: volvé a calcular los km.
        </p>
      ) : null}

      <p className={desactualizado ? 'estimacion-km-total estimacion-km-total-viejo' : 'estimacion-km-total'}>
        ≈ {resultado.kilometros} km · {formatearDuracion(resultado.duracionMinutos)} aprox.
      </p>

      <details className="estimacion-km-puntos">
        <summary>Cómo se interpretó cada punto</summary>
        <ol>
          {resultado.puntos.map((punto, indice) => (
            <li key={`${punto.ubicacionId}-${indice}`}>
              {punto.nombre} → <span className="estimacion-km-interpretado">{punto.interpretadoComo}</span>
            </li>
          ))}
        </ol>
      </details>

      <p className="estimacion-km-ayuda">Es una estimación: verificala con “Ver recorrido en Google Maps”.</p>
      <p className="estimacion-km-atribucion">{ATRIBUCION_ORS}</p>
    </div>
  );
}

export default ResultadoEstimacionKm;
