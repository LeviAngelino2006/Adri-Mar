import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Card from './ui/Card';
import EstadoCarga from './ui/EstadoCarga';
import EstadoBadge from './ui/EstadoBadge';
import RutaViaje from './RutaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { hoyCordobaISO, porcentajeProgresoViaje } from '../utils/fechaCordoba';
import { formatearHoraDelDia, nombreChofer, tituloDiaViajes } from '../utils/viajeFormato';
import { consultasViajesDeHoy, resumenViajesDeHoy, separarSinCerrar, unirViajesDeHoy } from '../utils/viajesDeHoy';
import { agruparViajesPorDia } from '../utils/viajesPorDia';
import { parametrosDeVista, vistaDelEstado } from '../utils/vistasViajes';
import { useCarga } from '../hooks/useCarga';

const INTERVALO_PROGRESO_MS = 60 * 1000;

// `dia` es el día del grupo de la fila ("YYYY-MM-DD"): las horas de ese día van
// solas y las de otro día, con el día relativo ("ayer 22:00").
function FilaViajeDeHoy({ viaje, dia, ahora, onAbrir }) {
  const { chofer, vehiculo } = viaje;
  const estado = ESTADOS_VIAJE[viaje.estado];
  const progreso = viaje.estado === 'EN_VIAJE' ? porcentajeProgresoViaje(viaje.fechaInicio, viaje.fechaFin, ahora) : null;

  return (
    <li>
      <button type="button" className="dashboard-fila" onClick={() => onAbrir(viaje)}>
        <span className="hora-col">
          {formatearHoraDelDia(viaje.fechaInicio, dia, ahora)}
          {viaje.fechaFin && <small>{formatearHoraDelDia(viaje.fechaFin, dia, ahora)}</small>}
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

function FilasViajes({ viajes, dia, ahora, onAbrir }) {
  return (
    <ul className="dashboard-lista">
      {viajes.map((viaje) => (
        <FilaViajeDeHoy key={viaje.id} viaje={viaje} dia={dia} ahora={ahora} onAbrir={onAbrir} />
      ))}
    </ul>
  );
}

const VACIO = <div className="dashboard-empty">No hay viajes para hoy</div>;

// Lo que muestra el panel según su estado, sin lógica de carga. `carga` es lo
// que devuelve useCarga: un error se muestra con "Reintentar" (EstadoCarga),
// nunca como "No hay viajes para hoy".
//
// Si hay viajes sin cerrar (los marca el backend), van primero, en su grupo
// "Sin cerrar" y por día ("Ayer · vie 23 oct"), sin color ni badge para el
// atraso; debajo, los de hoy bajo "Hoy · sáb 24 oct". Sin sin cerrar, el panel
// es solo la lista de hoy, como siempre.
export function ContenidoViajesDeHoy({ carga, viajes, ahora, onAbrir }) {
  const { sinCerrar, deHoy } = separarSinCerrar(viajes);
  const hoy = hoyCordobaISO(ahora);

  return (
    <EstadoCarga carga={carga} forma="filas" que="los viajes de hoy" vacio={viajes.length === 0 && VACIO}>
      {sinCerrar.length === 0 ? (
        <FilasViajes viajes={deHoy} dia={hoy} ahora={ahora} onAbrir={onAbrir} />
      ) : (
        <>
          <section className="viajes-hoy-sin-cerrar" aria-label="Sin cerrar">
            <h3 className="dashboard-grupo-dia">Sin cerrar</h3>
            {agruparViajesPorDia(sinCerrar, ahora).map((grupo) => (
              <section key={grupo.dia ?? 'sin-fecha'} aria-label={grupo.titulo}>
                <h4 className="viajes-hoy-dia">{grupo.titulo}</h4>
                <FilasViajes viajes={grupo.viajes} dia={grupo.dia} ahora={ahora} onAbrir={onAbrir} />
              </section>
            ))}
          </section>
          <section aria-label="Hoy">
            <h3 className="dashboard-grupo-dia">{tituloDiaViajes(hoy, ahora)}</h3>
            {deHoy.length > 0 ? <FilasViajes viajes={deHoy} dia={hoy} ahora={ahora} onAbrir={onAbrir} /> : VACIO}
          </section>
        </>
      )}
    </EstadoCarga>
  );
}

// Las consultas del panel, unidas. Fuera del componente para que useCarga
// reciba siempre la misma función; el día se calcula en cada pedido.
function pedirViajesDeHoy() {
  return Promise.all(consultasViajesDeHoy().map((params) => api.get('/viajes', { params }))).then((respuestas) =>
    unirViajesDeHoy(...respuestas.map(({ data }) => data.viajes))
  );
}

// Panel del Dashboard de Administrador y Encargado: los viajes Programados, En
// viaje y Finalizados que salen hoy (día de Córdoba), más cualquier En viaje que
// haya salido antes, del más temprano al más tarde, y arriba los sin cerrar de
// días anteriores. Cada fila abre la ficha del viaje en Viajes; no hay acciones.
//
// Las consultas y cómo se unen están en utils/viajesDeHoy. El resumen cuenta solo
// los de hoy.
function PanelViajesDeHoy() {
  const navigate = useNavigate();
  const carga = useCarga(pedirViajesDeHoy);
  const viajes = carga.datos ?? [];
  const { deHoy } = separarSinCerrar(viajes);
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
        {!carga.cargando && !carga.error && deHoy.length > 0 && (
          <span className="dashboard-resumen">{resumenViajesDeHoy(deHoy)}</span>
        )}
      </div>
      <ContenidoViajesDeHoy carga={carga} viajes={viajes} ahora={ahora} onAbrir={abrir} />
    </Card>
  );
}

export default PanelViajesDeHoy;
