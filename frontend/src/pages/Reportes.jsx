import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import IconoVehiculo from '../components/IconoVehiculo';
import { ListadoCard, ListadoHeader, ListadoToolbar } from '../components/Listado';
import FichaVehiculoReporte from '../components/reportes/FichaVehiculoReporte';
import GraficosReporte from '../components/reportes/GraficosReporte';
import AyudaTooltip from '../components/ui/AyudaTooltip';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ControlSegmentado from '../components/ui/ControlSegmentado';
import EstadoBadge from '../components/ui/EstadoBadge';
import EstadoCarga from '../components/ui/EstadoCarga';
import FormField from '../components/ui/FormField';
import Switch from '../components/ui/Switch';
import Toast from '../components/ui/Toast';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import { DURACION_TOAST_MS } from '../constants/toast';
import { useCarga } from '../hooks/useCarga';
import { obtenerReporteKmPorVehiculo } from '../services/reportesApi';
import {
  AYUDA_DESVIO,
  ORDENES_REPORTE_KM,
  detectarPresetPeriodo,
  filtrarVehiculosReporte,
  formatearDesvio,
  formatearPorcentaje,
  formatearRangoPeriodo,
  ordenarVehiculosReporte,
  rangoMesActual,
  rangoSemanaActual,
  rangoSemanaAnterior,
  validarRangoPeriodo,
} from '../utils/reporteKm';
import { formatearFechaCorta, formatearKm } from '../utils/viajeFormato';
import './Reportes.css';

const ICONO_CALENDARIO = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const PRESETS_PERIODO = [
  { valor: 'semana_actual', etiqueta: 'Esta semana' },
  { valor: 'semana_anterior', etiqueta: 'Semana pasada' },
  { valor: 'mes_actual', etiqueta: 'Este mes' },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];

function idDeUrl(valor) {
  const id = Number.parseInt(valor, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function periodoDesdeUrl(searchParams) {
  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';
  if (desde && hasta && validarRangoPeriodo(desde, hasta) === '') {
    return { desde, hasta };
  }
  return rangoSemanaActual();
}

function tiposDeLaFlota(items) {
  const porId = new Map(items.map(({ vehiculo }) => [vehiculo.tipoVehiculoId, vehiculo.tipoVehiculo]));
  return [...porId]
    .map(([id, descripcion]) => ({ id, descripcion }))
    .sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion), 'es'));
}

function construirTextoPieIzquierda(item) {
  const partes = [item.vehiculo.tipoVehiculo];
  if (item.desvioPorcentaje != null) {
    const signo = item.desvioPorcentaje > 0 ? '+' : item.desvioPorcentaje < 0 ? '-' : '';
    partes.push(`${signo}${formatearPorcentaje(Math.abs(item.desvioPorcentaje))} % vs. estimado`);
  }
  return partes.join(' · ');
}

function TarjetaVehiculoReporte({ item, onClick }) {
  const { vehiculo } = item;
  const estado = ESTADOS_VEHICULO[vehiculo.estado] ?? { label: vehiculo.estado, tono: 'neutral' };
  const viajesTexto = item.cantidadViajes === 1 ? '1 viaje' : `${item.cantidadViajes} viajes`;

  let detalle = 'Sin viajes finalizados en este período';
  if (item.cantidadViajes > 0) {
    detalle =
      item.promedioKmPorViaje != null
        ? `Promedio ${formatearKm(item.promedioKmPorViaje)} km/viaje`
        : 'Sin lecturas completas de odómetro';
  }

  return (
    <ListadoCard
      marca={<IconoVehiculo tipo={vehiculo.tipoVehiculo} />}
      titulo={
        <>
          {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
        </>
      }
      estado={
        <EstadoBadge tono={estado.tono} size="sm">
          {estado.label}
        </EstadoBadge>
      }
      bajada={`${vehiculo.marca} ${vehiculo.modelo}`}
      sub={<span className="num">{`${formatearKm(item.kmRecorridos)} km · ${viajesTexto}`}</span>}
      detalle={detalle}
      pie={[construirTextoPieIzquierda(item), `Odómetro: ${formatearKm(vehiculo.kilometraje)} km`]}
      onClick={onClick}
    />
  );
}

function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const periodoActivo = useMemo(() => periodoDesdeUrl(searchParams), [searchParams]);
  const vehiculoAbierto = idDeUrl(searchParams.get('vehiculoId'));

  // Borrador mientras el usuario edita fechas personalizadas con rango inválido o pendiente.
  const [borradorRango, setBorradorRango] = useState(null);
  const [modoPersonalizado, setModoPersonalizado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [tipoVehiculoId, setTipoVehiculoId] = useState('');
  const [orden, setOrden] = useState('km_desc');
  const [incluirSinViajes, setIncluirSinViajes] = useState(true);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [toast, setToast] = useState(null);
  const [fechaEmision] = useState(() => new Date());

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const pedirReporte = useCallback(
    () => obtenerReporteKmPorVehiculo({ desde: periodoActivo.desde, hasta: periodoActivo.hasta }).then(({ data }) => data),
    [periodoActivo.desde, periodoActivo.hasta]
  );
  const carga = useCarga(pedirReporte);
  const reporte = carga.datos;

  const items = useMemo(() => reporte?.vehiculos ?? [], [reporte]);
  const tiposVehiculo = useMemo(() => tiposDeLaFlota(items), [items]);
  const visibles = useMemo(
    () => ordenarVehiculosReporte(filtrarVehiculosReporte(items, { busqueda, tipoVehiculoId, incluirSinViajes }), orden),
    [items, busqueda, tipoVehiculoId, incluirSinViajes, orden]
  );

  const itemAbierto = vehiculoAbierto ? items.find((item) => item.vehiculo.id === vehiculoAbierto) : null;

  const desdeInput = borradorRango ? borradorRango.desde : periodoActivo.desde;
  const hastaInput = borradorRango ? borradorRango.hasta : periodoActivo.hasta;
  const errorRango = borradorRango ? validarRangoPeriodo(borradorRango.desde, borradorRango.hasta) : '';
  const presetActivo =
    modoPersonalizado || borradorRango?.modoPersonalizado
      ? 'personalizado'
      : detectarPresetPeriodo(periodoActivo.desde, periodoActivo.hasta);

  const activos = [tipoVehiculoId, !incluirSinViajes].filter(Boolean).length;
  const esFiltrado = Boolean(busqueda.trim() || tipoVehiculoId || !incluirSinViajes);
  const puedeExportar = Boolean(reporte) && !carga.cargando && !carga.error && visibles.length > 0;
  const rangoTexto = formatearRangoPeriodo(periodoActivo.desde, periodoActivo.hasta);

  function aplicarPeriodoEnUrl(nuevoPeriodo) {
    const semanaActual = rangoSemanaActual();
    if (nuevoPeriodo.desde === semanaActual.desde && nuevoPeriodo.hasta === semanaActual.hasta) {
      setSearchParams({});
    } else {
      setSearchParams({ desde: nuevoPeriodo.desde, hasta: nuevoPeriodo.hasta });
    }
  }

  function seleccionarPreset(valor) {
    if (valor === 'personalizado') {
      setModoPersonalizado(true);
      setBorradorRango(null);
      return;
    }
    const rangos = {
      semana_actual: rangoSemanaActual,
      semana_anterior: rangoSemanaAnterior,
      mes_actual: rangoMesActual,
    };
    const nuevo = (rangos[valor] ?? rangoSemanaActual)();
    setModoPersonalizado(false);
    setBorradorRango(null);
    aplicarPeriodoEnUrl(nuevo);
  }

  function cambiarFecha(campo, valor) {
    const siguiente = {
      desde: campo === 'desde' ? valor : desdeInput,
      hasta: campo === 'hasta' ? valor : hastaInput,
      modoPersonalizado: true,
    };
    if (validarRangoPeriodo(siguiente.desde, siguiente.hasta) === '') {
      setBorradorRango(null);
      aplicarPeriodoEnUrl({ desde: siguiente.desde, hasta: siguiente.hasta });
    } else {
      setBorradorRango(siguiente);
    }
  }

  function abrirDetalle(item) {
    window.scrollTo(0, 0);
    const params = {
      desde: periodoActivo.desde,
      hasta: periodoActivo.hasta,
      vehiculoId: String(item.vehiculo.id),
    };
    setSearchParams(params, { state: { panelDesdeLista: true } });
  }

  const cerrarDetalle = useCallback(() => {
    window.scrollTo(0, 0);
    if (location.state?.panelDesdeLista) {
      navigate(-1);
    } else {
      const semanaActual = rangoSemanaActual();
      if (periodoActivo.desde === semanaActual.desde && periodoActivo.hasta === semanaActual.hasta) {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ desde: periodoActivo.desde, hasta: periodoActivo.hasta }, { replace: true });
      }
    }
  }, [location.state, navigate, periodoActivo.desde, periodoActivo.hasta, setSearchParams]);

  function limpiarFiltros() {
    setBusqueda('');
    setTipoVehiculoId('');
    setIncluirSinViajes(true);
  }

  async function handleDescargarPdf() {
    if (!reporte || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      const { descargarPdfReporteKm } = await import('../components/reportePdf/generarPdfReporteKm');
      await descargarPdfReporteKm(reporte, visibles, { esFiltrado });
      setToast('Reporte descargado en PDF.');
    } catch {
      setToast('No se pudo generar el PDF. Intentá de nuevo.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  const totales = reporte?.totales;

  return (
    <Layout>
      {itemAbierto ? (
        <FichaVehiculoReporte item={itemAbierto} periodo={reporte.periodo} onVolver={cerrarDetalle} />
      ) : (
        <>
          <ListadoHeader titulo="Reportes" />

          <div className="reporte-encabezado-impresion">
            <p className="reporte-encabezado-impresion-marca">Adri-Mar Gestión Online</p>
            <h2>Reporte de km y viajes por vehículo</h2>
            <p className="reporte-encabezado-impresion-meta">
              Período: {rangoTexto} · Emitido: {formatearFechaCorta(fechaEmision)}
            </p>
          </div>

          <Card className="reporte-controles">
            <div className="reporte-controles-fila">
              <div className="reporte-controles-izq">
                <ControlSegmentado
                  opciones={PRESETS_PERIODO}
                  valor={presetActivo}
                  onChange={seleccionarPreset}
                  ariaLabel="Período del reporte"
                />

                {presetActivo !== 'personalizado' && (
                  <span className="reporte-periodo-rango">
                    {ICONO_CALENDARIO}
                    <span>{rangoTexto}</span>
                  </span>
                )}
              </div>

              <div className="reporte-acciones">
                <Button variant="primary" loading={generandoPdf} disabled={!puedeExportar} onClick={handleDescargarPdf}>
                  {generandoPdf ? 'Generando PDF…' : 'Descargar PDF'}
                </Button>
              </div>
            </div>

            {presetActivo === 'personalizado' && (
              <div className="form-grid reporte-fechas-grid">
                <FormField id="reporte-desde" label="Desde" error={errorRango || undefined}>
                  <input type="date" value={desdeInput} onChange={(e) => cambiarFecha('desde', e.target.value)} />
                </FormField>
                <FormField id="reporte-hasta" label="Hasta">
                  <input type="date" value={hastaInput} onChange={(e) => cambiarFecha('hasta', e.target.value)} />
                </FormField>
              </div>
            )}
          </Card>

          <EstadoCarga
            carga={carga}
            forma="documentacion"
            que="el reporte de kilómetros"
            vacio={
              reporte &&
              items.length === 0 && (
                <div className="listado-vacio">No hay vehículos registrados en la flota para este período.</div>
              )
            }
          >
            {totales && (
              <>
                <Card className="reporte-kpis-card">
                  <div className="reporte-kpis">
                    <div className="reporte-kpi">
                      <span className="reporte-kpi-etiqueta">Km recorridos</span>
                      <span className="reporte-kpi-valor num">{`${formatearKm(totales.kmRecorridos)} km`}</span>
                      <span className="reporte-kpi-sub">{rangoTexto}</span>
                    </div>

                    <div className="reporte-kpi">
                      <span className="reporte-kpi-etiqueta">Viajes finalizados</span>
                      <span className="reporte-kpi-valor num">{String(totales.cantidadViajes)}</span>
                      <span className="reporte-kpi-sub num">
                        {totales.promedioKmPorViaje != null
                          ? `Promedio: ${formatearKm(totales.promedioKmPorViaje)} km/viaje`
                          : 'Sin viajes con odómetro'}
                      </span>
                    </div>

                    <div className="reporte-kpi">
                      <span className="reporte-kpi-etiqueta">Flota utilizada</span>
                      <span className="reporte-kpi-valor num">
                        {totales.vehiculosConViajes} de {totales.vehiculosActivos}
                      </span>
                      <span className="reporte-kpi-sub">vehículos activos con viajes</span>
                    </div>

                    <div className="reporte-kpi">
                      <span className="reporte-kpi-etiqueta reporte-kpi-etiqueta-fila">
                        Desvío vs. estimado
                        <AyudaTooltip texto={AYUDA_DESVIO} />
                      </span>
                      <span className="reporte-kpi-valor num">
                        {formatearDesvio(totales.desvioPorcentaje, totales.desvioKm)}
                      </span>
                      <span className="reporte-kpi-sub">
                        {totales.kmEstimadosComparables > 0
                          ? `Sobre ${formatearKm(totales.kmEstimadosComparables)} km estimados`
                          : 'Sin km estimados para comparar'}
                      </span>
                    </div>
                  </div>

                  {totales.viajesSinOdometro > 0 && (
                    <p className="reporte-nota-odometro">
                      {totales.viajesSinOdometro === 1
                        ? '1 viaje finalizado en el período no tiene lecturas completas de odómetro y no suma kilómetros reales.'
                        : `${totales.viajesSinOdometro} viajes finalizados en el período no tienen lecturas completas de odómetro y no suman kilómetros reales.`}
                    </p>
                  )}
                </Card>

                <GraficosReporte reporte={reporte} />

                <ListadoToolbar
                  busqueda={{
                    valor: busqueda,
                    onChange: setBusqueda,
                    placeholder: 'Buscar por interno, dominio, marca o modelo',
                  }}
                  filtros={{
                    abierto: mostrarFiltros,
                    onToggle: () => setMostrarFiltros((abierto) => !abierto),
                    activos,
                  }}
                />

                {mostrarFiltros && (
                  <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
                    <FormField id="reporte-filtro-tipo" label="Tipo de vehículo">
                      <select value={tipoVehiculoId} onChange={(e) => setTipoVehiculoId(e.target.value)}>
                        <option value="">Todos</option>
                        {tiposVehiculo.map((tipo) => (
                          <option key={tipo.id} value={tipo.id}>
                            {tipo.descripcion}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField id="reporte-filtro-orden" label="Ordenar por">
                      <select value={orden} onChange={(e) => setOrden(e.target.value)}>
                        {ORDENES_REPORTE_KM.map((opcion) => (
                          <option key={opcion.value} value={opcion.value}>
                            {opcion.label}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <div className="form-field switch-field reportes-filtro-switch">
                      <label className="switch-field-label" htmlFor="reporte-filtro-sin-viajes">
                        <Switch
                          id="reporte-filtro-sin-viajes"
                          checked={incluirSinViajes}
                          onChange={(e) => setIncluirSinViajes(e.target.checked)}
                        />
                        Mostrar vehículos sin viajes
                      </label>
                    </div>
                  </form>
                )}

                <p className="reporte-resumen">
                  {`Mostrando ${visibles.length} de ${items.length} vehículos · ${rangoTexto}`}
                </p>

                {visibles.length === 0 ? (
                  <div className="listado-vacio">
                    <p>No hay vehículos con esos filtros en este período.</p>
                    {esFiltrado && (
                      <div className="reporte-vacio-accion">
                        <Button variant="secondary" onClick={limpiarFiltros}>
                          Limpiar filtros
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="listado-cards">
                    {visibles.map((item) => (
                      <TarjetaVehiculoReporte key={item.vehiculo.id} item={item} onClick={() => abrirDetalle(item)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </EstadoCarga>
        </>
      )}

      {toast && <Toast>{toast}</Toast>}
    </Layout>
  );
}

export default Reportes;
