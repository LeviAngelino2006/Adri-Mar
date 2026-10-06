import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import RutaViaje from '../components/RutaViaje';
import IndicadorVencimiento from '../components/ui/IndicadorVencimiento';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearFechaHora, formatearRangoCompacto, nombreVehiculo } from '../utils/viajeFormato';
import './Viajes.css';

const ICONO_FILTRO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="4 4 20 4 14 12.5 14 19 10 21 10 12.5 4 4" />
  </svg>
);

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'PROGRAMADO', label: 'Programado' },
  { value: 'EN_VIAJE', label: 'En viaje' },
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
  const [mensaje, setMensaje] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — mismo modal
  // compartido que usa Viajes.jsx (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

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
    setSeleccionado(viaje);
  }

  function cerrarFicha() {
    setSeleccionado(null);
  }

  function pedirComenzar(viaje) {
    setPedidoOdometro({ viaje, accion: 'comenzar' });
  }

  function pedirFinalizar(viaje) {
    setPedidoOdometro({ viaje, accion: 'finalizar' });
  }

  function manejarExitoOdometro(viajeActualizado, mensajeExito) {
    setMensaje(mensajeExito);
    setPedidoOdometro(null);
    // Tanto al comenzar como al finalizar, la ficha se actualiza en el lugar
    // en vez de volver al listado (ver mismo criterio en Viajes.jsx).
    setSeleccionado(viajeActualizado);
    cargarViajes();
  }

  return (
    <Layout>
      {!seleccionado && (
        <div className="viajes-listado-header">
          <h1>Mis viajes</h1>
        </div>
      )}

      {mensaje && <Toast>{mensaje}</Toast>}

      {!seleccionado && (
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
                <button type="button" key={v.id} className="viajes-listado-card" onClick={() => seleccionar(v)}>
                  <div className="viajes-listado-card-header">
                    <span className="viajes-listado-card-titulo">
                      {nombreVehiculo(v.vehiculo)} ({v.vehiculo.marca} {v.vehiculo.modelo})
                    </span>
                    <div className="viajes-listado-card-estado">
                      <EstadoDot color={ESTADOS_VIAJE[v.estado].dot} size="md">
                        {ESTADOS_VIAJE[v.estado].label}
                      </EstadoDot>
                      <IndicadorVencimiento viaje={v} />
                    </div>
                  </div>
                  <div className="viajes-listado-card-ruta">
                    <RutaViaje origen={v.origen} destino={v.destino} />
                  </div>
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

      {seleccionado && (
        <>
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="viajes-detalle-header">
            <h1>{nombreVehiculo(seleccionado.vehiculo)}</h1>
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
                <dt>Cliente</dt>
                <dd>{seleccionado.cliente?.nombre || 'No registrado'}</dd>
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
              {seleccionado.observacionFinal && (
                <div className="detalle-item detalle-item-ancho">
                  <dt>Observación del viaje</dt>
                  <dd>{seleccionado.observacionFinal}</dd>
                </div>
              )}
            </dl>

            {seleccionado.estado === 'PROGRAMADO' && (
              <div className="viajes-detalle-actions">
                <Button variant="primary" onClick={() => pedirComenzar(seleccionado)}>
                  Comenzar
                </Button>
              </div>
            )}

            {seleccionado.estado === 'EN_VIAJE' && (
              <div className="viajes-detalle-actions">
                <Button variant="primary" onClick={() => pedirFinalizar(seleccionado)}>
                  Finalizar
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      <ModalOdometroViaje
        viaje={pedidoOdometro?.viaje}
        accion={pedidoOdometro?.accion}
        onCerrar={() => setPedidoOdometro(null)}
        onExito={manejarExitoOdometro}
      />
    </Layout>
  );
}

export default MisViajes;
