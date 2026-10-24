import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Card from './ui/Card';
import EstadoCarga from './ui/EstadoCarga';
import EstadoBadge from './ui/EstadoBadge';
import RutaViaje from './RutaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { porcentajeProgresoViaje } from '../utils/fechaCordoba';
import { formatearHoraRelativaHoy, nombreChofer } from '../utils/viajeFormato';
import { consultasViajesDeHoy, resumenViajesDeHoy, unirViajesDeHoy } from '../utils/viajesDeHoy';
import { parametrosDeVista, vistaDelEstado } from '../utils/vistasViajes';
import { useCarga } from '../hooks/useCarga';

const INTERVALO_PROGRESO_MS = 60 * 1000;

function FilaViajeDeHoy({ viaje, ahora, onAbrir }) {
  const { chofer, vehiculo } = viaje;
  const estado = ESTADOS_VIAJE[viaje.estado];
  const progreso = viaje.estado === 'EN_VIAJE' ? porcentajeProgresoViaje(viaje.fechaInicio, viaje.fechaFin, ahora) : null;

  return (
    <li>
      <button type="button" className="dashboard-fila" onClick={() => onAbrir(viaje)}>
        <span className="hora-col">
          {formatearHoraRelativaHoy(viaje.fechaInicio, ahora)}
          {viaje.fechaFin && <small>{formatearHoraRelativaHoy(viaje.fechaFin, ahora)}</small>}
        </span>
        <span className="dashboard-fila-info">
          <span className="dashboard-fila-titulo">
            <RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} />
          </span>
          <span className="dashboard-fila-meta">
            {chofer ? nombreChofer(chofer) : 'Chofer pendiente'} ·{' '}
            {vehiculo ? (
              <>
                {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
              </>
            ) : (
              'Vehículo pendiente'
            )}
          </span>
          {progreso !== null && (
            <span
              className="viajes-hoy-barra"
              role="progressbar"
              aria-label="Avance del viaje"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progreso}
            >
              <span className="viajes-hoy-barra-fill" style={{ width: `${progreso}%` }} />
            </span>
          )}
        </span>
        <EstadoBadge tono={estado.tono} size="sm">
          {estado.label}
        </EstadoBadge>
      </button>
    </li>
  );
}

// Lo que muestra el panel según su estado, sin lógica de carga. `carga` es lo
// que devuelve useCarga: un error se muestra con "Reintentar" (EstadoCarga),
// nunca como "No hay viajes para hoy".
export function ContenidoViajesDeHoy({ carga, viajes, ahora, onAbrir }) {
  return (
    <EstadoCarga
      carga={carga}
      forma="filas"
      que="los viajes de hoy"
      vacio={viajes.length === 0 && <div className="dashboard-empty">No hay viajes para hoy</div>}
    >
      <ul className="dashboard-lista">
        {viajes.map((viaje) => (
          <FilaViajeDeHoy key={viaje.id} viaje={viaje} ahora={ahora} onAbrir={onAbrir} />
        ))}
      </ul>
    </EstadoCarga>
  );
}

// Las dos consultas del panel, unidas. Fuera del componente para que useCarga
// reciba siempre la misma función; el día se calcula en cada pedido.
function pedirViajesDeHoy() {
  return Promise.all(consultasViajesDeHoy().map((params) => api.get('/viajes', { params }))).then((respuestas) =>
    unirViajesDeHoy(...respuestas.map(({ data }) => data.viajes))
  );
}

// Panel del Dashboard de Administrador y Encargado: los viajes Programados, En
// viaje y Finalizados que salen hoy (día de Córdoba), más cualquier En viaje que
// haya salido antes, del más temprano al más tarde. Cada fila abre la ficha del
// viaje en Viajes; no hay acciones.
//
// GET /viajes acepta un solo estado, así que se hacen dos consultas: la del día
// (el backend toma la fecha suelta como el día entero de Córdoba) y la de todos
// los En viaje. Se unen sin duplicados y se sacan A confirmar y Cancelados acá.
function PanelViajesDeHoy() {
  const navigate = useNavigate();
  const carga = useCarga(pedirViajesDeHoy);
  const viajes = carga.datos ?? [];
  const [ahora, setAhora] = useState(() => Date.now());

  // El avance de las barras se recalcula cada 60 segundos con las fechas ya
  // cargadas, como en ViajeEnCurso; no se consulta de nuevo la API.
  const hayEnViaje = viajes.some((viaje) => viaje.estado === 'EN_VIAJE');
  useEffect(() => {
    if (!hayEnViaje) return undefined;
    const id = setInterval(() => setAhora(Date.now()), INTERVALO_PROGRESO_MS);
    return () => clearInterval(id);
  }, [hayEnViaje]);

  // Un Finalizado de hoy está en Anteriores del listado de Viajes: se abre esa
  // vista para que la ficha lo encuentre.
  function abrir(viaje) {
    const search = new URLSearchParams(parametrosDeVista(vistaDelEstado(viaje.estado))).toString();
    navigate({ pathname: '/viajes', search }, { state: { viajeId: viaje.id } });
  }

  return (
    <Card className="dashboard-panel" role="region" aria-label="Viajes de hoy">
      <div className="dashboard-panel-header">
        <h2>Viajes de hoy</h2>
        {!carga.cargando && !carga.error && viajes.length > 0 && (
          <span className="dashboard-resumen">{resumenViajesDeHoy(viajes)}</span>
        )}
      </div>
      <ContenidoViajesDeHoy carga={carga} viajes={viajes} ahora={ahora} onAbrir={abrir} />
    </Card>
  );
}

export default PanelViajesDeHoy;
