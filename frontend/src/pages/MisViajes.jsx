import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import EstadoBadge from '../components/ui/EstadoBadge';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import EstadoCarga from '../components/ui/EstadoCarga';
import Toast from '../components/ui/Toast';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import BotonComenzarViaje from '../components/BotonComenzarViaje';
import { ListadoViajesPorDia } from '../components/TarjetaViaje';
import { ListadoHeader, ListadoToolbar } from '../components/Listado';
import FichaViaje from '../components/FichaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { nombreVehiculo } from '../utils/viajeFormato';
import { VISTAS_MIS_VIAJES, viajesDeLaVista, vistaMisViajes } from '../utils/misViajes';
import { useCarga } from '../hooks/useCarga';
import { useViajesEnCurso } from '../hooks/useViajesEnCurso';
import './Viajes.css';

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

// El filtro de estado ofrece solo los estados de la vista (Próximos | Anteriores).
const ESTADOS_FILTRO = {
  proximos: [
    { value: '', label: 'Todos' },
    { value: 'PROGRAMADO', label: 'Programado' },
    { value: 'EN_VIAJE', label: 'En viaje' },
  ],
  anteriores: [
    { value: '', label: 'Todos' },
    { value: 'FINALIZADO', label: 'Finalizado' },
    { value: 'CANCELADO', label: 'Cancelado' },
  ],
};

const OPCIONES_VISTA = [
  { valor: 'proximos', etiqueta: 'Próximos' },
  { valor: 'anteriores', etiqueta: 'Anteriores' },
];

const VACIO_SIN_FILTROS = {
  proximos: 'No tenés viajes próximos.',
  anteriores: 'No tenés viajes anteriores.',
};

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

  // Próximos | Anteriores, en la URL (?tab=anteriores) como en Documentación.
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = vistaMisViajes(searchParams.get('tab'));

  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;
  const [mensaje, setMensaje] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — mismo modal
  // compartido que usa Viajes.jsx (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

  // useCarga lleva los estados de cargando y error (un error no es un listado vacío).
  const pedirViajes = useCallback(() => {
    const params = {};
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
    if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;

    return api
      .get('/viajes/mis-viajes', { params })
      .then(({ data }) => {
        if (viajeIdPendiente.current !== null) {
          const pendiente = data.viajes.find((v) => v.id === viajeIdPendiente.current);
          viajeIdPendiente.current = null;
          if (pendiente) setSeleccionado(pendiente);
          // Se limpia el estado de navegación para que recargar la página no
          // vuelva a abrir la ficha.
          navigate(location.pathname, { replace: true, state: null });
        }
        return data.viajes;
      });
    // setSeleccionado es estable; va en la lista para que el React Compiler
    // (oxlint, preserve-manual-memoization) pueda conservar el useCallback.
  }, [filtros, navigate, location.pathname, setSeleccionado]);

  const cargaViajes = useCarga(pedirViajes);
  const viajes = cargaViajes.datos ?? [];
  const { enCurso, resto } = viajesDeLaVista(viajes, vista);
  const vistaVacia = enCurso.length === 0 && resto.length === 0;
  const cargarViajes = cargaViajes.recargar;

  // El viaje En viaje propio, para no ofrecer "Comenzar viaje" mientras hay otro
  // en curso (ver BotonComenzarViaje). El listado puede estar filtrado, por eso
  // se pide aparte.
  const viajesEnCurso = useViajesEnCurso(
    '/viajes/mis-viajes',
    seleccionado?.estado === 'PROGRAMADO' ? seleccionado.id : null
  );

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  // La ficha reemplaza al listado dentro de la misma ruta: sin esto conserva el
  // scroll de la vista anterior (la ficha aparece desplazada hacia abajo, y el
  // listado también al volver desde los botones del final).
  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seleccionadoId]);

  function handleFiltroChange(e) {
    const { name, value } = e.target;
    setFiltros((f) => ({ ...f, [name]: value }));
  }

  // Un estado que no es de la nueva vista (Cancelado al pasar a Próximos) se
  // limpia: si no, la vista quedaría vacía por un filtro que ya no se ve.
  function cambiarVista(nueva) {
    setSearchParams(nueva === 'anteriores' ? { tab: 'anteriores' } : {});
    if (filtros.estado && !VISTAS_MIS_VIAJES[nueva].includes(filtros.estado)) {
      setFiltros((f) => ({ ...f, estado: '' }));
    }
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
            vistas={{ opciones: OPCIONES_VISTA, valor: vista, onChange: cambiarVista, ariaLabel: 'Vista de mis viajes' }}
          />

          {mostrarFiltros && (
            <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
              <FormField id="estado" label="Estado">
                <select name="estado" value={filtros.estado} onChange={handleFiltroChange}>
                  {ESTADOS_FILTRO[vista].map((e) => (
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

          <EstadoCarga
            carga={cargaViajes}
            forma="viajes"
            que="tus viajes"
            vacio={
              vistaVacia && (
                <div className="listado-vacio">
                  {filtrosActivos > 0 ? 'No hay viajes con esos filtros.' : VACIO_SIN_FILTROS[vista]}
                </div>
              )
            }
          >
            <ListadoViajesPorDia viajes={resto} enCurso={enCurso} variante={varianteTarjeta} onSeleccionar={seleccionar} />
          </EstadoCarga>
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
              <BotonComenzarViaje
                viaje={seleccionado}
                enCurso={viajesEnCurso}
                onComenzar={pedirComenzar}
                onVerViajeEnCurso={seleccionar}
              />
            </div>
          )}

          {seleccionado.estado === 'EN_VIAJE' && (
            <div className="viajes-detalle-actions">
              <Button variant="primary" onClick={() => pedirFinalizar(seleccionado)}>
                Finalizar viaje
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
