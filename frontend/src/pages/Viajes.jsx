import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import ViajeForm from '../components/ViajeForm';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import IndicadorVencimiento from '../components/ui/IndicadorVencimiento';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { aInputCordoba } from '../utils/fechaCordoba';
import { formatearFechaHora, formatearRangoCompacto, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import './Viajes.css';

const ICONO_FILTRO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="4 4 20 4 14 12.5 14 19 10 21 10 12.5 4 4" />
  </svg>
);

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'PROGRAMADO', label: 'Programado' },
  { value: 'EN_VIAJE', label: 'En viaje' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const FILTROS_INICIALES = {
  estado: '',
  choferId: '',
  vehiculoId: '',
  fechaDesde: '',
  fechaHasta: '',
};

function dedupePorId(lista) {
  const vistos = new Map();
  for (const item of lista) {
    if (!vistos.has(item.id)) vistos.set(item.id, item);
  }
  return [...vistos.values()];
}

function viajeAValoresForm(viaje) {
  return {
    choferId: viaje.choferId,
    vehiculoId: viaje.vehiculoId,
    origenId: viaje.origenId || '',
    origenNombre: viaje.origen?.nombre || '',
    destinoId: viaje.destinoId || '',
    destinoNombre: viaje.destino?.nombre || '',
    fechaInicio: aInputCordoba(viaje.fechaInicio),
    fechaFin: aInputCordoba(viaje.fechaFin),
    kilometrosEstimados: viaje.kilometrosEstimados,
  };
}

function Viajes() {
  const { usuario } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR.includes(usuario.perfil);

  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;
  const [opcionesChofer, setOpcionesChofer] = useState([]);
  const [opcionesVehiculo, setOpcionesVehiculo] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const [cancelando, setCancelando] = useState(null);
  const [errorCancelar, setErrorCancelar] = useState('');

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — un solo estado para
  // el modal compartido de odómetro (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

  // Las opciones de los selects de chofer/vehículo salen de los viajes ya
  // programados (se cargan una sola vez, sin filtros) en vez de pedirle la
  // lista completa a /usuarios o /vehiculos, porque Personal de Taller puede
  // ver este listado pero no tiene acceso a esos otros endpoints.
  useEffect(() => {
    api.get('/viajes').then(({ data }) => {
      setOpcionesChofer(
        dedupePorId(data.viajes.map((v) => v.chofer)).sort((a, b) => nombreChofer(a).localeCompare(nombreChofer(b)))
      );
      setOpcionesVehiculo(
        dedupePorId(data.viajes.map((v) => v.vehiculo)).sort((a, b) =>
          nombreVehiculo(a).localeCompare(nombreVehiculo(b))
        )
      );
    });
  }, []);

  const cargarViajes = useCallback(() => {
    setCargando(true);
    const params = {};
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.choferId) params.choferId = filtros.choferId;
    if (filtros.vehiculoId) params.vehiculoId = filtros.vehiculoId;
    if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
    if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;

    return api
      .get('/viajes', { params })
      .then(({ data }) => setViajes(data.viajes))
      .finally(() => setCargando(false));
  }, [filtros]);

  useEffect(() => {
    cargarViajes();
  }, [cargarViajes]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  function handleFiltroChange(e) {
    const { name, value } = e.target;
    setFiltros((f) => ({ ...f, [name]: value }));
  }

  function seleccionar(viaje) {
    setMostrarForm(false);
    setSeleccionado(viaje);
    setErrorCancelar('');
  }

  function cerrarFicha() {
    setSeleccionado(null);
  }

  function abrirNuevo() {
    setErrorCancelar('');
    setEditando(null);
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function abrirEditar(viaje) {
    setErrorCancelar('');
    setEditando(viaje);
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
  }

  async function handleGuardarForm(datos) {
    if (editando) {
      await api.put(`/viajes/${editando.id}`, datos);
      setMensaje('Viaje modificado correctamente.');
    } else {
      await api.post('/viajes', datos);
      setMensaje('Viaje programado correctamente.');
    }
    setMostrarForm(false);
    setEditando(null);
    cargarViajes();
  }

  function pedirCancelacion(viaje) {
    setErrorCancelar('');
    setCancelando(viaje);
  }

  async function confirmarCancelacion() {
    setErrorCancelar('');
    try {
      await api.patch(`/viajes/${cancelando.id}/cancelar`);
      setMensaje('Viaje cancelado correctamente.');
      setCancelando(null);
      setSeleccionado(null);
      cargarViajes();
    } catch (err) {
      setErrorCancelar(err.response?.data?.error || 'No se pudo cancelar el viaje');
      setCancelando(null);
    }
  }

  function pedirComenzar(viaje) {
    setErrorCancelar('');
    setPedidoOdometro({ viaje, accion: 'comenzar' });
  }

  function pedirFinalizar(viaje) {
    setErrorCancelar('');
    setPedidoOdometro({ viaje, accion: 'finalizar' });
  }

  function manejarExitoOdometro(viajeActualizado, mensajeExito) {
    setMensaje(mensajeExito);
    setPedidoOdometro(null);
    // Tanto al comenzar como al finalizar, la ficha se actualiza en el lugar
    // en vez de volver al listado: el usuario ve de inmediato el nuevo
    // estado (En viaje u Finalizado), la hora real correspondiente, y — al
    // finalizar — los km recorridos. Vuelve al listado manualmente con
    // "Volver al listado" cuando quiera.
    setSeleccionado(viajeActualizado);
    cargarViajes();
  }

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <div className="viajes-listado-header">
          <h1>Viajes</h1>
          {puedeGestionar && (
            <Button variant="primary" onClick={abrirNuevo}>
              + Programar viaje
            </Button>
          )}
        </div>
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorCancelar && <Alert variant="error">{errorCancelar}</Alert>}

      {mostrarForm && (
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar viaje' : 'Programar viaje'}</h1>
          <Card className="form-card">
            <ViajeForm
              valoresIniciales={editando ? viajeAValoresForm(editando) : undefined}
              onSubmit={handleGuardarForm}
              textoBoton={editando ? 'Guardar cambios' : 'Programar viaje'}
              textoEnviando={editando ? 'Guardando…' : 'Programando…'}
              onCancelar={cerrarForm}
            />
          </Card>
        </>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <div className="viajes-listado-toolbar">
            <button
              type="button"
              className="filtros-toggle-btn"
              aria-expanded={mostrarFiltros}
              onClick={() => setMostrarFiltros((m) => !m)}
            >
              {ICONO_FILTRO}
              Filtros
              {filtrosActivos > 0 && <span className="filtros-toggle-badge">{filtrosActivos}</span>}
            </button>
          </div>

          {mostrarFiltros && (
            <form className="viajes-listado-filtros" onSubmit={(e) => e.preventDefault()}>
              <FormField id="estado" label="Estado">
                <select name="estado" value={filtros.estado} onChange={handleFiltroChange}>
                  {ESTADOS_FILTRO.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="choferId" label="Chofer">
                <select name="choferId" value={filtros.choferId} onChange={handleFiltroChange}>
                  <option value="">Todos</option>
                  {opcionesChofer.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nombreChofer(c)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="vehiculoId" label="Vehículo">
                <select name="vehiculoId" value={filtros.vehiculoId} onChange={handleFiltroChange}>
                  <option value="">Todos</option>
                  {opcionesVehiculo.map((v) => (
                    <option key={v.id} value={v.id}>
                      {nombreVehiculo(v)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="fechaDesde" label="Desde">
                <input type="date" name="fechaDesde" value={filtros.fechaDesde} onChange={handleFiltroChange} />
              </FormField>

              <FormField id="fechaHasta" label="Hasta">
                <input type="date" name="fechaHasta" value={filtros.fechaHasta} onChange={handleFiltroChange} />
              </FormField>
            </form>
          )}

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando viajes" />
              <span>Cargando viajes…</span>
            </div>
          )}

          {!cargando && viajes.length === 0 && <Card className="viajes-listado-empty">No se encontraron viajes</Card>}

          {!cargando && viajes.length > 0 && (
            <div className="viajes-listado-cards">
              {viajes.map((v) => (
                <button type="button" key={v.id} className="viajes-listado-card" onClick={() => seleccionar(v)}>
                  <div className="viajes-listado-card-header">
                    <span className="viajes-listado-card-titulo">{nombreChofer(v.chofer)}</span>
                    <div className="viajes-listado-card-estado">
                      <EstadoDot color={ESTADOS_VIAJE[v.estado].dot} size="md">
                        {ESTADOS_VIAJE[v.estado].label}
                      </EstadoDot>
                      <IndicadorVencimiento viaje={v} />
                    </div>
                  </div>
                  <span className="viajes-listado-card-vehiculo">
                    {nombreVehiculo(v.vehiculo)} ({v.vehiculo.marca} {v.vehiculo.modelo})
                  </span>
                  <div className="viajes-listado-card-detalle">
                    <span>{formatearRangoCompacto(v.fechaInicio, v.fechaFin)}</span>
                    <span>{v.kilometrosEstimados} km estimados</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (() => {
        const puedeOperarEsteViaje = puedeGestionar || usuario.id === seleccionado.choferId;

        return (
          <>
            <button type="button" className="back-link" onClick={cerrarFicha}>
              ← Volver al listado
            </button>

            <div className="viajes-detalle-header">
              <h1>Viaje de {nombreChofer(seleccionado.chofer)}</h1>
              <div className="viajes-detalle-estado">
                <EstadoDot color={ESTADOS_VIAJE[seleccionado.estado].dot} size="md">
                  {ESTADOS_VIAJE[seleccionado.estado].label}
                </EstadoDot>
                <IndicadorVencimiento viaje={seleccionado} size="md" />
              </div>
            </div>

            <Card className="viajes-detalle" role="region" aria-label="Ficha del viaje">
              <dl className="viajes-detalle-list">
                <div className="detalle-item">
                  <dt>Chofer</dt>
                  <dd>{nombreChofer(seleccionado.chofer)}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Vehículo</dt>
                  <dd>
                    {nombreVehiculo(seleccionado.vehiculo)} ({seleccionado.vehiculo.marca} {seleccionado.vehiculo.modelo})
                  </dd>
                </div>
                <div className="detalle-item">
                  <dt>Origen</dt>
                  <dd>{seleccionado.origen?.nombre || 'No registrado'}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Destino</dt>
                  <dd>{seleccionado.destino?.nombre || 'No registrado'}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Fecha y hora de inicio</dt>
                  <dd>{formatearFechaHora(seleccionado.fechaInicio)}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Fecha y hora de fin</dt>
                  <dd>{formatearFechaHora(seleccionado.fechaFin)}</dd>
                </div>
                {seleccionado.horaInicioReal && (
                  <div className="detalle-item">
                    <dt>Hora real de inicio</dt>
                    <dd>{formatearFechaHora(seleccionado.horaInicioReal)}</dd>
                  </div>
                )}
                {seleccionado.horaFinReal && (
                  <div className="detalle-item">
                    <dt>Hora real de fin</dt>
                    <dd>{formatearFechaHora(seleccionado.horaFinReal)}</dd>
                  </div>
                )}
                <div className="detalle-item">
                  <dt>Kilómetros estimados</dt>
                  <dd>{seleccionado.kilometrosEstimados}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Kilometraje actual del vehículo</dt>
                  <dd>{seleccionado.vehiculo.kilometraje} km</dd>
                </div>
                {seleccionado.estado === 'FINALIZADO' && seleccionado.kmRealizados != null && (
                  <div className="detalle-item">
                    <dt>Km realizados</dt>
                    <dd>{seleccionado.kmRealizados} km</dd>
                  </div>
                )}
              </dl>

              {seleccionado.estado === 'PROGRAMADO' && (puedeOperarEsteViaje || puedeGestionar) && (
                <div className="viajes-detalle-actions">
                  {puedeOperarEsteViaje && (
                    <Button variant="primary" onClick={() => pedirComenzar(seleccionado)}>
                      Comenzar
                    </Button>
                  )}
                  {puedeGestionar && (
                    <>
                      <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => pedirCancelacion(seleccionado)}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              )}

              {seleccionado.estado === 'EN_VIAJE' && puedeOperarEsteViaje && (
                <div className="viajes-detalle-actions">
                  <Button variant="primary" onClick={() => pedirFinalizar(seleccionado)}>
                    Finalizar
                  </Button>
                </div>
              )}
            </Card>
          </>
        );
      })()}

      <ConfirmModal
        open={Boolean(cancelando)}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Cancelar el viaje"
        description={
          cancelando && (
            <>
              Vas a cancelar el viaje de <strong>{nombreChofer(cancelando.chofer)}</strong> en{' '}
              <strong>{nombreVehiculo(cancelando.vehiculo)}</strong> del{' '}
              <strong>{formatearFechaHora(cancelando.fechaInicio)}</strong>. Esta acción no se puede deshacer.
            </>
          )
        }
        confirmLabel="Cancelar viaje"
        onConfirm={confirmarCancelacion}
        onCancel={() => setCancelando(null)}
      />

      <ModalOdometroViaje
        viaje={pedidoOdometro?.viaje}
        accion={pedidoOdometro?.accion}
        onCerrar={() => setPedidoOdometro(null)}
        onExito={manejarExitoOdometro}
      />
    </Layout>
  );
}

export default Viajes;
