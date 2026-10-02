import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import FormField from '../components/ui/FormField';
import Spinner from '../components/ui/Spinner';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearRangoCompacto, nombreVehiculo } from '../utils/viajeFormato';
import './Viajes.css';

const ICONO_FILTRO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="4 4 20 4 14 12.5 14 19 10 21 10 12.5 4 4" />
  </svg>
);

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'PROGRAMADO', label: 'Programado' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const FILTROS_INICIALES = {
  estado: '',
  fechaDesde: '',
  fechaHasta: '',
};

function MisViajes() {
  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;

  const cargarViajes = useCallback(() => {
    setCargando(true);
    const params = {};
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
    if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;

    return api
      .get('/viajes/mis-viajes', { params })
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
        <h1>Mis viajes</h1>
      </div>

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

      {!cargando && viajes.length === 0 && (
        <Card className="viajes-listado-empty">No tenés viajes asignados</Card>
      )}

      {!cargando && viajes.length > 0 && (
        <div className="viajes-listado-cards">
          {viajes.map((v) => (
            <div key={v.id} className="viajes-listado-card">
              <div className="viajes-listado-card-header">
                <span className="viajes-listado-card-titulo">
                  {nombreVehiculo(v.vehiculo)} ({v.vehiculo.marca} {v.vehiculo.modelo})
                </span>
                <EstadoDot color={ESTADOS_VIAJE[v.estado].dot} size="md">
                  {ESTADOS_VIAJE[v.estado].label}
                </EstadoDot>
              </div>
              <div className="viajes-listado-card-detalle">
                <span>{formatearRangoCompacto(v.fechaInicio, v.fechaFin)}</span>
                <span>{v.kilometrosEstimados} km estimados</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

export default MisViajes;
