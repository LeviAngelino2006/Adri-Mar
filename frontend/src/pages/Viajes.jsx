import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoBadge from '../components/ui/EstadoBadge';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import EstadoCarga from '../components/ui/EstadoCarga';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import ViajeForm from '../components/ViajeForm';
import ModalOdometroViaje from '../components/ModalOdometroViaje';
import ModalConfirmarViaje from '../components/ModalConfirmarViaje';
import AvisarPorWhatsApp from '../components/AvisarPorWhatsApp';
import BotonComenzarViaje from '../components/BotonComenzarViaje';
import { ListadoViajesPorDia } from '../components/TarjetaViaje';
import { ListadoHeader, ListadoToolbar } from '../components/Listado';
import DatosAdministrativosViaje from '../components/DatosAdministrativosViaje';
import FichaViaje from '../components/FichaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { DURACION_TOAST_CON_ACCION_MS, DURACION_TOAST_MS } from '../constants/toast';
import DuplicarViaje from '../components/DuplicarViaje';
import { avisoDuplicado, valoresParaDuplicar, viajeAValoresForm } from '../utils/valoresFormViaje';
import { avisoWhatsApp } from '../utils/whatsapp';
import { formatearFechaHora, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import { esChoferDelViaje } from '../utils/choferDelViaje';
import { ordenarPorInterno } from '../utils/vehiculos';
import { useCarga } from '../hooks/useCarga';
import { useViajesEnCurso } from '../hooks/useViajesEnCurso';
import {
  OPCIONES_VISTA,
  VISTAS_VIAJES,
  filtrosParaLaVista,
  opcionesDeEstado,
  parametrosDeVista,
  separarProximos,
  vistaDeLaUrl,
} from '../utils/vistasViajes';
import './Viajes.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

// El filtro de estado ofrece solo los estados de la vista (Próximos | Anteriores).
const ESTADOS_FILTRO = {
  proximos: opcionesDeEstado(VISTAS_VIAJES.proximos),
  anteriores: opcionesDeEstado(VISTAS_VIAJES.anteriores),
};

const FILTROS_INICIALES = {
  estado: '',
  choferId: '',
  vehiculoId: '',
  fechaDesde: '',
  fechaHasta: '',
  // 'true' o '': viajes con badge "Sin precio" o "Cobro pendiente". Solo lo ven
  // (y el backend solo lo acepta de) Administrador y Encargado.
  administrativoPendiente: '',
};

function dedupePorId(lista) {
  const vistos = new Map();
  for (const item of lista) {
    if (!vistos.has(item.id)) vistos.set(item.id, item);
  }
  return [...vistos.values()];
}

const MARGEN_SCROLL_PX = 16;

// Scroll suave hasta la tarjeta de datos administrativos de la ficha. Si su
// encabezado (título y botón "Editar datos administrativos") ya se ve entero
// no se mueve nada: es el caso de escritorio. Descuenta la barra superior
// sticky del celular (en escritorio está oculta y mide 0). Con "reducir
// movimiento" el salto es directo.
function llevarADatosAdministrativos(tarjeta) {
  if (!tarjeta) return;
  const alturaBarra = document.querySelector('.layout-topbar')?.offsetHeight ?? 0;
  const encabezado = tarjeta.firstElementChild ?? tarjeta;
  const { top } = tarjeta.getBoundingClientRect();
  const { bottom } = encabezado.getBoundingClientRect();
  if (top >= alturaBarra && bottom <= window.innerHeight) return;

  const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({
    top: window.scrollY + top - alturaBarra - MARGEN_SCROLL_PX,
    behavior: reducirMovimiento ? 'auto' : 'smooth',
  });
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

  // Próximos | Anteriores, en la URL (?tab=anteriores) como en Mis viajes. El
  // corte y el orden los hace el backend (GET /viajes?vista=).
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = vistaDeLaUrl(searchParams.get('tab'));

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
  // "Duplicar viaje": { original, valores, aviso }. El formulario es un alta
  // precargada con `valores`.
  const [duplicando, setDuplicando] = useState(null);

  const [cancelando, setCancelando] = useState(null);
  const [errorCancelar, setErrorCancelar] = useState('');

  // { viaje, accion: 'comenzar' | 'finalizar' } | null — un solo estado para
  // el modal compartido de odómetro (ver ModalOdometroViaje).
  const [pedidoOdometro, setPedidoOdometro] = useState(null);

  // Viaje A_CONFIRMAR sobre el que se abrió el modal de "Confirmar viaje", o
  // null si está cerrado.
  const [pedidoConfirmar, setPedidoConfirmar] = useState(null);

  // Tarjeta de datos administrativos de la ficha abierta, y si hay que llevar
  // la vista hasta ella. Esto último lo pide solo el alta (handleGuardarForm):
  // abrir la ficha desde el listado o después de editar no lo hace.
  const datosAdministrativosRef = useRef(null);
  const irADatosAdministrativos = useRef(false);

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
    })
      // Sin red, los filtros de chofer y vehículo quedan solo con "Todos"; el
      // error ya lo muestra el listado, con "Reintentar".
      .catch(() => {});
  }, []);

  // Pide el listado con los filtros actuales; useCarga lleva los estados de
  // cargando y error (un error no es un listado vacío).
  const pedirViajes = useCallback(() => {
    const params = { vista };
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.choferId) params.choferId = filtros.choferId;
    if (filtros.vehiculoId) params.vehiculoId = filtros.vehiculoId;
    if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
    if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;
    if (filtros.administrativoPendiente) params.administrativoPendiente = filtros.administrativoPendiente;

    return api
      .get('/viajes', { params })
      .then(({ data }) => {
        if (viajeIdPendiente.current !== null) {
          const pendiente = data.viajes.find((v) => v.id === viajeIdPendiente.current);
          viajeIdPendiente.current = null;
          if (pendiente) setSeleccionado(pendiente);
          // Se limpia el estado de navegación para que recargar la página no
          // vuelva a abrir la ficha (la vista de la URL se conserva).
          navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        }
        return data.viajes;
      });
  }, [filtros, vista, navigate, location.pathname, location.search]);

  const cargaViajes = useCarga(pedirViajes);
  const viajes = cargaViajes.datos ?? [];
  // En Anteriores no hay grupos aparte: todo va por día, el más reciente primero.
  const { sinCerrar, enCurso, resto } =
    vista === 'proximos' ? separarProximos(viajes) : { sinCerrar: [], enCurso: [], resto: viajes };
  const cargarViajes = cargaViajes.recargar;

  // Viajes En viaje, para no ofrecer "Comenzar viaje" si el chofer o el vehículo
  // del viaje abierto ya están en otro (ver BotonComenzarViaje). Solo con la
  // ficha de un Programado abierta y para quien lo puede comenzar.
  const puedeComenzarSeleccionado =
    seleccionado?.estado === 'PROGRAMADO' && (puedeGestionar || esChoferDelViaje(seleccionado, usuario));
  const viajesEnCurso = useViajesEnCurso('/viajes', puedeComenzarSeleccionado ? seleccionado.id : null);

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
  // Después de crear, en el mismo efecto (para que corra después de volver
  // arriba) se baja hasta la tarjeta de datos administrativos.
  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
    if (irADatosAdministrativos.current) {
      irADatosAdministrativos.current = false;
      llevarADatosAdministrativos(datosAdministrativosRef.current);
    }
  }, [seleccionadoId, mostrarForm]);

  function handleFiltroChange(e) {
    const { name, value } = e.target;
    setFiltros((f) => ({ ...f, [name]: value }));
  }

  function cambiarVista(nueva) {
    setSearchParams(parametrosDeVista(nueva));
    setFiltros((f) => filtrosParaLaVista(f, VISTAS_VIAJES[nueva]));
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

  // Valores y aviso se calculan una sola vez y con el mismo "ahora": si el
  // viaje empieza en minutos, los dos tienen que coincidir en si la fecha se
  // copió o se vació.
  function abrirDuplicar(viaje) {
    const ahora = Date.now();
    setErrorCancelar('');
    setDuplicando({
      original: viaje,
      valores: valoresParaDuplicar(viaje, ahora),
      aviso: avisoDuplicado(viaje, ahora),
    });
    setSeleccionado(null);
    setMostrarForm(true);
  }

  // Cancelar un duplicado vuelve a la ficha del original, de donde se abrió.
  function cerrarForm() {
    if (duplicando) setSeleccionado(duplicando.original);
    setMostrarForm(false);
    setEditando(null);
    setDuplicando(null);
  }

  // Al crear se abre la ficha del viaje nuevo (no el listado): ahí está la
  // tarjeta "Datos administrativos" con su botón de editar, así lo
  // administrativo, que ya no se carga en el alta, queda a un clic. No bloquea
  // nada: "Volver al listado" sigue como siempre. Editar vuelve al listado.
  async function handleGuardarForm(datos) {
    if (editando) {
      await api.put(`/viajes/${editando.id}`, datos);
      mostrarMensaje(MENSAJE_EDITADO);
    } else {
      const { data } = await api.post('/viajes', datos);
      mostrarMensaje(MENSAJE_CREADO);
      irADatosAdministrativos.current = true;
      setSeleccionado(data.viaje);
    }
    setMostrarForm(false);
    setEditando(null);
    setDuplicando(null);
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
            {duplicando ? '← Volver al viaje' : '← Volver al listado'}
          </button>
          <h1>{editando ? 'Editar viaje' : duplicando ? 'Duplicar viaje' : 'Crear viaje'}</h1>
          {duplicando && <p className="viajes-aviso-duplicado">{duplicando.aviso}</p>}
          <Card className="form-card">
            <ViajeForm
              valoresIniciales={editando ? viajeAValoresForm(editando) : duplicando?.valores}
              estadoActual={editando?.estado}
              candidatosActuales={
                editando && { choferes: editando.choferesCandidatos, vehiculos: editando.vehiculosCandidatos }
              }
              onSubmit={handleGuardarForm}
              textoBoton={editando ? 'Guardar cambios' : 'Crear viaje'}
              textoEnviando={editando ? 'Guardando…' : 'Creando…'}
              onCancelar={cerrarForm}
            />
          </Card>
        </>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <ListadoToolbar
            filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos: filtrosActivos }}
            vistas={{ opciones: OPCIONES_VISTA, valor: vista, onChange: cambiarVista, ariaLabel: 'Vista de viajes' }}
            accion={puedeGestionar ? { etiqueta: 'Crear viaje', onClick: abrirNuevo } : undefined}
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

              {puedeGestionar && (
                <FormField id="administrativoPendiente" label="Administrativo">
                  <select
                    name="administrativoPendiente"
                    value={filtros.administrativoPendiente}
                    onChange={handleFiltroChange}
                  >
                    <option value="">Todos</option>
                    <option value="true">Administrativo pendiente</option>
                  </select>
                </FormField>
              )}
            </form>
          )}

          <EstadoCarga
            carga={cargaViajes}
            forma="viajes"
            que="los viajes"
            vacio={viajes.length === 0 && <div className="listado-vacio">No se encontraron viajes</div>}
          >
            <ListadoViajesPorDia
              viajes={resto}
              enCurso={enCurso}
              sinCerrar={sinCerrar}
              mostrarPendientes={puedeGestionar}
              onSeleccionar={seleccionar}
            />
          </EstadoCarga>
        </>
      )}

      {!mostrarForm && seleccionado && (() => {
        // El chofer del viaje es una persona: se compara con usuario.personaId.
        const puedeOperarEsteViaje = puedeGestionar || esChoferDelViaje(seleccionado, usuario);

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
                  <BotonComenzarViaje
                    viaje={seleccionado}
                    enCurso={viajesEnCurso}
                    onComenzar={pedirComenzar}
                    onVerViajeEnCurso={seleccionar}
                  />
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

            <DuplicarViaje viaje={seleccionado} perfil={usuario.perfil} onDuplicar={abrirDuplicar} />

            {puedeGestionar && (
              <DatosAdministrativosViaje
                ref={datosAdministrativosRef}
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
