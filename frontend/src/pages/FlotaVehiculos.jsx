import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoBadge from '../components/ui/EstadoBadge';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import { formatearFechaCorta, formatearKm } from '../utils/viajeFormato';
import { ordenarPorInterno } from '../utils/vehiculos';
import { ListadoCard, ListadoHeader, ListadoToolbar } from '../components/Listado';
import IconoVehiculo from '../components/IconoVehiculo';
import './FlotaVehiculos.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const ESTADOS = [
  { value: '', label: 'Activos' },
  { value: 'OPERATIVO', label: 'Operativos' },
  { value: 'EN_TALLER', label: 'En taller' },
  { value: 'DADO_DE_BAJA', label: 'Dados de baja' },
  { value: 'TODOS', label: 'Todos' },
];

const FORM_INICIAL = {
  dominio: '',
  numeroInterno: '',
  marca: '',
  modelo: '',
  anio: '',
  asientos: '',
  kilometraje: '',
  tipoVehiculoId: '',
};

const PUEDE_GESTIONAR_FLOTA = ['ADMINISTRADOR', 'ENCARGADO'];

function FlotaVehiculos() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const puedeGestionar = PUEDE_GESTIONAR_FLOTA.includes(usuario.perfil);
  const [vehiculos, setVehiculos] = useState([]);
  const [tiposVehiculo, setTiposVehiculo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorBaja, setErrorBaja] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [erroresForm, setErroresForm] = useState({});
  const [enviandoForm, setEnviandoForm] = useState(false);

  const cargarVehiculos = useCallback(() => {
    setCargando(true);
    const params = {};
    if (estado) params.estado = estado;
    if (busqueda) params.busqueda = busqueda;

    return api
      .get('/vehiculos', { params })
      .then(({ data }) => setVehiculos(data.vehiculos))
      .finally(() => setCargando(false));
  }, [estado, busqueda]);

  useEffect(() => {
    setSeleccionado(null);
    setConfirmandoBaja(false);
    setMensaje('');
    cargarVehiculos();
  }, [cargarVehiculos]);

  useEffect(() => {
    api.get('/tipos-vehiculo').then(({ data }) => setTiposVehiculo(data.tiposVehiculo));
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  // La ficha y el formulario reemplazan al listado dentro de la misma ruta: sin
  // esto conservan el scroll de la vista anterior (aparecen desplazados hacia
  // abajo, y el listado también al cancelar o guardar desde los botones del final).
  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seleccionadoId, mostrarForm]);

  function seleccionar(v) {
    setMostrarForm(false);
    setSeleccionado(v);
    setConfirmandoBaja(false);
    setMensaje('');
    setErrorBaja('');
  }

  function cerrarFicha() {
    setSeleccionado(null);
    setConfirmandoBaja(false);
  }

  async function confirmarBaja() {
    setErrorBaja('');
    try {
      await api.patch(`/vehiculos/${seleccionado.id}/baja`);
      setMensaje('Vehículo dado de baja correctamente.');
      setConfirmandoBaja(false);
      setSeleccionado(null);
      cargarVehiculos();
    } catch (err) {
      setErrorBaja(err.response?.data?.error || 'No se pudo dar de baja el vehículo');
      setConfirmandoBaja(false);
    }
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_INICIAL);
    setErroresForm({});
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function abrirEditar(v) {
    setEditando(v);
    setForm({
      dominio: v.dominio,
      numeroInterno: v.numeroInterno,
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      asientos: v.asientos,
      kilometraje: v.kilometraje,
      tipoVehiculoId: v.tipoVehiculoId,
    });
    setErroresForm({});
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    setErroresForm({});
    setEnviandoForm(true);
    try {
      if (editando) {
        await api.put(`/vehiculos/${editando.id}`, form);
        setMensaje('Cambios guardados correctamente.');
      } else {
        await api.post('/vehiculos', form);
        setMensaje('Vehículo registrado correctamente.');
      }
      setMostrarForm(false);
      setEditando(null);
      cargarVehiculos();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErroresForm(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErroresForm({ general: err.response.data.error });
      } else {
        setErroresForm({ general: 'No se pudo guardar el vehículo' });
      }
    } finally {
      setEnviandoForm(false);
    }
  }

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <ListadoHeader titulo="Flota de vehículos" />
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {mostrarForm && (
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar vehículo' : 'Crear vehículo'}</h1>
          <Card className="form-card">
            <form onSubmit={handleSubmitForm} noValidate>
              <div className="form-grid">
                <FormField id="numeroInterno" label="Número de interno" required error={erroresForm.numeroInterno}>
                  <input name="numeroInterno" value={form.numeroInterno} onChange={handleFormChange} />
                </FormField>

                <FormField
                  id="dominio"
                  label="Dominio"
                  required
                  hint="Formato AB123CD o ABC123"
                  error={erroresForm.dominio}
                >
                  <input name="dominio" value={form.dominio} onChange={handleFormChange} />
                </FormField>

                <FormField id="marca" label="Marca" required error={erroresForm.marca}>
                  <input name="marca" value={form.marca} onChange={handleFormChange} />
                </FormField>

                <FormField id="modelo" label="Modelo" required error={erroresForm.modelo}>
                  <input name="modelo" value={form.modelo} onChange={handleFormChange} />
                </FormField>

                <FormField id="tipoVehiculoId" label="Tipo de vehículo" required error={erroresForm.tipoVehiculoId}>
                  <select name="tipoVehiculoId" value={form.tipoVehiculoId} onChange={handleFormChange}>
                    <option value="">Seleccionar…</option>
                    {tiposVehiculo.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.descripcion}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField id="anio" label="Año" required error={erroresForm.anio}>
                  <input name="anio" type="number" value={form.anio} onChange={handleFormChange} />
                </FormField>

                <FormField id="asientos" label="Cantidad de asientos" required error={erroresForm.asientos}>
                  <input name="asientos" type="number" value={form.asientos} onChange={handleFormChange} />
                </FormField>

                <FormField
                  id="kilometraje"
                  label="Kilometraje actual"
                  required
                  hint="En kilómetros"
                  error={erroresForm.kilometraje}
                >
                  <input name="kilometraje" type="number" value={form.kilometraje} onChange={handleFormChange} />
                </FormField>
              </div>

              {erroresForm.general && <Alert variant="error">{erroresForm.general}</Alert>}

              <div className="form-actions">
                <Button type="submit" variant="primary" loading={enviandoForm}>
                  {enviandoForm ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear vehículo'}
                </Button>
                <Button type="button" variant="secondary" onClick={cerrarForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <ListadoToolbar
            busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar por dominio, interno o marca' }}
            filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos: estado ? 1 : 0 }}
            accion={puedeGestionar ? { etiqueta: 'Crear vehículo', onClick: abrirNuevo } : undefined}
          />

          {mostrarFiltros && (
            <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
              <FormField id="estado" label="Estado">
                <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </form>
          )}

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando vehículos" />
              <span>Cargando vehículos…</span>
            </div>
          )}

          {!cargando && vehiculos.length === 0 && <div className="listado-vacio">No se encontraron vehículos</div>}

          {!cargando && vehiculos.length > 0 && (
            <div className="listado-cards">
              {ordenarPorInterno(vehiculos).map((v) => (
                <ListadoCard
                  key={v.id}
                  marca={<IconoVehiculo tipo={v.tipoVehiculo.descripcion} />}
                  titulo={
                    <>
                      {v.numeroInterno} - <span className="patente">{v.dominio}</span>
                    </>
                  }
                  estado={
                    <EstadoBadge tono={ESTADOS_VEHICULO[v.estado].tono} size="sm">
                      {ESTADOS_VEHICULO[v.estado].label}
                    </EstadoBadge>
                  }
                  sub={`${v.marca} ${v.modelo}`}
                  pie={[v.tipoVehiculo.descripcion, `${formatearKm(v.kilometraje)} km`]}
                  onClick={() => seleccionar(v)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (
        <>
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="flota-detalle-header">
            <h1>
              Vehículo {seleccionado.numeroInterno} - <span className="patente">{seleccionado.dominio}</span>
            </h1>
            <EstadoBadge tono={ESTADOS_VEHICULO[seleccionado.estado].tono}>
              {ESTADOS_VEHICULO[seleccionado.estado].label}
            </EstadoBadge>
          </div>

          <Card className="detalle-card flota-detalle" role="region" aria-label="Ficha del vehículo">
            <dl className="detalle-grid">
              <div className="detalle-item">
                <dt>Número de interno</dt>
                <dd>{seleccionado.numeroInterno}</dd>
              </div>
              <div className="detalle-item">
                <dt>Dominio</dt>
                <dd className="patente">{seleccionado.dominio}</dd>
              </div>
              <div className="detalle-item">
                <dt>Marca</dt>
                <dd>{seleccionado.marca}</dd>
              </div>
              <div className="detalle-item">
                <dt>Modelo</dt>
                <dd>{seleccionado.modelo}</dd>
              </div>
              <div className="detalle-item">
                <dt>Tipo de vehículo</dt>
                <dd>{seleccionado.tipoVehiculo.descripcion}</dd>
              </div>
              <div className="detalle-item">
                <dt>Año</dt>
                <dd>{seleccionado.anio}</dd>
              </div>
              <div className="detalle-item">
                <dt>Cantidad de asientos</dt>
                <dd>{seleccionado.asientos}</dd>
              </div>
              <div className="detalle-item">
                <dt>Kilometraje</dt>
                <dd>{formatearKm(seleccionado.kilometraje)} km</dd>
              </div>
              <div className="detalle-item">
                <dt>Registrado el</dt>
                <dd>{formatearFechaCorta(seleccionado.creadoEn)}</dd>
              </div>
              {seleccionado.fechaBaja && (
                <div className="detalle-item">
                  <dt>Dado de baja el</dt>
                  <dd>{formatearFechaCorta(seleccionado.fechaBaja)}</dd>
                </div>
              )}
            </dl>

            {puedeGestionar && (
              <div className="detalle-acciones">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/documentacion?vehiculoId=${seleccionado.id}`)}
                >
                  Ver documentación
                </Button>
                {seleccionado.estado !== 'DADO_DE_BAJA' && (
                  <>
                    <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                      Editar vehículo
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                      Dar de baja
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      <ConfirmModal
        open={confirmandoBaja}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Dar de baja el vehículo"
        description={
          seleccionado && (
            <>
              <p>
                Vas a dar de baja el vehículo de dominio <strong>{seleccionado.dominio}</strong> (interno{' '}
                <strong>{seleccionado.numeroInterno}</strong>). Esta acción no se puede deshacer.
              </p>
            </>
          )
        }
        confirmLabel="Dar de baja"
        onConfirm={confirmarBaja}
        onCancel={() => setConfirmandoBaja(false)}
      />
    </Layout>
  );
}

export default FlotaVehiculos;
