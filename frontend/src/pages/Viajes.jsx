import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoBadge from '../components/ui/EstadoBadge';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import ViajeForm from '../components/ViajeForm';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import ModalConfirmarViaje from '../components/ModalConfirmarViaje';
import AvisarPorWhatsApp from '../components/AvisarPorWhatsApp';
import { ListadoViajesPorDia } from '../components/TarjetaViaje';
import { ListadoHeader, ListadoToolbar } from '../components/Listado';
import DatosAdministrativosViaje from '../components/DatosAdministrativosViaje';
import FichaViaje from '../components/FichaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { DURACION_TOAST_CON_ACCION_MS, DURACION_TOAST_MS } from '../constants/toast';
import { aInputCordoba } from '../utils/fechaCordoba';
import { paradasDesdeViaje } from '../utils/paradas';
import { avisoWhatsApp } from '../utils/whatsapp';
import { formatearFechaHora, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import { ordenarPorInterno } from '../utils/vehiculos';
import './Viajes.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'A_CONFIRMAR', label: 'A confirmar' },
  { value: 'PROGRAMADO', label: 'Programado' },
  { value: 'EN_VIAJE', label: 'En viaje' },
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

function dedupePorId(lista) {
  const vistos = new Map();
  for (const item of lista) {
    if (!vistos.has(item.id)) vistos.set(item.id, item);
  }
  return [...vistos.values()];
}

function viajeAValoresForm(viaje) {
  return {
    clienteId: viaje.clienteId || '',
    clienteNombre: viaje.cliente?.nombre || '',
    choferId: viaje.choferId || '',
    vehiculoId: viaje.vehiculoId || '',
    choferesCandidatos: (viaje.choferesCandidatos ?? []).map((c) => c.id),
    vehiculosCandidatos: (viaje.vehiculosCandidatos ?? []).map((c) => c.id),
    origenId: viaje.origenId || '',
    origenNombre: viaje.origen?.nombre || '',
    destinoId: viaje.destinoId || '',
    destinoNombre: viaje.destino?.nombre || '',
    paradas: paradasDesdeViaje(viaje),
    fechaInicio: aInputCordoba(viaje.fechaInicio),
    fechaFin: aInputCordoba(viaje.fechaFin),
    kilometrosEstimados: viaje.kilometrosEstimados ?? '',
    cantidadPasajeros: viaje.cantidadPasajeros ?? '',
  };
}

// Todo viaje nace A_CONFIRMAR (ver viajeService.crearViaje): el único camino a
// Programado es "Confirmar viaje". Editar nunca cambia el estado.
const MENSAJE_CREADO = 'Viaje creado como A confirmar';
const MENSAJE_EDITADO = 'Cambios guardados correctamente.';

function Viajes() {
  const { usuario } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR.includes(usuario.perfil);
  const location = useLocation();
  const navigate = useNavigate();
  // El panel "Viajes de hoy" del Dashboard manda `viajeId` en el estado de
  // navegación para abrir directo la ficha de ese viaje (mismo criterio que Mis
  // viajes). Se consume una sola vez, al terminar la primera carga del listado.
  const viajeIdPendiente = useRef(location.state?.viajeId ?? null);

  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;
  const [opcionesChofer, setOpcionesChofer] = useState([]);
  const [opcionesVehiculo, setOpcionesVehiculo] = useState([]);
  const [mensaje, setMensaje] = useState('');
  // Viaje recién confirmado: el toast de éxito ofrece avisarle al chofer por
  // WhatsApp. Va atado al mensaje, así no se arrastra a los toasts siguientes.
  const [viajeAvisable, setViajeAvisable] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const [cancelando, setCancelando] = useState(null);
  const [errorCancelar, setErrorCancelar] = useState('');

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — un solo estado para
  // el modal compartido de odómetro (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

  // Viaje A_CONFIRMAR sobre el que se abrió el modal de "Confirmar viaje", o
  // null si está cerrado.
  const [pedidoConfirmar, setPedidoConfirmar] = useState(null);

  // Las opciones de los selects de chofer/vehículo salen de los viajes ya
  // programados (se cargan una sola vez, sin filtros) en vez de pedirle la
  // lista completa a /usuarios o /vehiculos, porque Personal de Taller puede
  // ver este listado pero no tiene acceso a esos otros endpoints.
  useEffect(() => {
    // .filter(Boolean) porque un viaje A_CONFIRMAR puede no tener todavía
    // chofer/vehículo asignado (son null hasta que se complete o confirme).
    api.get('/viajes').then(({ data }) => {
      setOpcionesChofer(
        dedupePorId(data.viajes.map((v) => v.chofer).filter(Boolean)).sort((a, b) =>
          nombreChofer(a).localeCompare(nombreChofer(b))
        )
      );
      setOpcionesVehiculo(ordenarPorInterno(dedupePorId(data.viajes.map((v) => v.vehiculo).filter(Boolean))));
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

  // El toast ofrece avisar por WhatsApp solo si hay un link posible (chofer con
  // teléfono utilizable); con acción dura más, para dar tiempo a tocarla.
  const urlAviso = viajeAvisable ? avisoWhatsApp(viajeAvisable).url : null;

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(
      () => {
        setMensaje('');
        setViajeAvisable(null);
      },
      urlAviso ? DURACION_TOAST_CON_ACCION_MS : DURACION_TOAST_MS
    );
    return () => clearTimeout(t);
  }, [mensaje, urlAviso]);

  function mostrarMensaje(texto, viajeParaAvisar = null) {
    setMensaje(texto);
    setViajeAvisable(viajeParaAvisar);
  }

  // La ficha y el formulario reemplazan al listado dentro de la misma ruta: sin
  // esto conservan el scroll de la vista anterior (la ficha o el formulario
  // aparecen desplazados hacia abajo, y el listado también al cancelar o
  // guardar desde los botones del final).
  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seleccionadoId, mostrarForm]);

  function handleFiltroChange(e) {
    const { name, value } = e.target;
    setFiltros((f) => ({ ...f, [name]: value }));
  }

  function seleccionar(viaje) {
    setMostrarForm(false);
    setSeleccionado(viaje);
    setErrorCancelar('');
  }

  function cerrarFicha() {
    setSeleccionado(null);
  }

  function abrirNuevo() {
    setErrorCancelar('');
    setEditando(null);
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function abrirEditar(viaje) {
    setErrorCancelar('');
    setEditando(viaje);
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
  }

  async function handleGuardarForm(datos) {
    if (editando) {
      await api.put(`/viajes/${editando.id}`, datos);
      mostrarMensaje(MENSAJE_EDITADO);
    } else {
      await api.post('/viajes', datos);
      mostrarMensaje(MENSAJE_CREADO);
    }
    setMostrarForm(false);
    setEditando(null);
    cargarViajes();
  }

  function pedirCancelacion(viaje) {
    setErrorCancelar('');
    setCancelando(viaje);
  }

  async function confirmarCancelacion() {
    setErrorCancelar('');
    try {
      await api.patch(`/viajes/${cancelando.id}/cancelar`);
      mostrarMensaje('Viaje cancelado correctamente.');
      setCancelando(null);
      setSeleccionado(null);
      cargarViajes();
    } catch (err) {
      setErrorCancelar(err.response?.data?.error || 'No se pudo cancelar el viaje');
      setCancelando(null);
    }
  }

  function pedirComenzar(viaje) {
    setErrorCancelar('');
    setPedidoOdometro({ viaje, accion: 'comenzar' });
  }

  function pedirFinalizar(viaje) {
    setErrorCancelar('');
    setPedidoOdometro({ viaje, accion: 'finalizar' });
  }

  function manejarExitoOdometro(viajeActualizado, mensajeExito) {
    mostrarMensaje(mensajeExito);
    setPedidoOdometro(null);
    // Tanto al comenzar como al finalizar, la ficha se actualiza en el lugar
    // en vez de volver al listado: el usuario ve de inmediato el nuevo
    // estado (En viaje u Finalizado), la hora real correspondiente, y — al
    // finalizar — los km recorridos. Vuelve al listado manualmente con
    // "Volver al listado" cuando quiera.
    setSeleccionado(viajeActualizado);
    cargarViajes();
  }

  function pedirConfirmar(viaje) {
    setErrorCancelar('');
    setPedidoConfirmar(viaje);
  }

  function manejarExitoDatosAdministrativos(viajeActualizado) {
    mostrarMensaje('Datos administrativos guardados correctamente.');
    setSeleccionado(viajeActualizado);
    cargarViajes();
  }

  function manejarExitoConfirmar(viajeActualizado) {
    mostrarMensaje('Viaje confirmado correctamente. Quedó Programado.', viajeActualizado);
    setPedidoConfirmar(null);
    setSeleccionado(viajeActualizado);
    cargarViajes();
  }

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <ListadoHeader titulo="Viajes" />
      )}

      {mensaje && !mostrarForm && (
        <Toast action={urlAviso ? <AvisarPorWhatsApp viaje={viajeAvisable} variante="enlace" /> : undefined}>
          {mensaje}
        </Toast>
      )}
      {errorCancelar && <Alert variant="error">{errorCancelar}</Alert>}

      {mostrarForm && (
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar viaje' : 'Crear viaje'}</h1>
          <Card className="form-card">
            <ViajeForm
              valoresIniciales={editando ? viajeAValoresForm(editando) : undefined}
              estadoActual={editando?.estado}
              candidatosActuales={
                editando && { choferes: editando.choferesCandidatos, vehiculos: editando.vehiculosCandidatos }
              }
              onSubmit={handleGuardarForm}
              textoBoton={editando ? 'Guardar cambios' : 'Crear viaje'}
              textoEnviando={editando ? 'Guardando…' : 'Creando…'}
              onCancelar={cerrarForm}
              conDatosAdministrativos={puedeGestionar && !editando}
            />
          </Card>
        </>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <ListadoToolbar
            filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos: filtrosActivos }}
            accion={puedeGestionar ? { etiqueta: 'Crear viaje', onClick: abrirNuevo } : undefined}
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
          )}

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando viajes" />
              <span>Cargando viajes…</span>
            </div>
          )}

          {!cargando && viajes.length === 0 && <div className="listado-vacio">No se encontraron viajes</div>}

          {!cargando && viajes.length > 0 && (
            <ListadoViajesPorDia viajes={viajes} onSeleccionar={seleccionar} />
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (() => {
        const puedeOperarEsteViaje = puedeGestionar || usuario.id === seleccionado.choferId;

        return (
          <>
            <button type="button" className="back-link" onClick={cerrarFicha}>
              ← Volver al listado
            </button>

            <div className="viajes-detalle-header">
              <h1>{seleccionado.chofer ? `Viaje de ${nombreChofer(seleccionado.chofer)}` : 'Viaje a confirmar'}</h1>
              <div className="viajes-detalle-estado">
                <EstadoBadge tono={ESTADOS_VIAJE[seleccionado.estado].tono}>
                  {ESTADOS_VIAJE[seleccionado.estado].label}
                </EstadoBadge>
              </div>
            </div>

            <FichaViaje viaje={seleccionado} />

            {seleccionado.estado === 'A_CONFIRMAR' && puedeGestionar && (
              <div className="viajes-detalle-actions">
                <Button variant="primary" onClick={() => pedirConfirmar(seleccionado)}>
                  Confirmar viaje
                </Button>
                <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                  Editar viaje
                </Button>
                <Button variant="danger" onClick={() => pedirCancelacion(seleccionado)}>
                  Cancelar viaje
                </Button>
              </div>
            )}

            {seleccionado.estado === 'PROGRAMADO' && (puedeOperarEsteViaje || puedeGestionar) && (
              <div className="viajes-detalle-actions">
                {puedeOperarEsteViaje && (
                  <Button variant="primary" onClick={() => pedirComenzar(seleccionado)}>
                    Comenzar viaje
                  </Button>
                )}
                {puedeGestionar && (
                  <>
                    <AvisarPorWhatsApp viaje={seleccionado} />
                    <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                      Editar viaje
                    </Button>
                    <Button variant="danger" onClick={() => pedirCancelacion(seleccionado)}>
                      Cancelar viaje
                    </Button>
                  </>
                )}
              </div>
            )}

            {seleccionado.estado === 'EN_VIAJE' && puedeOperarEsteViaje && (
              <div className="viajes-detalle-actions">
                <Button variant="primary" onClick={() => pedirFinalizar(seleccionado)}>
                  Finalizar viaje
                </Button>
              </div>
            )}

            {puedeGestionar && (
              <DatosAdministrativosViaje
                key={seleccionado.id}
                viaje={seleccionado}
                onGuardado={manejarExitoDatosAdministrativos}
              />
            )}
          </>
        );
      })()}

      <ConfirmModal
        open={Boolean(cancelando)}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Cancelar el viaje"
        description={
          cancelando && (
            <>
              Vas a cancelar el viaje {cancelando.chofer && <>de <strong>{nombreChofer(cancelando.chofer)}</strong> </>}
              {cancelando.vehiculo && <>en <strong>{nombreVehiculo(cancelando.vehiculo)}</strong> </>}
              {cancelando.fechaInicio ? (
                <>del <strong>{formatearFechaHora(cancelando.fechaInicio)}</strong>. </>
              ) : (
                '(todavía a confirmar). '
              )}
              Esta acción no se puede deshacer.
            </>
          )
        }
        confirmLabel="Cancelar viaje"
        onConfirm={confirmarCancelacion}
        onCancel={() => setCancelando(null)}
      />

      <ModalOdometroViaje
        viaje={pedidoOdometro?.viaje}
        accion={pedidoOdometro?.accion}
        onCerrar={() => setPedidoOdometro(null)}
        onExito={manejarExitoOdometro}
      />

      <ModalConfirmarViaje
        viaje={pedidoConfirmar}
        onCerrar={() => setPedidoConfirmar(null)}
        onExito={manejarExitoConfirmar}
      />
    </Layout>
  );
}

export default Viajes;
