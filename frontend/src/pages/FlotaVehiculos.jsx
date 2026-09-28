import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

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

      <form onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="busqueda">Buscar por dominio, interno o marca</label>
        <input
          id="busqueda"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <label htmlFor="estado">Estado</label>
        <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </form>

      {mensajeBaja && <p role="status">{mensajeBaja}</p>}
      {errorBaja && <p role="alert">{errorBaja}</p>}

      {cargando && <p>Cargando…</p>}
      {!cargando && vehiculos.length === 0 && <p>No se encontraron vehículos</p>}
      {!cargando && vehiculos.length > 0 && (
        <table>
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
              <tr key={v.id}>
                <td>
                  <button type="button" onClick={() => seleccionar(v)}>
                    {v.dominio}
                  </button>
                </td>
                <td>{v.numeroInterno}</td>
                <td>{v.marca}</td>
                <td>{v.modelo}</td>
                <td>{v.kilometraje}</td>
                <td>{v.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {seleccionado && (
        <section aria-label="Ficha del vehículo">
          <h2>Ficha del vehículo</h2>
          <dl>
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
            <dt>Estado</dt>
            <dd>{seleccionado.estado}</dd>
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
            <>
              <Link to={`/vehiculos/${seleccionado.id}/editar`}>Editar</Link>{' '}
              {!confirmandoBaja && (
                <button type="button" onClick={() => setConfirmandoBaja(true)}>
                  Dar de baja
                </button>
              )}
            </>
          )}

          {confirmandoBaja && (
            <div role="alertdialog">
              <p>
                ¿Confirma dar de baja el vehículo de dominio <strong>{seleccionado.dominio}</strong>
                {' '}(interno <strong>{seleccionado.numeroInterno}</strong>)?
              </p>
              <button type="button" onClick={confirmarBaja}>
                Confirmar baja
              </button>
              <button type="button" onClick={() => setConfirmandoBaja(false)}>
                Cancelar
              </button>
            </div>
          )}

          <div>
            <button type="button" onClick={() => setSeleccionado(null)}>
              Cerrar ficha
            </button>
          </div>
        </section>
      )}
    </Layout>
  );
}

export default FlotaVehiculos;
