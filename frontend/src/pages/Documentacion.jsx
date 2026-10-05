import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import Alert from '../components/ui/Alert';
import EstadoDot from '../components/ui/EstadoDot';
import ModalSubirDocumento from '../components/documentacion/ModalSubirDocumento';
import ModalVisorPdf from '../components/documentacion/ModalVisorPdf';
import ModalHistorialDocumento from '../components/documentacion/ModalHistorialDocumento';
import { useAuth } from '../context/AuthContext';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import api from '../services/api';
import './Documentacion.css';

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

const ICONOS_DOCUMENTO = {
  POLIZA_SEGURO: '🛡️',
  CERT_COBERTURA: '📜',
  PAGO_SEGURO: '💳',
  ITV: '🔧',
  MATAFUEGOS: '🧯',
  TITULO_VEHICULO: '📑',
  CEDULA_IDENTIFICACION: '🪪',
  ALTA_TRANSPORTE: '🏛️',
  DEFAULT: '📄',
};

function ordenarPorInterno(vehiculos) {
  return [...vehiculos].sort(
    (a, b) => (parseInt(a.numeroInterno, 10) || 0) - (parseInt(b.numeroInterno, 10) || 0)
  );
}

function Documentacion() {
  const { usuario } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR.includes(usuario.perfil);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Estado general
  const [vehiculos, setVehiculos] = useState([]);
  const [cargandoVehiculos, setCargandoVehiculos] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState(null);

  // Documentos del vehículo activo
  const [carpetaData, setCarpetaData] = useState(null);
  const [cargandoCarpeta, setCargandoCarpeta] = useState(false);
  const [errorCarpeta, setErrorCarpeta] = useState('');
  const [toast, setToast] = useState('');

  // Modales
  const [modalSubir, setModalSubir] = useState({ open: false, tipo: null, docActual: null });
  const [modalVisor, setModalVisor] = useState({ open: false, documento: null });
  const [modalHistorial, setModalHistorial] = useState({ open: false, tipo: null });

  // Cargar lista de vehículos
  useEffect(() => {
    setCargandoVehiculos(true);
    api
      .get('/vehiculos')
      .then(({ data }) => {
        const ordenados = ordenarPorInterno(data.vehiculos || []);
        setVehiculos(ordenados);

        const vIdParam = searchParams.get('vehiculoId');
        if (vIdParam) {
          const encontrado = ordenados.find((v) => v.id === parseInt(vIdParam, 10));
          if (encontrado) {
            setVehiculoSeleccionado(encontrado);
            return;
          }
        }

        // Por defecto seleccionar el primero
        if (ordenados.length > 0) {
          setVehiculoSeleccionado((prev) => prev || ordenados[0]);
        }
      })
      .catch((err) => {
        console.error('Error al cargar vehículos:', err);
      })
      .finally(() => setCargandoVehiculos(false));
  }, [searchParams]);

  // Cargar carpeta de documentación del vehículo seleccionado
  const cargarCarpeta = useCallback((vehiculoId) => {
    if (!vehiculoId) return;
    setCargandoCarpeta(true);
    setErrorCarpeta('');
    api
      .get(`/documentos/vehiculos/${vehiculoId}`)
      .then(({ data }) => {
        setCarpetaData(data);
      })
      .catch((err) => {
        setErrorCarpeta(err.response?.data?.error || 'Error al cargar la documentación.');
      })
      .finally(() => setCargandoCarpeta(false));
  }, []);

  useEffect(() => {
    if (vehiculoSeleccionado) {
      cargarCarpeta(vehiculoSeleccionado.id);
    }
  }, [vehiculoSeleccionado, cargarCarpeta]);

  function handleSelectVehiculo(v) {
    setVehiculoSeleccionado(v);
    setSearchParams({ vehiculoId: v.id });
  }

  function abrirSubir(tipo, docActual = null) {
    setModalSubir({
      open: true,
      tipo,
      docActual,
    });
  }

  function abrirVisor(documento) {
    setModalVisor({
      open: true,
      documento,
    });
  }

  function abrirHistorial(tipo) {
    setModalHistorial({
      open: true,
      tipo,
    });
  }

  function handleSuccessDoc() {
    setToast('Documento guardado y digitalizado exitosamente.');
    if (vehiculoSeleccionado) {
      cargarCarpeta(vehiculoSeleccionado.id);
    }
  }

  // Filtrado de lista lateral
  const vehiculosFiltrados = vehiculos.filter((v) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      v.numeroInterno.toLowerCase().includes(q) ||
      v.dominio.toLowerCase().includes(q) ||
      v.marca.toLowerCase().includes(q) ||
      v.modelo.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="doc-page-container">
        {/* Cabecera Principal */}
        <div className="doc-page-header">
          <div>
            <h1 className="doc-page-title">Gestión de Documentación</h1>
            <p className="doc-page-description">
              Repositorio centralizado de documentos legales, habilitaciones y pólizas digitalizadas.
            </p>
          </div>

          {/* Selector de Pestañas (Vehículos / Choferes) */}
          <div className="doc-tabs-container" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected="true"
              className="doc-tab-btn is-active"
            >
              🚍 Vehículos de la Flota
            </button>
            <button
              type="button"
              role="tab"
              aria-selected="false"
              className="doc-tab-btn is-disabled"
              title="Disponible en el módulo de Choferes"
            >
              👤 Choferes
              <span className="doc-tab-badge">Próximamente</span>
            </button>
          </div>
        </div>

        {cargandoVehiculos ? (
          <div className="doc-loading-state">
            <Spinner />
            <p>Cargando unidades de la flota...</p>
          </div>
        ) : (
          <div className="doc-layout-grid">
            {/* Columna Izquierda: Selector de Vehículos */}
            <aside className="doc-sidebar-vehiculos">
              <div className="doc-search-box">
                <input
                  type="text"
                  placeholder="Buscar interno o patente..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="doc-search-input"
                />
              </div>

              <div className="doc-vehiculos-list">
                {vehiculosFiltrados.length === 0 ? (
                  <p className="doc-no-results">No se encontraron vehículos.</p>
                ) : (
                  vehiculosFiltrados.map((v) => {
                    const isSelected = vehiculoSeleccionado?.id === v.id;
                    return (
                      <button
                        type="button"
                        key={v.id}
                        className={`doc-vehiculo-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleSelectVehiculo(v)}
                      >
                        <div className="doc-vehiculo-item-header">
                          <span className="doc-vehiculo-badge-interno">Int. {v.numeroInterno}</span>
                          <span className="doc-vehiculo-dominio">{v.dominio}</span>
                        </div>
                        <div className="doc-vehiculo-item-body">
                          <span className="doc-vehiculo-modelo">
                            {v.marca} {v.modelo}
                          </span>
                          <EstadoDot
                            color={ESTADOS_VEHICULO[v.estadoVehiculo?.descripcion || 'OPERATIVO']?.dot}
                          >
                            {ESTADOS_VEHICULO[v.estadoVehiculo?.descripcion || 'OPERATIVO']?.label}
                          </EstadoDot>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Columna Derecha: Carpeta Digital de la Unidad */}
            <main className="doc-content-area">
              {!vehiculoSeleccionado ? (
                <div className="doc-empty-selection">
                  <span className="doc-empty-icon">📁</span>
                  <h3>Seleccioná un vehículo</h3>
                  <p>Elegí una unidad del listado para gestionar y consultar sus documentos.</p>
                </div>
              ) : cargandoCarpeta ? (
                <div className="doc-loading-state">
                  <Spinner />
                  <p>Cargando legajo digital de la unidad {vehiculoSeleccionado.numeroInterno}...</p>
                </div>
              ) : errorCarpeta ? (
                <Alert variant="danger">{errorCarpeta}</Alert>
              ) : carpetaData ? (
                <div className="doc-carpeta-wrapper">
                  {/* Ficha resumen de la unidad */}
                  <Card className="doc-resumen-card">
                    <div className="doc-resumen-header">
                      <div>
                        <div className="doc-unidad-title-row">
                          <h2>Unidad {vehiculoSeleccionado.numeroInterno}</h2>
                          <span className="doc-unidad-patente">{vehiculoSeleccionado.dominio}</span>
                          <EstadoDot
                            color={
                              ESTADOS_VEHICULO[vehiculoSeleccionado.estadoVehiculo?.descripcion]?.dot
                            }
                            size="md"
                          >
                            {ESTADOS_VEHICULO[vehiculoSeleccionado.estadoVehiculo?.descripcion]?.label}
                          </EstadoDot>
                        </div>
                        <p className="doc-unidad-specs">
                          {vehiculoSeleccionado.tipoVehiculo?.descripcion} • {vehiculoSeleccionado.marca}{' '}
                          {vehiculoSeleccionado.modelo} ({vehiculoSeleccionado.anio}) •{' '}
                          {vehiculoSeleccionado.kilometraje.toLocaleString()} km
                        </p>
                      </div>

                      <div className="doc-resumen-actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate('/vehiculos')}
                        >
                          Ver ficha en Flota ↗
                        </Button>
                      </div>
                    </div>

                    {/* KPIs de Documentación */}
                    <div className="doc-kpis-grid">
                      <div className="doc-kpi-item">
                        <span className="doc-kpi-value">
                          {carpetaData.resumen.totalCargados} / {carpetaData.resumen.totalRequeridos}
                        </span>
                        <span className="doc-kpi-label">Documentos cargados</span>
                      </div>

                      <div
                        className={`doc-kpi-item ${carpetaData.resumen.totalVencidos > 0 ? 'is-danger' : ''}`}
                      >
                        <span className="doc-kpi-value">{carpetaData.resumen.totalVencidos}</span>
                        <span className="doc-kpi-label">Documentos vencidos</span>
                      </div>

                      <div
                        className={`doc-kpi-item ${carpetaData.resumen.totalPorVencer > 0 ? 'is-warning' : ''}`}
                      >
                        <span className="doc-kpi-value">{carpetaData.resumen.totalPorVencer}</span>
                        <span className="doc-kpi-label">Por vencer (≤ 30 días)</span>
                      </div>

                      <div className="doc-kpi-item">
                        <span
                          className={`doc-kpi-badge-status ${carpetaData.resumen.alDia ? 'is-ok' : 'is-pending'}`}
                        >
                          {carpetaData.resumen.alDia ? '✓ Al día' : 'Atención requerida'}
                        </span>
                        <span className="doc-kpi-label">Estado general</span>
                      </div>
                    </div>
                  </Card>

                  {/* Tarjetas de los 8 Documentos */}
                  <div className="doc-grid-documentos">
                    {carpetaData.documentos.map(({ tipo, cargado, documento }) => {
                      const icon = ICONOS_DOCUMENTO[tipo.codigo] || ICONOS_DOCUMENTO.DEFAULT;
                      const estadoVigencia = documento?.estadoVigencia || 'PENDIENTE';

                      return (
                        <Card
                          key={tipo.id}
                          className={`doc-card-slot ${cargado ? 'slot-cargado' : 'slot-vacio'} ${
                            estadoVigencia === 'VENCIDO' ? 'slot-vencido' : ''
                          }`}
                        >
                          <div className="doc-card-top">
                            <span className="doc-card-icon" aria-hidden="true">
                              {icon}
                            </span>
                            <div className="doc-card-title-group">
                              <h3 className="doc-card-title">{tipo.descripcion}</h3>
                              <span className="doc-card-req">
                                {tipo.requiereArchivo ? 'Requiere PDF' : 'Solo registro de vigencia'}
                              </span>
                            </div>

                            {/* Badge de estado */}
                            <span className={`doc-status-badge badge-${estadoVigencia.toLowerCase()}`}>
                              {estadoVigencia === 'PENDIENTE' && 'Pendiente'}
                              {estadoVigencia === 'VIGENTE' && '● Vigente'}
                              {estadoVigencia === 'POR_VENCER' && '⚠️ Por vencer'}
                              {estadoVigencia === 'VENCIDO' && '⛔ Vencido'}
                            </span>
                          </div>

                          {/* Cuerpo de la tarjeta */}
                          <div className="doc-card-body">
                            {cargado ? (
                              <div className="doc-info-rows">
                                {tipo.requiereVencimiento && documento.fechaVencimiento && (
                                  <div className="doc-info-row">
                                    <span className="doc-info-label">Vencimiento:</span>
                                    <span className="doc-info-val doc-venc-val">
                                      {new Date(documento.fechaVencimiento).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}

                                {documento.fechaEmision && (
                                  <div className="doc-info-row">
                                    <span className="doc-info-label">Emisión:</span>
                                    <span className="doc-info-val">
                                      {new Date(documento.fechaEmision).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}

                                <div className="doc-info-row">
                                  <span className="doc-info-label">Archivo:</span>
                                  <span className="doc-info-val doc-file-val" title={documento.nombreOriginal || 'Sin archivo'}>
                                    {documento.nombreOriginal || (tipo.requiereArchivo ? 'Sin archivo' : 'Trámite sin PDF')}
                                  </span>
                                </div>

                                {documento.observaciones && (
                                  <div className="doc-info-notas">
                                    <span className="doc-info-label">Notas:</span>
                                    <p className="doc-notas-text">{documento.observaciones}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="doc-card-placeholder">
                                <p>Este documento aún no ha sido cargado en el sistema.</p>
                              </div>
                            )}
                          </div>

                          {/* Acciones de la tarjeta */}
                          <div className="doc-card-actions">
                            <div className="doc-card-actions-left">
                              {cargado && documento?.signedUrl && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => abrirVisor(documento)}
                                >
                                  Ver PDF
                                </Button>
                              )}

                              {cargado && (
                                <button
                                  type="button"
                                  className="doc-btn-historial"
                                  onClick={() => abrirHistorial(tipo)}
                                >
                                  Historial
                                </button>
                              )}
                            </div>

                            {puedeGestionar && (
                              <Button
                                variant={cargado ? 'secondary' : 'primary'}
                                size="sm"
                                onClick={() => abrirSubir(tipo, documento)}
                              >
                                {cargado ? 'Renovar / Actualizar' : 'Subir documento'}
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </main>
          </div>
        )}

        {/* Modal de Carga / Renovación */}
        <ModalSubirDocumento
          open={modalSubir.open}
          onClose={() => setModalSubir({ open: false, tipo: null, docActual: null })}
          vehiculo={vehiculoSeleccionado}
          tipoDocumento={modalSubir.tipo}
          documentoActual={modalSubir.docActual}
          onSuccess={handleSuccessDoc}
        />

        {/* Modal Visor de PDF */}
        <ModalVisorPdf
          open={modalVisor.open}
          onClose={() => setModalVisor({ open: false, documento: null })}
          documento={modalVisor.documento}
          vehiculo={vehiculoSeleccionado}
        />

        {/* Modal Historial de Versiones */}
        <ModalHistorialDocumento
          open={modalHistorial.open}
          onClose={() => setModalHistorial({ open: false, tipo: null })}
          vehiculo={vehiculoSeleccionado}
          tipoDocumento={modalHistorial.tipo}
          onVerPdf={(docHist) => {
            setModalHistorial({ open: false, tipo: null });
            abrirVisor(docHist);
          }}
        />

        {/* Notificación Toast */}
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </div>
    </Layout>
  );
}

export default Documentacion;
