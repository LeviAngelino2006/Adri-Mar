import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import EstadoBadge from '../components/ui/EstadoBadge';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import TarjetaViaje from '../components/TarjetaViaje';
import { ListadoHeader, ListadoToolbar } from '../components/Listado';
import FichaViaje from '../components/FichaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { nombreVehiculo } from '../utils/viajeFormato';
import './Viajes.css';

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
  fechaDesde: '',
  fechaHasta: '',
};

function MisViajes() {
  const { usuario } = useAuth();
  // Un chofer ve sus viajes con el vehículo como título; un gestor, como en Viajes
  // (con el chofer como título).
  const varianteTarjeta = PUEDE_GESTIONAR.includes(usuario.perfil) ? undefined : 'chofer';
  const location = useLocation();
  const navigate = useNavigate();
  // El Dashboard manda `viajeId` en el estado de navegación para abrir
  // directo la ficha de ese viaje. Se consume una sola vez, al terminar la
  // primera carga del listado.
  const viajeIdPendiente = useRef(location.state?.viajeId ?? null);

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
      .then(({ data }) => {
        setViajes(data.viajes);

        if (viajeIdPendiente.current !== null) {
          const pendiente = data.viajes.find((v) => v.id === viajeIdPendiente.current);
          viajeIdPendiente.current = null;
          if (pendiente) setSeleccionado(pendiente);
          // Se limpia el estado de navegación para que recargar la página no
          // vuelva a abrir la ficha.
          navigate(location.pathname, { replace: true, state: null });
        }
      })
      .finally(() => setCargando(false));
  }, [filtros, navigate, location.pathname]);

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
        <ListadoHeader titulo="Mis viajes" />
      )}

      {mensaje && <Toast>{mensaje}</Toast>}

      {!seleccionado && (
        <>
          <ListadoToolbar
            filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos: filtrosActivos }}
          />

          {mostrarFiltros && (
            <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
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

          {!cargando && viajes.length === 0 && <div className="listado-vacio">No tenés viajes asignados</div>}

          {!cargando && viajes.length > 0 && (
            <div className="listado-cards">
              {viajes.map((v) => (
                <TarjetaViaje key={v.id} viaje={v} variante={varianteTarjeta} onClick={() => seleccionar(v)} />
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
              <EstadoBadge tono={ESTADOS_VIAJE[seleccionado.estado].tono}>
                {ESTADOS_VIAJE[seleccionado.estado].label}
              </EstadoBadge>
            </div>
          </div>

          <FichaViaje viaje={seleccionado} />

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
