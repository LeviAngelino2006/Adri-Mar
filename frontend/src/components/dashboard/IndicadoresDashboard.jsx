import { useNavigate } from 'react-router-dom';
import ControlSegmentado from '../ui/ControlSegmentado';
import EstadoCarga from '../ui/EstadoCarga';
import { formatearKm } from '../../utils/viajeFormato';
import './IndicadoresDashboard.css';

const OPCIONES_PERIODO = [
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'semana', etiqueta: 'Esta semana' },
];

function detalleKm(km, viajes) {
  if (km.promedioPorViaje != null) return `Promedio ${formatearKm(km.promedioPorViaje)} km/viaje`;
  if (viajes.finalizadosPeriodo > 0) return 'Sin lecturas completas de odómetro';
  return 'Sin viajes finalizados';
}

function detalleViajes(viajes) {
  const partes = [];
  if (viajes.enViajeAhora > 0) partes.push(`${viajes.enViajeAhora} en viaje`);
  if (viajes.porConfirmarPendientes > 0) partes.push(`${viajes.porConfirmarPendientes} por confirmar`);
  if (partes.length === 0 && viajes.programadosProximos > 0) {
    partes.push(viajes.programadosProximos === 1 ? '1 programado' : `${viajes.programadosProximos} programados`);
  }
  return partes.length > 0 ? partes.join(' · ') : 'Sin viajes pendientes';
}

function detalleFlota(flota) {
  if (flota.totalActivos === 0) return 'Sin vehículos activos';
  return flota.enTaller > 0 ? `${flota.enTaller} en taller` : 'Toda operativa';
}

function detalleService({ vencidos = 0, proximos = 0 }) {
  const texto = [
    vencidos > 0 && `${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`,
    proximos > 0 && `${proximos} ${proximos === 1 ? 'próximo' : 'próximos'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return texto || 'Flota al día';
}

// Franja superior de KPIs accionables del Dashboard.
// - Administrador / Encargado: km del período, viajes realizados, flota operativa y próximos al service.
// - Personal de Taller: flota operativa y próximos al service.
function IndicadoresDashboard({ carga, periodo, onCambiarPeriodo, esGestor }) {
  const navigate = useNavigate();
  const datos = carga.datos;

  return (
    <section className="dashboard-kpis-seccion" aria-label="Resumen de la flota">
      <div className="dashboard-kpis-header">
        <h2>Resumen de la flota</h2>
        {esGestor && (
          <ControlSegmentado
            opciones={OPCIONES_PERIODO}
            valor={periodo}
            onChange={onCambiarPeriodo}
            ariaLabel="Período de indicadores"
          />
        )}
      </div>

      <EstadoCarga carga={carga} forma="filas" cantidad={2} que="los indicadores de la flota">
        {datos && (
          <div className={esGestor ? 'dashboard-kpis' : 'dashboard-kpis dashboard-kpis-taller'}>
            {esGestor && datos.km && datos.viajes && (
              <>
                <button type="button" className="dashboard-kpi" onClick={() => navigate('/reportes')}>
                  <span className="dashboard-kpi-etiqueta">Km recorridos</span>
                  <span className="dashboard-kpi-valor num">{formatearKm(datos.km.totalRecorridos)} km</span>
                  <span className="dashboard-kpi-detalle num">{detalleKm(datos.km, datos.viajes)}</span>
                </button>

                <button type="button" className="dashboard-kpi" onClick={() => navigate('/viajes')}>
                  <span className="dashboard-kpi-etiqueta">Viajes realizados</span>
                  <span className="dashboard-kpi-valor num">{datos.viajes.finalizadosPeriodo}</span>
                  <span className="dashboard-kpi-detalle num">{detalleViajes(datos.viajes)}</span>
                </button>
              </>
            )}

            <button type="button" className="dashboard-kpi" onClick={() => navigate('/vehiculos')}>
              <span className="dashboard-kpi-etiqueta">Flota operativa</span>
              <span className="dashboard-kpi-valor num">
                {datos.flota.operativos} / {datos.flota.totalActivos}
              </span>
              <span className="dashboard-kpi-detalle num">{detalleFlota(datos.flota)}</span>
            </button>

            <button type="button" className="dashboard-kpi" onClick={() => navigate('/mantenimiento')}>
              <span className="dashboard-kpi-etiqueta">Próximos al service</span>
              <span className="dashboard-kpi-valor num">
                {datos.mantenimiento.vencidos + datos.mantenimiento.proximos}
              </span>
              <span className="dashboard-kpi-detalle num">{detalleService(datos.mantenimiento)}</span>
            </button>
          </div>
        )}
      </EstadoCarga>
    </section>
  );
}

export default IndicadoresDashboard;
