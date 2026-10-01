import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import FormField from '../components/ui/FormField';
import Spinner from '../components/ui/Spinner';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import './Viajes.css';

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

function formatearFechaHora(valor) {
  // Se fuerza la zona horaria de Córdoba (la única en la que opera Adri-mar)
  // para que la hora mostrada no dependa de la zona horaria del navegador de
  // quien esté mirando la pantalla.
  return new Date(valor).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nombreChofer(chofer) {
  return `${chofer.nombre} ${chofer.apellido}`;
}

function nombreVehiculo(vehiculo) {
  return `${vehiculo.numeroInterno} - ${vehiculo.dominio}`;
}

function dedupePorId(lista) {
  const vistos = new Map();
  for (const item of lista) {
    if (!vistos.has(item.id)) vistos.set(item.id, item);
  }
  return [...vistos.values()];
}

function Viajes() {
  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [opcionesChofer, setOpcionesChofer] = useState([]);
  const [opcionesVehiculo, setOpcionesVehiculo] = useState([]);

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

  function handleFiltroChange(e) {
    const { name, value } = e.target;
    setFiltros((f) => ({ ...f, [name]: value }));
  }

  return (
    <Layout>
      <div className="viajes-listado-header">
        <h1>Viajes</h1>
      </div>

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
                  <tr key={v.id}>
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
              <Card key={v.id} className="viajes-listado-card">
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
              </Card>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}

export default Viajes;
