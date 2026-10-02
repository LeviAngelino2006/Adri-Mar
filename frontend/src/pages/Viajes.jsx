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
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { aInputCordoba } from '../utils/fechaCordoba';
import { formatearFechaHora, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import './Viajes.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const ICONO_FINALIZAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'PROGRAMADO', label: 'Programado' },
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
  const [opcionesChofer, setOpcionesChofer] = useState([]);
  const [opcionesVehiculo, setOpcionesVehiculo] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const [cancelando, setCancelando] = useState(null);
  const [errorCancelar, setErrorCancelar] = useState('');

  const [finalizando, setFinalizando] = useState(null);
  const [odometroFinal, setOdometroFinal] = useState('');
  const [erroresFinalizar, setErroresFinalizar] = useState({});
  const [enviandoFinalizar, setEnviandoFinalizar] = useState(false);

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

  function pedirFinalizacion(viaje) {
    setErrorCancelar('');
    setOdometroFinal('');
    setErroresFinalizar({});
    setFinalizando(viaje);
  }

  async function confirmarFinalizacion() {
    setErroresFinalizar({});
    setEnviandoFinalizar(true);
    try {
      await api.patch(`/viajes/${finalizando.id}/finalizar`, { odometroFinal });
      setMensaje('Viaje finalizado correctamente. Se actualizó el kilometraje del vehículo.');
      setFinalizando(null);
      setSeleccionado(null);
      cargarViajes();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErroresFinalizar(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErroresFinalizar({ general: err.response.data.error });
      } else {
        setErroresFinalizar({ general: 'No se pudo finalizar el viaje' });
      }
    } finally {
      setEnviandoFinalizar(false);
    }
  }

  return (
    <Layout>
      <div className="viajes-listado-header">
        <h1>Viajes</h1>
        {!mostrarForm && !seleccionado && puedeGestionar && (
          <Button variant="primary" onClick={abrirNuevo}>
            + Programar viaje
          </Button>
        )}
      </div>

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorCancelar && <Alert variant="error">{errorCancelar}</Alert>}

      {mostrarForm && (
        <Card className="form-card">
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h2>{editando ? 'Editar viaje' : 'Programar viaje'}</h2>
          <ViajeForm
            valoresIniciales={editando ? viajeAValoresForm(editando) : undefined}
            onSubmit={handleGuardarForm}
            textoBoton={editando ? 'Guardar cambios' : 'Programar viaje'}
            textoEnviando={editando ? 'Guardando…' : 'Programando…'}
            onCancelar={cerrarForm}
          />
        </Card>
      )}

      {!mostrarForm && !seleccionado && (
        <>
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

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando viajes" />
              <span>Cargando viajes…</span>
            </div>
          )}

          {!cargando && viajes.length === 0 && <Card className="viajes-listado-empty">No se encontraron viajes</Card>}

          {!cargando && viajes.length > 0 && (
            <>
              <div className="viajes-listado-table-wrap">
                <table className="viajes-listado-table">
                  <thead>
                    <tr>
                      <th>Chofer</th>
                      <th>Vehículo</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Km estimados</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viajes.map((v) => (
                      <tr
                        key={v.id}
                        className="viajes-listado-row"
                        tabIndex={0}
                        onClick={() => seleccionar(v)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            seleccionar(v);
                          }
                        }}
                      >
                        <td>{nombreChofer(v.chofer)}</td>
                        <td>
                          {nombreVehiculo(v.vehiculo)} ({v.vehiculo.marca} {v.vehiculo.modelo})
                        </td>
                        <td>{formatearFechaHora(v.fechaInicio)}</td>
                        <td>{formatearFechaHora(v.fechaFin)}</td>
                        <td>{v.kilometrosEstimados}</td>
                        <td>
                          <EstadoDot color={ESTADOS_VIAJE[v.estado].dot}>{ESTADOS_VIAJE[v.estado].label}</EstadoDot>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="viajes-listado-cards">
                {viajes.map((v) => (
                  <button type="button" key={v.id} className="viajes-listado-card" onClick={() => seleccionar(v)}>
                    <div className="viajes-listado-card-top">
                      <span className="viajes-listado-card-chofer">{nombreChofer(v.chofer)}</span>
                      <EstadoDot color={ESTADOS_VIAJE[v.estado].dot}>{ESTADOS_VIAJE[v.estado].label}</EstadoDot>
                    </div>
                    <span>
                      {nombreVehiculo(v.vehiculo)} ({v.vehiculo.marca} {v.vehiculo.modelo})
                    </span>
                    <span>
                      {formatearFechaHora(v.fechaInicio)} → {formatearFechaHora(v.fechaFin)}
                    </span>
                    <span>{v.kilometrosEstimados} km estimados</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (
        <Card className="viajes-detalle" role="region" aria-label="Ficha del viaje">
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="viajes-detalle-header">
            <h2>Viaje de {nombreChofer(seleccionado.chofer)}</h2>
            <EstadoDot color={ESTADOS_VIAJE[seleccionado.estado].dot} size="md">
              {ESTADOS_VIAJE[seleccionado.estado].label}
            </EstadoDot>
          </div>

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
              <dt>Fecha y hora de inicio</dt>
              <dd>{formatearFechaHora(seleccionado.fechaInicio)}</dd>
            </div>
            <div className="detalle-item">
              <dt>Fecha y hora de fin</dt>
              <dd>{formatearFechaHora(seleccionado.fechaFin)}</dd>
            </div>
            <div className="detalle-item">
              <dt>Kilómetros estimados</dt>
              <dd>{seleccionado.kilometrosEstimados}</dd>
            </div>
            <div className="detalle-item">
              <dt>Kilometraje actual del vehículo</dt>
              <dd>{seleccionado.vehiculo.kilometraje} km</dd>
            </div>
          </dl>

          {puedeGestionar && seleccionado.estado === 'PROGRAMADO' && (
            <div className="viajes-detalle-actions">
              <Button variant="primary" onClick={() => pedirFinalizacion(seleccionado)}>
                Finalizar
              </Button>
              <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => pedirCancelacion(seleccionado)}>
                Cancelar
              </Button>
            </div>
          )}
        </Card>
      )}

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

      <ConfirmModal
        open={Boolean(finalizando)}
        tone="brand"
        icon={ICONO_FINALIZAR}
        title="Finalizar el viaje"
        description={
          finalizando && (
            <div className="finalizar-viaje-modal">
              <p>
                Chofer <strong>{nombreChofer(finalizando.chofer)}</strong>, vehículo{' '}
                <strong>{nombreVehiculo(finalizando.vehiculo)}</strong>.
                <br />
                Kilometraje actual del vehículo: <strong>{finalizando.vehiculo.kilometraje} km</strong>.
              </p>
              <FormField id="odometroFinal" label="Odómetro final (km)" error={erroresFinalizar.odometroFinal}>
                <input
                  type="number"
                  min={finalizando.vehiculo.kilometraje}
                  value={odometroFinal}
                  onChange={(e) => setOdometroFinal(e.target.value)}
                />
              </FormField>
              {erroresFinalizar.general && <Alert variant="error">{erroresFinalizar.general}</Alert>}
            </div>
          )
        }
        confirmLabel={enviandoFinalizar ? 'Finalizando…' : 'Finalizar viaje'}
        onConfirm={confirmarFinalizacion}
        onCancel={() => setFinalizando(null)}
      />
    </Layout>
  );
}

export default Viajes;
