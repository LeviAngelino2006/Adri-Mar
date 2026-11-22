import { useNavigate } from 'react-router-dom';
import AyudaTooltip from '../ui/AyudaTooltip';
import Card from '../ui/Card';
import EstadoBadge from '../ui/EstadoBadge';
import { ESTADOS_VEHICULO } from '../../constants/estadosVehiculo';
import { AYUDA_DESVIO, formatearDesvio, formatearRangoPeriodo } from '../../utils/reporteKm';
import { formatearFechaCorta, formatearKm } from '../../utils/viajeFormato';
import { destinoFichaViaje } from '../../utils/vistasViajes';

const ICONO_FLECHA = (
  <svg
    className="reporte-viaje-flecha"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const NO_REGISTRADO = 'No registrado';

function Dato({ etiqueta, clase = '', children }) {
  const clases = clase ? `detalle-item ${clase}` : 'detalle-item';
  return (
    <div className={clases}>
      <dt>{etiqueta}</dt>
      <dd>{children || NO_REGISTRADO}</dd>
    </div>
  );
}

function textoDiferenciaViaje(kmRealizados, kilometrosEstimados) {
  if (kmRealizados == null || kilometrosEstimados == null) return null;
  const dif = kmRealizados - kilometrosEstimados;
  const prefijo = dif > 0 ? '+' : dif < 0 ? '-' : '';
  return `${prefijo}${formatearKm(Math.abs(dif))} km`;
}

function FichaVehiculoReporte({ item, periodo, onVolver }) {
  const navigate = useNavigate();
  const { vehiculo, viajes } = item;
  const estado = ESTADOS_VEHICULO[vehiculo.estado] ?? { label: vehiculo.estado, tono: 'neutral' };
  const rangoTexto = formatearRangoPeriodo(periodo.desde, periodo.hasta);

  return (
    <>
      <button type="button" className="back-link" onClick={onVolver}>
        ← Volver al reporte
      </button>

      <div className="reporte-detalle-header">
        <div>
          <h1>
            Vehículo {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
          </h1>
          <p className="reporte-detalle-subtitulo">
            {vehiculo.marca} {vehiculo.modelo} · {vehiculo.tipoVehiculo} · {rangoTexto}
          </p>
        </div>
        <EstadoBadge tono={estado.tono}>{estado.label}</EstadoBadge>
      </div>

      <Card className="detalle-card reporte-detalle-card" role="region" aria-label="Resumen del vehículo en el período">
        <dl className="detalle-grid">
          <Dato etiqueta="Km recorridos" clase="detalle-item-destacado">
            <span className="num">{`${formatearKm(item.kmRecorridos)} km`}</span>
          </Dato>
          <Dato etiqueta="Viajes finalizados" clase="detalle-item-destacado">
            <span className="num">{String(item.cantidadViajes)}</span>
          </Dato>

          <Dato etiqueta="Promedio por viaje">
            {item.promedioKmPorViaje != null ? (
              <span className="num">{`${formatearKm(item.promedioKmPorViaje)} km`}</span>
            ) : (
              NO_REGISTRADO
            )}
          </Dato>
          <Dato
            etiqueta={
              <span className="reporte-kpi-etiqueta-fila">
                Desvío vs. estimado
                <AyudaTooltip texto={AYUDA_DESVIO} />
              </span>
            }
          >
            <span className="num">{formatearDesvio(item.desvioPorcentaje, item.desvioKm)}</span>
          </Dato>

          <Dato etiqueta="Odómetro actual">
            <span className="num">{`${formatearKm(vehiculo.kilometraje)} km`}</span>
          </Dato>
          <div className="detalle-hueco" aria-hidden="true" />

          {item.viajesSinOdometro > 0 && (
            <Dato etiqueta="Observación" clase="detalle-item-ancho">
              {item.viajesSinOdometro === 1
                ? '1 viaje finalizado no tiene lecturas completas de odómetro y no suma kilómetros reales.'
                : `${item.viajesSinOdometro} viajes finalizados no tienen lecturas completas de odómetro y no suman kilómetros reales.`}
            </Dato>
          )}
        </dl>
      </Card>

      <Card className="reporte-detalle-viajes-card" role="region" aria-label="Viajes del período">
        <div className="reporte-detalle-viajes-header">
          <h2>Viajes del período</h2>
          <span className="reporte-detalle-viajes-total num">
            {item.cantidadViajes === 1 ? '1 viaje' : `${item.cantidadViajes} viajes`}
          </span>
        </div>

        {viajes.length === 0 ? (
          <p className="reporte-detalle-vacio">Este vehículo no tuvo viajes finalizados en este período.</p>
        ) : (
          <ul className="reporte-viajes-lista">
            {viajes.map((viaje) => {
              const diferencia = textoDiferenciaViaje(viaje.kmRealizados, viaje.kilometrosEstimados);
              return (
                <li key={viaje.id} className="reporte-viaje-item">
                  <button
                    type="button"
                    className="reporte-viaje-boton"
                    onClick={() => navigate(...destinoFichaViaje({ id: viaje.id, estado: 'FINALIZADO' }))}
                  >
                    <div className="reporte-viaje-info">
                      <span className="reporte-viaje-fecha">{formatearFechaCorta(viaje.fechaInicio)}</span>
                      <span className="reporte-viaje-ruta">
                        {viaje.origen || NO_REGISTRADO} → {viaje.destino || NO_REGISTRADO}
                      </span>
                      <span className="reporte-viaje-meta">
                        {viaje.cliente || NO_REGISTRADO} · {viaje.chofer || NO_REGISTRADO}
                      </span>
                    </div>
                    <div className="reporte-viaje-derecha">
                      <div className="reporte-viaje-km">
                        <span className="reporte-viaje-km-real num">
                          {viaje.kmRealizados != null ? `${formatearKm(viaje.kmRealizados)} km` : 'Sin lectura'}
                        </span>
                        {viaje.kilometrosEstimados != null && (
                          <span className="reporte-viaje-km-est num">
                            Est: {formatearKm(viaje.kilometrosEstimados)} km{diferencia ? ` (${diferencia})` : ''}
                          </span>
                        )}
                      </div>
                      {ICONO_FLECHA}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export default FichaVehiculoReporte;
