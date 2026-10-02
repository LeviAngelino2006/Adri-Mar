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
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.004 10V5m5 5V5m5 5V5.5M5.016 17c-1.42 0-2.13 0-2.571-.44c-.441-.439-.441-1.146-.441-2.56V8c0-1.414 0-2.121.441-2.56S3.596 5 5.016 5h7.085c3.473 0 5.21 0 6.54.706c.978.52 1.794 1.3 2.356 2.252c.764 1.293.836 3.021.98 6.478c.04.932.06 1.398-.123 1.75c-.134.26-.34.474-.595.618c-.346.196-.814.196-1.75.196h-.505m-10 0h6" />
    <path d="M7.004 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4a2 2 0 0 0 0 4Z" />
    <path strokeLinecap="round" d="M1.996 10h13.368c.627 0 .84.368 1.32.944c.552.54.925.919 1.44.996c.72.108 3.384.054 3.384.054" />
  </svg>
);

const ICONO_COMBI = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.17 5.11A2 2 0 0 0 17.38 4H4c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2c0 1.65 1.35 3 3 3s3-1.35 3-3h4c0 1.65 1.35 3 3 3s3-1.35 3-3c1.1 0 2-.9 2-2v-3.76c0-.31-.07-.62-.21-.89zM17.38 6l2 4h-4.13V6zm-4.13 0v4h-3.5V6zm-5.5 0v4H4V6zM7 18a1.003 1.003 0 0 1-.87-1.5c.37-.63 1.36-.63 1.73 0c.09.15.13.32.13.49c0 .55-.45 1-1 1Zm10 0a1.003 1.003 0 0 1-.87-1.5c.37-.63 1.36-.63 1.73 0c.09.15.13.32.13.49c0 .55-.45 1-1 1Zm3-3h-.77s-.05-.05-.08-.07c-.06-.06-.12-.11-.17-.16c-.12-.11-.25-.21-.38-.29a3 3 0 0 0-.67-.32c-.07-.02-.14-.05-.21-.07Q17.375 14 17 14c-.375 0-.49.04-.72.09c-.07.02-.14.05-.21.07c-.16.05-.31.11-.45.19c-.07.04-.15.08-.22.13c-.13.09-.26.18-.38.29c-.06.05-.12.1-.18.16c-.02.03-.05.04-.08.07H9.23s-.05-.05-.08-.07c-.06-.06-.12-.11-.17-.16c-.12-.11-.25-.21-.38-.29a3 3 0 0 0-.67-.32c-.07-.02-.14-.05-.21-.07Q7.375 14 7 14c-.375 0-.49.04-.72.09c-.07.02-.14.05-.21.07c-.16.05-.31.11-.45.19c-.07.04-.15.08-.22.13c-.13.09-.26.18-.38.29c-.06.05-.12.1-.18.16c-.02.03-.05.04-.08.07h-.77v-3h16v3Z" />
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
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar vehículo' : 'Nuevo vehículo'}</h1>
          <Card className="form-card">
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
        </>
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
        <>
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="flota-detalle-header">
            <h1>Vehículo {seleccionado.dominio}</h1>
            <EstadoDot color={ESTADOS_VEHICULO[seleccionado.estado].dot} size="md">
              {ESTADOS_VEHICULO[seleccionado.estado].label}
            </EstadoDot>
          </div>

          <Card className="flota-detalle" role="region" aria-label="Ficha del vehículo">
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
