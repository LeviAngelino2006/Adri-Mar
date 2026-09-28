import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import './FlotaVehiculos.css';

const ESTADOS = [
  { value: '', label: 'Activos (Operativo / En taller)' },
  { value: 'OPERATIVO', label: 'Operativo' },
  { value: 'EN_TALLER', label: 'En taller' },
  { value: 'DADO_DE_BAJA', label: 'Dado de baja' },
  { value: 'TODOS', label: 'Todos' },
];

function FlotaVehiculos() {
  const { usuario } = useAuth();
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [mensajeBaja, setMensajeBaja] = useState('');
  const [errorBaja, setErrorBaja] = useState('');

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
    setMensajeBaja('');
    cargarVehiculos();
  }, [cargarVehiculos]);

  function seleccionar(v) {
    setSeleccionado(v);
    setConfirmandoBaja(false);
    setMensajeBaja('');
    setErrorBaja('');
  }

  async function confirmarBaja() {
    setErrorBaja('');
    try {
      await api.patch(`/vehiculos/${seleccionado.id}/baja`);
      setMensajeBaja('Vehículo dado de baja correctamente.');
      setConfirmandoBaja(false);
      setSeleccionado(null);
      cargarVehiculos();
    } catch (err) {
      setErrorBaja(err.response?.data?.error || 'No se pudo dar de baja el vehículo');
      setConfirmandoBaja(false);
    }
  }

  return (
    <Layout>
      <p className="page-back-link">
        <Link to="/">Volver</Link>
      </p>
      <h1>Flota de vehículos</h1>

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

      {mensajeBaja && <Alert variant="success">{mensajeBaja}</Alert>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {cargando && (
        <div className="flota-loading">
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
                  <th>Dominio</th>
                  <th>Interno</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Kilometraje</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id} className={seleccionado?.id === v.id ? 'is-selected' : undefined}>
                    <td>
                      <button type="button" className="flota-row-btn" onClick={() => seleccionar(v)}>
                        {v.dominio}
                      </button>
                    </td>
                    <td>{v.numeroInterno}</td>
                    <td>{v.marca}</td>
                    <td>{v.modelo}</td>
                    <td>{v.kilometraje}</td>
                    <td>
                      <Badge variant={ESTADOS_VEHICULO[v.estado].variant}>
                        {ESTADOS_VEHICULO[v.estado].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flota-cards">
            {vehiculos.map((v) => (
              <button
                type="button"
                key={v.id}
                className={`flota-card${seleccionado?.id === v.id ? ' is-selected' : ''}`}
                onClick={() => seleccionar(v)}
              >
                <div className="flota-card-header">
                  <span className="flota-card-dominio">{v.dominio}</span>
                  <Badge variant={ESTADOS_VEHICULO[v.estado].variant}>
                    {ESTADOS_VEHICULO[v.estado].label}
                  </Badge>
                </div>
                <div className="flota-card-body">
                  <span>Interno {v.numeroInterno}</span>
                  <span>
                    {v.marca} {v.modelo}
                  </span>
                  <span>{v.kilometraje} km</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {seleccionado && (
        <Card className="flota-detalle" role="region" aria-label="Ficha del vehículo">
          <div className="flota-detalle-header">
            <h2>Ficha del vehículo</h2>
            <Badge variant={ESTADOS_VEHICULO[seleccionado.estado].variant}>
              {ESTADOS_VEHICULO[seleccionado.estado].label}
            </Badge>
          </div>

          <dl className="flota-detalle-list">
            <dt>Dominio</dt>
            <dd>{seleccionado.dominio}</dd>
            <dt>Número de interno</dt>
            <dd>{seleccionado.numeroInterno}</dd>
            <dt>Marca</dt>
            <dd>{seleccionado.marca}</dd>
            <dt>Modelo</dt>
            <dd>{seleccionado.modelo}</dd>
            <dt>Año</dt>
            <dd>{seleccionado.anio}</dd>
            <dt>Cantidad de asientos</dt>
            <dd>{seleccionado.asientos}</dd>
            <dt>Kilometraje</dt>
            <dd>{seleccionado.kilometraje}</dd>
            {seleccionado.fechaBaja && (
              <>
                <dt>Fecha de baja</dt>
                <dd>{new Date(seleccionado.fechaBaja).toLocaleDateString()}</dd>
              </>
            )}
            <dt>Registrado el</dt>
            <dd>{new Date(seleccionado.creadoEn).toLocaleDateString()}</dd>
          </dl>

          {usuario.perfil === 'ADMINISTRADOR' && seleccionado.estado !== 'DADO_DE_BAJA' && (
            <div className="flota-detalle-actions">
              <Link to={`/vehiculos/${seleccionado.id}/editar`} className="btn btn-secondary">
                Editar
              </Link>
              {!confirmandoBaja && (
                <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                  Dar de baja
                </Button>
              )}
            </div>
          )}

          {confirmandoBaja && (
            <div className="flota-confirm-baja" role="alertdialog" aria-label="Confirmar baja de vehículo">
              <p>
                ¿Confirma dar de baja el vehículo de dominio <strong>{seleccionado.dominio}</strong>{' '}
                (interno <strong>{seleccionado.numeroInterno}</strong>)?
              </p>
              <div className="flota-confirm-actions">
                <Button variant="danger" onClick={confirmarBaja}>
                  Confirmar baja
                </Button>
                <Button variant="secondary" onClick={() => setConfirmandoBaja(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="flota-detalle-footer">
            <Button variant="secondary" onClick={() => setSeleccionado(null)}>
              Cerrar ficha
            </Button>
          </div>
        </Card>
      )}
    </Layout>
  );
}

export default FlotaVehiculos;
