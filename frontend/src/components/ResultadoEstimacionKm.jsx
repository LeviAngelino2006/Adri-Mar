import { formatearDuracion, textoMotivosRevision } from '../utils/estimacionKm';
import './ResultadoEstimacionKm.css';

// Licencia de OpenRouteService y OpenStreetMap: tiene que verse junto a cualquier
// resultado calculado con ORS.
export const ATRIBUCION_ORS = '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors';

// Resultado del botón "Calcular km" debajo del campo de kilómetros estimados:
// el total aproximado, cómo se interpretó cada punto, la indicación de verificar
// con Google Maps y la atribución. Si el recorrido cambió después de calcular
// (`desactualizado`), lo avisa: no recalcula solo.
//
// La interpretación de cada punto es la única defensa contra una
// geocodificación equivocada que ORS no avisa ("Cosquin" → una calle de Córdoba
// capital). Por eso, si el backend marcó algún punto para revisar
// (motivosRevision, ver backend/src/utils/revisionGeocodificacion.js), la lista
// se abre sola, avisa arriba y resalta ese punto. Si todo se ve bien queda
// colapsada.
//
// resultado: { kilometros, duracionMinutos,
//              puntos: [{ ubicacionId, nombre, interpretadoComo, motivosRevision }] }
function ResultadoEstimacionKm({ resultado, desactualizado = false }) {
  if (!resultado) return null;

  const paraRevisar = resultado.puntos.filter((p) => p.motivosRevision?.length > 0).length;

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

      {/* key: si un cálculo nuevo pasa a tener puntos para revisar, la lista se
          vuelve a abrir aunque el usuario la haya cerrado antes. */}
      <details
        key={paraRevisar > 0 ? 'para-revisar' : 'sin-revisar'}
        className="estimacion-km-puntos"
        open={paraRevisar > 0}
      >
        <summary>Cómo se interpretó cada punto</summary>
        {paraRevisar > 0 && (
          <p className="estimacion-km-aviso-revisar">
            {paraRevisar === 1
              ? 'Hay 1 ubicación que el mapa pudo haber interpretado mal: revisala antes de usar los km.'
              : `Hay ${paraRevisar} ubicaciones que el mapa pudo haber interpretado mal: revisalas antes de usar los km.`}
          </p>
        )}
        <ol>
          {resultado.puntos.map((punto, indice) => {
            const dudoso = punto.motivosRevision?.length > 0;
            return (
              <li key={`${punto.ubicacionId}-${indice}`} className={dudoso ? 'estimacion-km-punto-dudoso' : undefined}>
                {punto.nombre} → <span className="estimacion-km-interpretado">{punto.interpretadoComo}</span>
                {dudoso && (
                  <span className="estimacion-km-revisar">
                    Revisá esta ubicación: {textoMotivosRevision(punto.motivosRevision)}.
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <p className="estimacion-km-ayuda">Es una estimación: verificala con “Ver recorrido en Google Maps”.</p>
      <p className="estimacion-km-atribucion">{ATRIBUCION_ORS}</p>
    </div>
  );
}

export default ResultadoEstimacionKm;
