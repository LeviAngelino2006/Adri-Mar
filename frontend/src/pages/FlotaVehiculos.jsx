import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
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

const ICONO_COLECTIVO = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="11" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="9" y1="5" x2="9" y2="10" />
    <line x1="15" y1="5" x2="15" y2="10" />
    <circle cx="7.5" cy="18.5" r="1.6" />
    <circle cx="16.5" cy="18.5" r="1.6" />
  </svg>
);

const ICONO_COMBI = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16V9a1 1 0 0 1 1-1h9l4 3.5V16" />
    <line x1="13" y1="8" x2="13" y2="16" />
    <circle cx="7" cy="18.3" r="1.6" />
    <circle cx="16" cy="18.3" r="1.6" />
  </svg>
);

function ordenarPorInterno(vehiculos) {
  return [...vehiculos].sort(
    (a, b) => (parseInt(a.numeroInterno, 10) || 0) - (parseInt(b.numeroInterno, 10) || 0)
  );
}

function FlotaVehiculos() {
  const { usuario } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR_FLOTA.includes(usuario.perfil);
  const [vehiculos, setVehiculos] = useState([]);
  const [tiposVehiculo, setTiposVehiculo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');
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
        <div className="flota-header">
          <h1>Flota de vehículos</h1>
          {puedeGestionar && (
            <Button variant="primary" onClick={abrirNuevo}>
              + Nuevo vehículo
            </Button>
          )}
        </div>
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {mostrarForm && (
        <Card className="form-card">
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar vehículo' : 'Nuevo vehículo'}</h1>
          <form onSubmit={handleSubmitForm} noValidate>
            <div className="form-grid">
              <FormField id="dominio" label="Dominio" error={erroresForm.dominio}>
                <input name="dominio" value={form.dominio} onChange={handleFormChange} />
              </FormField>

              <FormField id="numeroInterno" label="Número de interno" error={erroresForm.numeroInterno}>
                <input name="numeroInterno" value={form.numeroInterno} onChange={handleFormChange} />
              </FormField>

              <FormField id="marca" label="Marca" error={erroresForm.marca}>
                <input name="marca" value={form.marca} onChange={handleFormChange} />
              </FormField>

              <FormField id="modelo" label="Modelo" error={erroresForm.modelo}>
                <input name="modelo" value={form.modelo} onChange={handleFormChange} />
              </FormField>

              <FormField id="tipoVehiculoId" label="Tipo de vehículo" error={erroresForm.tipoVehiculoId}>
                <select name="tipoVehiculoId" value={form.tipoVehiculoId} onChange={handleFormChange}>
                  <option value="">Seleccionar…</option>
                  {tiposVehiculo.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.descripcion}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="anio" label="Año" error={erroresForm.anio}>
                <input name="anio" type="number" value={form.anio} onChange={handleFormChange} />
              </FormField>

              <FormField id="asientos" label="Cantidad de asientos" error={erroresForm.asientos}>
                <input name="asientos" type="number" value={form.asientos} onChange={handleFormChange} />
              </FormField>

              <FormField id="kilometraje" label="Kilometraje actual" error={erroresForm.kilometraje}>
                <input name="kilometraje" type="number" value={form.kilometraje} onChange={handleFormChange} />
              </FormField>
            </div>

            {erroresForm.general && <Alert variant="error">{erroresForm.general}</Alert>}

            <div className="form-actions">
              <Button type="submit" variant="primary" loading={enviandoForm}>
                {enviandoForm ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button type="button" variant="secondary" onClick={cerrarForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <form className="flota-filtros" onSubmit={(e) => e.preventDefault()}>
            <FormField id="busqueda" label="Buscar por dominio, interno o marca">
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </FormField>

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

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando vehículos" />
              <span>Cargando vehículos…</span>
            </div>
          )}

          {!cargando && vehiculos.length === 0 && (
            <Card className="flota-empty">No se encontraron vehículos</Card>
          )}

          {!cargando && vehiculos.length > 0 && (
            <>
              <div className="flota-table-wrap">
                <table className="flota-table">
                  <thead>
                    <tr>
                      <th>Interno</th>
                      <th>Dominio</th>
                      <th>Marca / Modelo</th>
                      <th>Tipo</th>
                      <th>Kilometraje</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenarPorInterno(vehiculos).map((v) => (
                      <tr
                        key={v.id}
                        className="flota-row"
                        tabIndex={0}
                        onClick={() => seleccionar(v)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            seleccionar(v);
                          }
                        }}
                      >
                        <td>{v.numeroInterno}</td>
                        <td className="flota-row-dominio">{v.dominio}</td>
                        <td>
                          {v.marca} {v.modelo}
                        </td>
                        <td>{v.tipoVehiculo.descripcion}</td>
                        <td>{v.kilometraje}</td>
                        <td>
                          <EstadoDot color={ESTADOS_VEHICULO[v.estado].dot}>
                            {ESTADOS_VEHICULO[v.estado].label}
                          </EstadoDot>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flota-cards">
                {ordenarPorInterno(vehiculos).map((v) => (
                  <button type="button" key={v.id} className="flota-card" onClick={() => seleccionar(v)}>
                    <div className="flota-card-icon">
                      {v.tipoVehiculo.descripcion === 'Colectivo' ? ICONO_COLECTIVO : ICONO_COMBI}
                    </div>
                    <div className="flota-card-content">
                      <div className="flota-card-top">
                        <span className="flota-card-dominio">
                          {v.numeroInterno} - {v.dominio}
                        </span>
                        <EstadoDot color={ESTADOS_VEHICULO[v.estado].dot}>
                          {ESTADOS_VEHICULO[v.estado].label}
                        </EstadoDot>
                      </div>
                      <div className="flota-card-body">
                        <span>
                          {v.marca} {v.modelo}
                        </span>
                        <span>{v.kilometraje} km</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (
        <Card className="flota-detalle" role="region" aria-label="Ficha del vehículo">
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="flota-detalle-header">
            <h1>Vehículo {seleccionado.dominio}</h1>
            <EstadoDot color={ESTADOS_VEHICULO[seleccionado.estado].dot} size="md">
              {ESTADOS_VEHICULO[seleccionado.estado].label}
            </EstadoDot>
          </div>

          <dl className="flota-detalle-list">
            <div className="detalle-item">
              <dt>Dominio</dt>
              <dd>{seleccionado.dominio}</dd>
            </div>
            <div className="detalle-item">
              <dt>Número de interno</dt>
              <dd>{seleccionado.numeroInterno}</dd>
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
              <dd>{seleccionado.kilometraje}</dd>
            </div>
            {seleccionado.fechaBaja && (
              <div className="detalle-item">
                <dt>Fecha de baja</dt>
                <dd>{new Date(seleccionado.fechaBaja).toLocaleDateString()}</dd>
              </div>
            )}
            <div className="detalle-item">
              <dt>Registrado el</dt>
              <dd>{new Date(seleccionado.creadoEn).toLocaleDateString()}</dd>
            </div>
          </dl>

          {puedeGestionar && seleccionado.estado !== 'DADO_DE_BAJA' && (
            <div className="flota-detalle-actions">
              <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                Dar de baja
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmModal
        open={confirmandoBaja}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Dar de baja el vehículo"
        description={
          seleccionado && (
            <>
              Vas a dar de baja el vehículo de dominio <strong>{seleccionado.dominio}</strong> (interno{' '}
              <strong>{seleccionado.numeroInterno}</strong>). Esta acción no se puede deshacer.
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
