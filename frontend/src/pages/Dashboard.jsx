import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { obtenerAlertasVencimientos } from '../services/documentosApi';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import EstadoBadge from '../components/ui/EstadoBadge';
import RutaViaje from '../components/RutaViaje';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearDiaYHora, nombreVehiculo } from '../utils/viajeFormato';
import { porcentajeProgresoViaje } from '../utils/fechaCordoba';
import './Dashboard.css';

const MAX_VIAJES_INICIAL = 3;
const INTERVALO_PROGRESO_MS = 60 * 1000;

const ICONO_VIAJE = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

const ICONO_CALENDARIO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

function ViajeEnCurso({ viaje, onVerDetalle, onFinalizar }) {
  const [ahora, setAhora] = useState(() => Date.now());

  // Solo se vuelve a calcular el avance con las fechas ya cargadas; no se
  // consulta de nuevo la API.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), INTERVALO_PROGRESO_MS);
    return () => clearInterval(id);
  }, []);

  const progreso = porcentajeProgresoViaje(viaje.fechaInicio, viaje.fechaFin, ahora);

  return (
    <Card className="viaje-en-curso" role="region" aria-label="Viaje en curso">
      <div className="viaje-en-curso-header">
        <EstadoBadge tono={ESTADOS_VIAJE.EN_VIAJE.tono}>{ESTADOS_VIAJE.EN_VIAJE.label}</EstadoBadge>
      </div>
      <div className="viaje-en-curso-ruta">
        <RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} />
      </div>
      <div className="viaje-en-curso-progreso">
        <div className="viaje-en-curso-hora">
          {formatearDiaYHora(viaje.fechaInicio)}
          <small>Salida</small>
        </div>
        <div
          className="viaje-en-curso-barra"
          role="progressbar"
          aria-label="Avance del viaje"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progreso}
        >
          <div className="viaje-en-curso-barra-fill" style={{ width: `${progreso}%` }} />
        </div>
        <div className="viaje-en-curso-hora viaje-en-curso-hora-fin">
          {formatearDiaYHora(viaje.fechaFin)}
          <small>Llegada est.</small>
        </div>
      </div>
      <div className="viaje-en-curso-pie">
        <span>Vehículo: {nombreVehiculo(viaje.vehiculo)}</span>
        <div className="viaje-en-curso-acciones">
          <Button variant="ghost" onClick={() => onVerDetalle(viaje)}>
            Ver detalle
          </Button>
          <Button variant="primary" onClick={() => onFinalizar(viaje)}>
            Finalizar viaje
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ProximosViajes({ viajes, cargando, onVerDetalle, onComenzar }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const visibles = mostrarTodos ? viajes : viajes.slice(0, MAX_VIAJES_INICIAL);
  const restantes = viajes.length - MAX_VIAJES_INICIAL;

  return (
    <Card className="dashboard-panel dashboard-proximos-viajes">
      <h2>Tus próximos viajes</h2>

      {cargando && (
        <div className="loading-state">
          <Spinner label="Cargando próximos viajes" />
          <span>Cargando…</span>
        </div>
      )}

      {!cargando && viajes.length === 0 && (
        <div className="dashboard-empty">
          {ICONO_VIAJE}
          <span>No tenés viajes programados próximamente</span>
        </div>
      )}

      {!cargando && viajes.length > 0 && (
        <>
          <ul className="proximos-viajes-lista">
            {visibles.map((v) => (
              <li key={v.id} className="proximos-viajes-item">
                <button type="button" className="proximos-viajes-enlace" onClick={() => onVerDetalle(v)}>
                  <div className="proximos-viajes-icono">{ICONO_CALENDARIO}</div>
                  <div className="proximos-viajes-info">
                    <span className="proximos-viajes-ruta">
                      <RutaViaje origen={v.origen} destino={v.destino} paradas={v.paradas} />
                    </span>
                    <span className="proximos-viajes-salida">{formatearDiaYHora(v.fechaInicio)}</span>
                    <span className="proximos-viajes-vehiculo">{nombreVehiculo(v.vehiculo)}</span>
                  </div>
                </button>
                <Button variant="secondary" className="proximos-viajes-accion" onClick={() => onComenzar(v)}>
                  Comenzar viaje
                </Button>
              </li>
            ))}
          </ul>

          {restantes > 0 && (
            <Button variant="secondary" onClick={() => setMostrarTodos((m) => !m)}>
              {mostrarTodos ? 'Ver menos' : `Ver ${restantes} más`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// Viaje en curso + próximos viajes del chofer, con el modal de odómetro para
// comenzar o finalizar sin salir del Dashboard.
function ViajesDelChofer() {
  const navigate = useNavigate();
  const [enCurso, setEnCurso] = useState([]);
  const [programados, setProgramados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — mismo modal
  // compartido que usa Mis viajes (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

  const cargarViajes = useCallback(
    () =>
      // GET /mis-viajes solo acepta un estado por vez, así que el viaje En viaje
      // (a lo sumo uno, ver viajeService) se pide aparte: se muestra arriba como
      // ViajeEnCurso y no forma parte de la lista de próximos. Los Programados
      // vienen todos, sin filtrar por fecha: uno atrasado sigue en la lista
      // hasta que se comienza o un gestor lo cancela.
      Promise.all([
        api.get('/viajes/mis-viajes', { params: { estado: 'EN_VIAJE' } }),
        api.get('/viajes/mis-viajes', { params: { estado: 'PROGRAMADO' } }),
      ])
        .then(([resEnViaje, resProgramados]) => {
          // El backend siempre devuelve descendente (más nuevo/futuro primero);
          // acá se da vuelta para que "lo que viene" muestre el más antiguo arriba.
          setEnCurso(resEnViaje.data.viajes);
          setProgramados([...resProgramados.data.viajes].reverse());
        })
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargarViajes();
  }, [cargarViajes]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  // La ficha vive en Mis viajes: se navega pasando qué viaje abrir.
  function verDetalle(viaje) {
    navigate('/mis-viajes', { state: { viajeId: viaje.id } });
  }

  function manejarExitoOdometro(_viajeActualizado, mensajeExito) {
    setMensaje(mensajeExito);
    setPedidoOdometro(null);
    cargarViajes();
  }

  return (
    <>
      {mensaje && <Toast>{mensaje}</Toast>}

      {enCurso.map((v) => (
        <ViajeEnCurso
          key={v.id}
          viaje={v}
          onVerDetalle={verDetalle}
          onFinalizar={(viaje) => setPedidoOdometro({ viaje, accion: 'finalizar' })}
        />
      ))}

      <ProximosViajes
        viajes={programados}
        cargando={cargando}
        onVerDetalle={verDetalle}
        onComenzar={(viaje) => setPedidoOdometro({ viaje, accion: 'comenzar' })}
      />

      <ModalOdometroViaje
        viaje={pedidoOdometro?.viaje}
        accion={pedidoOdometro?.accion}
        onCerrar={() => setPedidoOdometro(null)}
        onExito={manejarExitoOdometro}
      />
    </>
  );
}

function SeccionAlertasDocumentacion() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerAlertasVencimientos()
      .then((res) => setAlertas(res))
      .catch((err) => console.error('Error al cargar alertas:', err))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <Card className="dashboard-panel">
        <h2>Alertas de documentación</h2>
        <div className="loading-state">
          <Spinner label="Cargando alertas" />
          <span>Cargando alertas…</span>
        </div>
      </Card>
    );
  }

  const sinAlertas = !alertas || alertas.totalAlertas === 0;

  function irADocumentacion(doc) {
    if (doc.categoria === 'VEHICULO') {
      navigate(`/documentacion?vehiculoId=${doc.vehiculo.id}`);
    } else {
      navigate(`/documentacion?tab=choferes&choferId=${doc.usuario.id}`);
    }
  }

  return (
    <Card className="dashboard-panel">
      <div className="dashboard-alertas-header">
        <h2>Alertas de documentación</h2>
        {!sinAlertas && (
          <div className="dashboard-alertas-resumen">
            {alertas.vencidos > 0 && (
              <EstadoBadge tono="error">{alertas.vencidos} Vencidos</EstadoBadge>
            )}
            {alertas.proximosAVencer > 0 && (
              <EstadoBadge tono="warning">{alertas.proximosAVencer} Por vencer</EstadoBadge>
            )}
          </div>
        )}
      </div>

      {sinAlertas ? (
        <div className="dashboard-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
          </svg>
          <span>Sin alertas por ahora</span>
          <span className="dashboard-empty-hint">
            Toda la documentación registrada de vehículos y choferes está al día
          </span>
        </div>
      ) : (
        <ul className="alertas-lista">
          {alertas.documentos.map((doc) => {
            const esVehiculo = doc.categoria === 'VEHICULO';
            const sujeto = esVehiculo
              ? `${doc.vehiculo.marca} ${doc.vehiculo.modelo} (${doc.vehiculo.dominio})`
              : `${doc.usuario.nombre} ${doc.usuario.apellido}`;

            const tono = doc.estado === 'VENCIDO' ? 'error' : 'warning';
            const textoDias =
              doc.diasRestantes < 0
                ? `Vencido hace ${Math.abs(doc.diasRestantes)} día(s)`
                : doc.diasRestantes === 0
                ? 'Vence hoy'
                : `Vence en ${doc.diasRestantes} día(s)`;

            return (
              <li
                key={`${doc.categoria}-${doc.id}`}
                className="alertas-item alertas-item-clickeable"
                onClick={() => irADocumentacion(doc)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && irADocumentacion(doc)}
                title="Ir a la documentación"
              >
                <div className="alertas-info">
                  <div className="alertas-titulo">
                    <span className="alertas-tipo">{doc.tipo}</span>
                    <span className="alertas-sujeto">• {sujeto}</span>
                  </div>
                  <span className="alertas-fecha">
                    Fecha vencimiento: {new Date(doc.fechaVencimiento).toLocaleDateString('es-AR')} — {textoDias}
                  </span>
                </div>
                <EstadoBadge tono={tono}>
                  {doc.estado === 'VENCIDO' ? 'Vencido' : 'Próximo a vencer'}
                </EstadoBadge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Dashboard() {
  const { usuario } = useAuth();

  return (
    <Layout>
      <h1>Panel principal</h1>
      <p className="dashboard-greeting">
        Hola, {usuario.nombre} {usuario.apellido}
      </p>

      {usuario.habilitadoParaConducir && <ViajesDelChofer />}

      <SeccionAlertasDocumentacion />
    </Layout>
  );
}

export default Dashboard;
