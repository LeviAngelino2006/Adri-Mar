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
import Alert from '../components/ui/Alert';
import EstadoBadge from '../components/ui/EstadoBadge';
import RutaViaje from '../components/RutaViaje';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import PanelViajesPorConfirmar from '../components/PanelViajesPorConfirmar';
import PanelViajesDeHoy from '../components/PanelViajesDeHoy';
import FechaTile from '../components/FechaTile';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearDiaYHora, formatearHorarioViaje, nombreVehiculo } from '../utils/viajeFormato';
import { porcentajeProgresoViaje } from '../utils/fechaCordoba';
import { lineaAlertaDocumento, ordenarAlertas, resumenAlertas } from '../utils/documentacion';
import './Dashboard.css';

// Los que gestionan viajes (ver el panel de viajes por confirmar).
const PERFILES_GESTORES = ['ADMINISTRADOR', 'ENCARGADO'];

const MAX_VIAJES_INICIAL = 3;
const MAX_DOCUMENTOS_INICIAL = 5;
const INTERVALO_PROGRESO_MS = 60 * 1000;

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
        <div className="dashboard-empty">No tenés viajes programados próximamente</div>
      )}

      {!cargando && viajes.length > 0 && (
        <>
          <ul className="proximos-viajes-lista">
            {visibles.map((v) => (
              <li key={v.id} className="proximos-viajes-item">
                <button type="button" className="proximos-viajes-enlace" onClick={() => onVerDetalle(v)}>
                  <FechaTile fecha={v.fechaInicio} />
                  <span className="proximos-viajes-info">
                    <span className="proximos-viajes-ruta">
                      <RutaViaje origen={v.origen} destino={v.destino} paradas={v.paradas} />
                    </span>
                    <span className="proximos-viajes-salida">{formatearHorarioViaje(v.fechaInicio, v.fechaFin)}</span>
                    {v.vehiculo && (
                      <span className="proximos-viajes-vehiculo">
                        {v.vehiculo.numeroInterno} - <span className="patente">{v.vehiculo.dominio}</span>
                      </span>
                    )}
                  </span>
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

// Documentos vencidos y por vencer de vehículos y choferes: primero los vencidos
// (el más atrasado arriba), después los por vencer (el más próximo arriba). Se
// muestran 5 y el resto con "Ver N más". Cada fila lleva a la ficha del vehículo
// o del chofer en Documentación.
function SeccionDocumentacion() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    obtenerAlertasVencimientos()
      .then((res) => setAlertas(res))
      .catch((err) => {
        console.error('Error al cargar alertas:', err);
        setError(true);
      })
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <Card className="dashboard-panel">
        <h2>Documentación</h2>
        <div className="loading-state">
          <Spinner label="Cargando alertas" />
          <span>Cargando alertas…</span>
        </div>
      </Card>
    );
  }

  // Ante un error nunca se muestra "Sin alertas": no se sabe si las hay.
  if (error) {
    return (
      <Card className="dashboard-panel">
        <h2>Documentación</h2>
        <Alert variant="error">No se pudieron cargar las alertas.</Alert>
      </Card>
    );
  }

  const sinAlertas = alertas.totalAlertas === 0;
  const documentos = ordenarAlertas(alertas.documentos);
  const visibles = mostrarTodos ? documentos : documentos.slice(0, MAX_DOCUMENTOS_INICIAL);
  const restantes = documentos.length - MAX_DOCUMENTOS_INICIAL;

  function irADocumentacion(doc) {
    if (doc.categoria === 'VEHICULO') {
      navigate(`/documentacion?vehiculoId=${doc.vehiculo.id}`);
    } else {
      navigate(`/documentacion?tab=choferes&choferId=${doc.usuario.id}`);
    }
  }

  return (
    <Card className="dashboard-panel">
      <div className="dashboard-panel-header">
        <h2>Documentación</h2>
        {!sinAlertas && <span className="dashboard-resumen">{resumenAlertas(alertas)}</span>}
      </div>

      {sinAlertas ? (
        <div className="dashboard-empty">
          <span>Sin alertas por ahora</span>
          <span className="dashboard-empty-hint">
            Toda la documentación registrada de vehículos y choferes está al día
          </span>
        </div>
      ) : (
        <>
          <ul className="dashboard-lista">
            {visibles.map((doc) => {
              const vencido = doc.estado === 'VENCIDO';
              return (
                <li key={`${doc.categoria}-${doc.id}`}>
                  <button type="button" className="dashboard-fila sin-hora" onClick={() => irADocumentacion(doc)}>
                    <span className="dashboard-fila-info">
                      <span className="dashboard-fila-titulo">
                        {doc.categoria === 'VEHICULO' ? (
                          <>
                            {doc.vehiculo.numeroInterno} - <span className="patente">{doc.vehiculo.dominio}</span>
                          </>
                        ) : (
                          `${doc.usuario.nombre} ${doc.usuario.apellido}`
                        )}
                      </span>
                      <span className="dashboard-fila-meta">{lineaAlertaDocumento(doc)}</span>
                    </span>
                    <EstadoBadge tono={vencido ? 'error' : 'warning'} size="sm">
                      {vencido ? 'Vencido' : 'Por vencer'}
                    </EstadoBadge>
                  </button>
                </li>
              );
            })}
          </ul>

          {restantes > 0 && (
            <Button variant="secondary" className="dashboard-ver-mas" onClick={() => setMostrarTodos((m) => !m)}>
              {mostrarTodos ? 'Ver menos' : `Ver ${restantes} más`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function Dashboard() {
  const { usuario } = useAuth();

  const esGestor = PERFILES_GESTORES.includes(usuario.perfil);

  return (
    <Layout>
      <h1>Hola, {usuario.nombre}</h1>

      {usuario.habilitadoParaConducir && <ViajesDelChofer />}

      {esGestor && (
        <>
          <PanelViajesDeHoy />
          <div className="dashboard-columnas">
            <PanelViajesPorConfirmar />
            <SeccionDocumentacion />
          </div>
        </>
      )}
    </Layout>
  );
}

export default Dashboard;
