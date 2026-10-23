import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EstadoBadge from '../components/ui/EstadoBadge';
import ControlSegmentado from '../components/ui/ControlSegmentado';
import Toast from '../components/ui/Toast';
import Alert from '../components/ui/Alert';
import Cargando from '../components/ui/Cargando';
import { DURACION_TOAST_MS } from '../constants/toast';
import ModalAsignarPlan from '../components/mantenimiento/ModalAsignarPlan';
import ModalRegistrarMantenimiento from '../components/mantenimiento/ModalRegistrarMantenimiento';
import { listarPlanesYAlertas, listarPlantillas, obtenerHistorialVehiculo } from '../services/mantenimientoApi';
import api from '../services/api';
import { formatearFechaCorta, formatearKm, formatearMonto } from '../utils/viajeFormato';
import { ordenarPorInterno } from '../utils/vehiculos';
import './Mantenimiento.css';

const CATEGORIAS_FILTRO = [
  { value: '', label: 'Todos los rubros' },
  { value: 'SERVICE_PREVENTIVO', label: 'Services preventivos' },
  { value: 'CAMBIO_ACEITE', label: 'Cambio de aceite y fluidos' },
  { value: 'CUBIERTAS', label: 'Cubiertas y neumáticos' },
  { value: 'FILTROS', label: 'Filtros' },
  { value: 'FRENOS', label: 'Frenos' },
  { value: 'ALINEACION_BALANCEO', label: 'Alineación y balanceo' },
  { value: 'BATERIA', label: 'Batería y electricidad' },
  { value: 'MECANICA_GENERAL', label: 'Mecánica general' },
  { value: 'OTRO', label: 'Otros' },
];

function Mantenimiento() {
  const [vista, setVista] = useState('planes'); // 'planes' | 'historial'
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  const [planes, setPlanes] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);

  // Filtros vista Planes
  const [busquedaPlanes, setBusquedaPlanes] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);

  // Filtros vista Historial
  const [vehiculoFiltroHistorial, setVehiculoFiltroHistorial] = useState('');
  const [categoriaFiltroHistorial, setCategoriaFiltroHistorial] = useState('');
  const [historialItems, setHistorialItems] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Modales
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [modalRegistroAbierto, setModalRegistroAbierto] = useState(false);
  const [vehiculoSeleccionadoModal, setVehiculoSeleccionadoModal] = useState(null);
  const [esPreventivoModal, setEsPreventivoModal] = useState(false);

  const [toast, setToast] = useState('');

  // El Toast no se oculta solo: lo hace quien lo monta.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const cargarDatosPrincipales = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [resPlanes, resPlantillas, resVehiculos] = await Promise.all([
        listarPlanesYAlertas({ soloAlertas: false }),
        listarPlantillas(),
        api.get('/vehiculos'),
      ]);

      setPlanes(resPlanes.data?.planes || []);
      setPlantillas(resPlantillas.data?.plantillas || []);

      const vehiculosOrdenados = ordenarPorInterno(
        (resVehiculos.data?.vehiculos || []).filter((v) => v.estadoVehiculo?.descripcion !== 'DADO_DE_BAJA')
      );
      setVehiculos(vehiculosOrdenados);
    } catch (err) {
      setErrorCarga('No se pudieron cargar los datos de mantenimiento.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatosPrincipales();
  }, [cargarDatosPrincipales]);

  // Cargar historial cuando se selecciona un vehículo o cambia el filtro de categoría
  const cargarHistorial = useCallback(async () => {
    if (!vehiculoFiltroHistorial) {
      setHistorialItems([]);
      return;
    }
    setCargandoHistorial(true);
    try {
      const { data } = await obtenerHistorialVehiculo(vehiculoFiltroHistorial, {
        categoria: categoriaFiltroHistorial,
      });
      setHistorialItems(data?.historial || []);
    } catch (err) {
      setToast({ mensaje: 'No se pudo cargar el historial del vehículo.', tipo: 'error' });
    } finally {
      setCargandoHistorial(false);
    }
  }, [vehiculoFiltroHistorial, categoriaFiltroHistorial]);

  useEffect(() => {
    if (vista === 'historial') {
      cargarHistorial();
    }
  }, [vista, cargarHistorial]);

  // Cantidad de alertas activas (Vencidos + Próximos)
  const cantidadAlertas = useMemo(() => {
    return planes.filter((p) => p.estadoMantenimiento === 'VENCIDO' || p.estadoMantenimiento === 'PROXIMO').length;
  }, [planes]);

  // Opciones del control segmentado
  const opcionesSegmentado = useMemo(
    () => [
      {
        valor: 'planes',
        etiqueta: 'Planes y Alertas de Service',
        cantidad: cantidadAlertas > 0 ? cantidadAlertas : null,
      },
      {
        valor: 'historial',
        etiqueta: 'Ficha Médica e Historial',
      },
    ],
    [cantidadAlertas]
  );

  // Filtrado de planes
  const planesFiltrados = useMemo(() => {
    let resultado = [...planes];
    if (soloAlertas) {
      resultado = resultado.filter((p) => p.estadoMantenimiento === 'VENCIDO' || p.estadoMantenimiento === 'PROXIMO');
    }
    if (busquedaPlanes.trim()) {
      const q = busquedaPlanes.trim().toLowerCase();
      resultado = resultado.filter((p) => {
        const v = p.vehiculo;
        if (!v) return false;
        return (
          v.dominio?.toLowerCase().includes(q) ||
          v.numeroInterno?.toLowerCase().includes(q) ||
          (v.marca && v.marca.toLowerCase().includes(q)) ||
          (v.modelo && v.modelo.toLowerCase().includes(q))
        );
      });
    }
    return resultado;
  }, [planes, soloAlertas, busquedaPlanes]);

  function handleAbrirNuevoPlan(v = null) {
    setVehiculoSeleccionadoModal(v);
    setModalPlanAbierto(true);
  }

  function handleAbrirRegistroService(v = null, esPreventivo = true) {
    setVehiculoSeleccionadoModal(v);
    setEsPreventivoModal(esPreventivo);
    setModalRegistroAbierto(true);
  }

  function handleVerHistorialVehiculo(vehiculoId) {
    if (!vehiculoId) return;
    setVehiculoFiltroHistorial(String(vehiculoId));
    setVista('historial');
  }

  function handleGuardarPlan() {
    setModalPlanAbierto(false);
    setToast('Plan de mantenimiento asignado con éxito.');
    cargarDatosPrincipales();
  }

  function handleGuardarMantenimiento() {
    setModalRegistroAbierto(false);
    setToast('Intervención mecánica registrada con éxito.');
    cargarDatosPrincipales();
    if (vista === 'historial') {
      cargarHistorial();
    }
  }

  return (
    <Layout>
      <div className="mantenimiento-page">
        <h1 className="sr-only">Mantenimiento de Vehículos</h1>

        {/* Cabecera con selector de vista y botón principal */}
        <header className="mantenimiento-header">
          <ControlSegmentado
            opciones={opcionesSegmentado}
            valor={vista}
            onChange={setVista}
            ariaLabel="Vistas del módulo de mantenimiento"
          />

          <div className="mantenimiento-header-actions">
            {vista === 'planes' ? (
              <Button variant="primary" onClick={() => handleAbrirNuevoPlan(null)}>
                + Asignar plan a vehículo
              </Button>
            ) : (
              <Button variant="primary" onClick={() => handleAbrirRegistroService(null, false)}>
                + Registrar mantenimiento
              </Button>
            )}
          </div>
        </header>

        {/* Resumen superior de las 4 plantillas fijas de Adri-Mar */}
        <section className="plantillas-fijas-bar" aria-label="Plantillas fijas de service">
          <div className="plantillas-fijas-titulo">Plantillas oficiales de service preventivo:</div>
          <div className="plantillas-fijas-grid">
            <div className="plantilla-chip">
              <span className="plantilla-tipo">Colectivo</span>
              <strong className="num">Cada 20.000 km</strong>
            </div>
            <div className="plantilla-chip">
              <span className="plantilla-tipo">Minibús</span>
              <strong className="num">Cada 20.000 km</strong>
            </div>
            <div className="plantilla-chip">
              <span className="plantilla-tipo">Trafic</span>
              <strong className="num">Cada 15.000 km</strong>
            </div>
            <div className="plantilla-chip">
              <span className="plantilla-tipo">Utilitario</span>
              <strong className="num">Cada 10.000 km</strong>
            </div>
          </div>
        </section>

        {cargando && <Cargando forma="tarjetas" cantidad={3} />}
        {errorCarga && <Alert variant="error">{errorCarga}</Alert>}

        {/* ============================================================ */}
        {/* VISTA 1: PLANES Y ALERTAS DE SERVICE                         */}
        {/* ============================================================ */}
        {!cargando && !errorCarga && vista === 'planes' && (
          <div className="seccion-planes">
            {/* Barra de búsqueda y filtros */}
            <div className="toolbar-planes">
              <div className="buscador-mantenimiento">
                <input
                  type="search"
                  placeholder="Buscar por interno, patente o modelo…"
                  value={busquedaPlanes}
                  onChange={(e) => setBusquedaPlanes(e.target.value)}
                />
              </div>

              <div className="filtro-alertas-toggle">
                <label className="checkbox-filtro-alertas">
                  <input
                    type="checkbox"
                    checked={soloAlertas}
                    onChange={(e) => setSoloAlertas(e.target.checked)}
                  />
                  <span>Solo alertas ({cantidadAlertas})</span>
                </label>
              </div>
            </div>

            {/* Listado de tarjetas de vehículos con planes */}
            {planesFiltrados.length === 0 ? (
              <div className="estado-vacio-mantenimiento">
                <p>No se encontraron vehículos que coincidan con la búsqueda o filtro.</p>
              </div>
            ) : (
              <div className="cards-mantenimiento-stack">
                {planesFiltrados.map((p) => {
                  const v = p.vehiculo;
                  const estadoLimpio = (p.estadoMantenimiento || 'al_dia').toLowerCase();
                  const tono =
                    p.estadoMantenimiento === 'VENCIDO'
                      ? 'error'
                      : p.estadoMantenimiento === 'PROXIMO'
                      ? 'warning'
                      : 'success';

                  const badgeTexto =
                    p.estadoMantenimiento === 'VENCIDO'
                      ? `Vencido hace ${formatearKm(p.kmExcedidos)} km`
                      : p.estadoMantenimiento === 'PROXIMO'
                      ? `Próximo (faltan ${formatearKm(p.kmRestantes)} km)`
                      : `Al día (faltan ${formatearKm(p.kmRestantes)} km)`;

                  return (
                    <Card key={p.id} className={`card-mantenimiento card-mantenimiento-${estadoLimpio}`}>
                      <div className="card-mantenimiento-top">
                        <div className="card-mantenimiento-vehiculo">
                          <span className="card-mantenimiento-interno">Interno {v?.numeroInterno || 'S/N'}</span>
                          <span className="card-mantenimiento-sep">·</span>
                          <span className="patente">{v?.dominio || 'NO REGISTRADO'}</span>
                          <span className="card-mantenimiento-sep">·</span>
                          <span className="card-mantenimiento-modelo">
                            {v?.marca} {v?.modelo} ({v?.tipoVehiculo || 'Vehículo'})
                          </span>
                        </div>
                        <EstadoBadge tono={tono}>{badgeTexto}</EstadoBadge>
                      </div>

                      <div className="card-mantenimiento-metrics">
                        <div className="metric-box">
                          <span className="metric-label">Odómetro actual</span>
                          <span className="metric-valor num">{formatearKm(v?.kilometraje || 0)} km</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-label">Último service</span>
                          <span className="metric-valor num">{formatearKm(p.kmUltimoService)} km</span>
                        </div>
                        <div className="metric-box highlight-proximo">
                          <span className="metric-label">Próximo service</span>
                          <span className="metric-valor num">{formatearKm(p.kmProximoService)} km</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-label">Plantilla fija</span>
                          <span className="metric-valor">{p.plantilla?.nombre || 'General'}</span>
                        </div>
                      </div>

                      <div className="card-mantenimiento-actions">
                        <Button
                          variant="primary"
                          onClick={() => handleAbrirRegistroService(v, true)}
                        >
                          Registrar service
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleVerHistorialVehiculo(v?.id)}
                        >
                          Ver historial
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* VISTA 2: FICHA MÉDICA E HISTORIAL                            */}
        {/* ============================================================ */}
        {!cargando && !errorCarga && vista === 'historial' && (
          <div className="seccion-historial">
            <div className="toolbar-historial">
              <div className="filtro-campo">
                <label htmlFor="select-vehiculo-historial" className="filtro-label">
                  Vehículo:
                </label>
                <select
                  id="select-vehiculo-historial"
                  value={vehiculoFiltroHistorial}
                  onChange={(e) => setVehiculoFiltroHistorial(e.target.value)}
                >
                  <option value="">Seleccionar vehículo para ver su historial…</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      Interno {v.numeroInterno} — {v.dominio} ({v.marca} {v.modelo})
                    </option>
                  ))}
                </select>
              </div>

              {vehiculoFiltroHistorial && (
                <div className="filtro-campo">
                  <label htmlFor="select-categoria-historial" className="filtro-label">
                    Rubro / Tipo de trabajo:
                  </label>
                  <select
                    id="select-categoria-historial"
                    value={categoriaFiltroHistorial}
                    onChange={(e) => setCategoriaFiltroHistorial(e.target.value)}
                  >
                    {CATEGORIAS_FILTRO.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {cargandoHistorial && <Cargando forma="filas" cantidad={2} />}

            {!cargandoHistorial && !vehiculoFiltroHistorial && (
              <div className="estado-vacio-mantenimiento">
                <p>Elegí un vehículo arriba para consultar su historia clínica completa e intervenciones mecánicas.</p>
              </div>
            )}

            {!cargandoHistorial && vehiculoFiltroHistorial && historialItems.length === 0 && (
              <div className="estado-vacio-mantenimiento">
                <p>Este vehículo no tiene intervenciones registradas para el filtro seleccionado.</p>
                <Button
                  variant="primary"
                  onClick={() =>
                    handleAbrirRegistroService(
                      vehiculos.find((v) => String(v.id) === String(vehiculoFiltroHistorial)),
                      false
                    )
                  }
                >
                  + Cargar primera intervención
                </Button>
              </div>
            )}

            {!cargandoHistorial && historialItems.length > 0 && (
              <div className="historial-stack">
                <div className="historial-total-count">
                  {historialItems.length} {historialItems.length === 1 ? 'intervención registrada' : 'intervenciones registradas'}
                </div>

                {historialItems.map((item) => (
                  <Card key={item.id} className="card-intervencion">
                    <div className="intervencion-top">
                      <div className="intervencion-categoria-titulo">
                        <strong>
                          {CATEGORIAS_FILTRO.find((c) => c.value === item.categoria)?.label || item.categoria}
                        </strong>
                      </div>
                      <EstadoBadge tono={item.esServicePreventivo ? 'brand' : 'neutral'}>
                        {item.esServicePreventivo ? 'Service Preventivo' : 'Particular'}
                      </EstadoBadge>
                    </div>

                    <div className="intervencion-metrics">
                      <div className="metric-box">
                        <span className="metric-label">Fecha realizada</span>
                        <span className="metric-valor">{formatearFechaCorta(item.fecha)}</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">Odómetro</span>
                        <span className="metric-valor num">{formatearKm(item.kilometraje)} km</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">Taller / Responsable</span>
                        <span className="metric-valor">{item.tallerMecanico || 'No registrado'}</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">Costo total</span>
                        <span className="metric-valor num">{item.costo ? formatearMonto(item.costo) : 'No registrado'}</span>
                      </div>
                    </div>

                    <div className="intervencion-detalles">
                      <div className="intervencion-detalle-row">
                        <span className="detalle-tag">Tareas:</span>
                        <span className="detalle-texto">{item.descripcion}</span>
                      </div>
                      {item.repuestos && (
                        <div className="intervencion-detalle-row">
                          <span className="detalle-tag">Repuestos:</span>
                          <span className="detalle-texto">{item.repuestos}</span>
                        </div>
                      )}
                      {item.observaciones && (
                        <div className="intervencion-detalle-row">
                          <span className="detalle-tag">Observaciones:</span>
                          <span className="detalle-texto">{item.observaciones}</span>
                        </div>
                      )}
                      <div className="intervencion-detalle-pie">
                        Registrado por: <span>{item.usuario || 'Sistema'}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modales */}
        <ModalAsignarPlan
          abierto={modalPlanAbierto}
          alCerrar={() => setModalPlanAbierto(false)}
          alGuardar={handleGuardarPlan}
          vehiculos={vehiculos}
          plantillas={plantillas}
          vehiculoPreseleccionado={vehiculoSeleccionadoModal}
        />

        <ModalRegistrarMantenimiento
          abierto={modalRegistroAbierto}
          alCerrar={() => setModalRegistroAbierto(false)}
          alGuardar={handleGuardarMantenimiento}
          vehiculos={vehiculos}
          vehiculoPreseleccionado={vehiculoSeleccionadoModal}
          esPreventivoPorDefecto={esPreventivoModal}
        />

        {toast && <Toast>{toast}</Toast>}
      </div>
    </Layout>
  );
}

export default Mantenimiento;
