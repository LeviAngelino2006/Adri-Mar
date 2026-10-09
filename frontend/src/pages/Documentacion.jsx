import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import Alert from '../components/ui/Alert';
import EstadoDot from '../components/ui/EstadoDot';
import ConfirmModal from '../components/ui/ConfirmModal';
import ModalSubirDocumento from '../components/documentacion/ModalSubirDocumento';
import ModalVisorPdf from '../components/documentacion/ModalVisorPdf';
import ModalHistorialDocumento from '../components/documentacion/ModalHistorialDocumento';
import { useAuth } from '../context/AuthContext';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import api from '../services/api';
import { eliminarDocumentoVehiculo, eliminarDocumentoChofer } from '../services/documentosApi';
import { formatearNombreArchivo } from '../utils/archivoFormato';
import './Documentacion.css';

const PUEDE_GESTIONAR = ['ADMINISTRADOR', 'ENCARGADO'];

function ordenarPorInterno(vehiculos) {
  return [...vehiculos].sort(
    (a, b) => (parseInt(a.numeroInterno, 10) || 0) - (parseInt(b.numeroInterno, 10) || 0)
  );
}

function GridDocumentos({
  documentos,
  puedeGestionar,
  onVerPdf,
  onDescargarPdf,
  onHistorial,
  onSubir,
  onEliminar,
}) {
  if (!documentos || documentos.length === 0) {
    return (
      <div className="doc-card-placeholder">
        <p>No hay documentos configurados para este legajo.</p>
      </div>
    );
  }

  return (
    <div className="doc-grid-documentos">
      {documentos.map(({ tipo, cargado, documento }) => {
        const estadoVigencia = documento?.estadoVigencia || 'PENDIENTE';

        return (
          <Card
            key={tipo.id}
            className={`doc-card-tarjeta ${cargado ? 'slot-cargado' : 'slot-vacio'} ${
              estadoVigencia === 'VENCIDO' ? 'slot-vencido' : ''
            }`}
          >
            {/* Nivel Superior: 2 Columnas (Identificación vs Metadatos) */}
            <div className="doc-card-top-grid">
              {/* Columna Izquierda: Título en Mayúsculas + Badges */}
              <div className="doc-col-izq">
                <h3 className="doc-titulo-mayus">{tipo.descripcion.toUpperCase()}</h3>
                <div className="doc-badges-fila">
                  <span className="doc-badge-req">
                    {tipo.requiereArchivo ? 'Requiere PDF' : 'Solo registro de vigencia'}
                  </span>
                  <span className={`doc-status-badge badge-${estadoVigencia.toLowerCase()}`}>
                    {estadoVigencia === 'PENDIENTE' && 'Pendiente'}
                    {estadoVigencia === 'VIGENTE' && 'Vigente'}
                    {estadoVigencia === 'POR_VENCER' && 'Por vencer'}
                    {estadoVigencia === 'VENCIDO' && 'Vencido'}
                  </span>
                </div>
              </div>

              {/* Columna Derecha: Vencimiento, Emisión, Archivo, Notas */}
              <div className="doc-col-der">
                {cargado ? (
                  <div className="doc-datos-columna">
                    {tipo.requiereVencimiento && documento.fechaVencimiento && (
                      <div className="doc-dato-fila">
                        <span className="doc-dato-label">Vencimiento:</span>
                        <span className="doc-dato-valor doc-venc-val">
                          {new Date(documento.fechaVencimiento).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {documento.fechaEmision && (
                      <div className="doc-dato-fila">
                        <span className="doc-dato-label">Emisión:</span>
                        <span className="doc-dato-valor">
                          {new Date(documento.fechaEmision).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    <div className="doc-dato-fila doc-dato-fila-full">
                      <span className="doc-dato-label">Archivo:</span>
                      <span
                        className="doc-dato-valor doc-archivo-nombre"
                        title={formatearNombreArchivo(documento.nombreOriginal) || 'Sin archivo'}
                      >
                        {formatearNombreArchivo(documento.nombreOriginal) ||
                          (tipo.requiereArchivo ? 'Sin archivo' : 'Trámite sin PDF')}
                      </span>
                    </div>

                    {documento.observaciones && (
                      <div className="doc-dato-fila doc-dato-fila-full doc-dato-notas">
                        <span className="doc-dato-label">Notas:</span>
                        <span className="doc-dato-valor">{documento.observaciones}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="doc-placeholder-col">
                    <span>Este documento aún no ha sido cargado en el sistema.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Nivel Inferior: Barra Horizontal con Los 5 Botones (Eliminar al final) */}
            <div className="doc-card-acciones-fila">
              {cargado && documento?.signedUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onVerPdf(documento)}
                >
                  Ver PDF
                </Button>
              )}

              {cargado && documento?.signedUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onDescargarPdf(documento)}
                >
                  Descargar PDF
                </Button>
              )}

              {cargado && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onHistorial(tipo)}
                >
                  Historial
                </Button>
              )}

              {puedeGestionar && (
                <Button
                  variant={cargado ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => onSubir(tipo, documento)}
                >
                  {cargado ? 'Actualizar' : 'Subir documento'}
                </Button>
              )}

              {puedeGestionar && cargado && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onEliminar(documento)}
                >
                  Eliminar
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}


function Documentacion() {
  const { usuario } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR.includes(usuario?.perfil);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Pestaña activa ('vehiculos' | 'choferes')
  const [tabActiva, setTabActiva] = useState(() => {
    return searchParams.get('tab') === 'choferes' ? 'choferes' : 'vehiculos';
  });

  // Estado Vehículos
  const [vehiculos, setVehiculos] = useState([]);
  const [cargandoVehiculos, setCargandoVehiculos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState(null); // null, 'VENCIDOS', 'PENDIENTES'
  const [carpetaData, setCarpetaData] = useState(null);
  const [cargandoCarpeta, setCargandoCarpeta] = useState(false);
  const [errorCarpeta, setErrorCarpeta] = useState('');

  // Estado Choferes
  const [choferes, setChoferes] = useState([]);
  const [cargandoChoferes, setCargandoChoferes] = useState(false);
  const [busquedaChofer, setBusquedaChofer] = useState('');
  const [choferSeleccionado, setChoferSeleccionado] = useState(null);
  const [filtroEstadoChofer, setFiltroEstadoChofer] = useState(null); // null, 'VENCIDOS', 'PENDIENTES'
  const [carpetaChoferData, setCarpetaChoferData] = useState(null);
  const [cargandoCarpetaChofer, setCargandoCarpetaChofer] = useState(false);
  const [errorCarpetaChofer, setErrorCarpetaChofer] = useState('');

  // Notificación general
  const [toast, setToast] = useState('');

  // Modales compartidos
  const [modalSubir, setModalSubir] = useState({ open: false, tipo: null, docActual: null });
  const [modalVisor, setModalVisor] = useState({ open: false, documento: null });
  const [modalHistorial, setModalHistorial] = useState({ open: false, tipo: null });

  // Modal de confirmación de eliminación de documento
  const [modalEliminar, setModalEliminar] = useState({ open: false, documento: null, eliminando: false, error: '' });

  // Cargar lista de vehículos con estado de flota
  const cargarFlota = useCallback(() => {
    setCargandoVehiculos(true);
    return api
      .get('/documentos/estado-flota')
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

        if (ordenados.length > 0) {
          setVehiculoSeleccionado((prev) => {
            if (prev) {
              const actualizado = ordenados.find((v) => v.id === prev.id);
              return actualizado || ordenados[0];
            }
            return ordenados[0];
          });
        }
      })
      .catch((err) => {
        console.error('Error al cargar estado de flota:', err);
      })
      .finally(() => setCargandoVehiculos(false));
  }, [searchParams]);

  // Cargar lista de choferes con estado de documentación
  const cargarChoferes = useCallback(() => {
    setCargandoChoferes(true);
    return api
      .get('/documentos/estado-choferes')
      .then(({ data }) => {
        const lista = data.choferes || [];
        setChoferes(lista);

        const cIdParam = searchParams.get('choferId');
        if (cIdParam) {
          const encontrado = lista.find((c) => c.id === parseInt(cIdParam, 10));
          if (encontrado) {
            setChoferSeleccionado(encontrado);
            return;
          }
        }

        if (lista.length > 0) {
          setChoferSeleccionado((prev) => {
            if (prev) {
              const actualizado = lista.find((c) => c.id === prev.id);
              return actualizado || lista[0];
            }
            return lista[0];
          });
        }
      })
      .catch((err) => {
        console.error('Error al cargar estado de choferes:', err);
      })
      .finally(() => setCargandoChoferes(false));
  }, [searchParams]);

  // Cargar carpeta de documentación del vehículo seleccionado
  const cargarCarpetaVehiculo = useCallback((vehiculoId) => {
    if (!vehiculoId) return;
    setCargandoCarpeta(true);
    setErrorCarpeta('');
    api
      .get(`/documentos/vehiculos/${vehiculoId}`)
      .then(({ data }) => {
        setCarpetaData(data);
      })
      .catch((err) => {
        setErrorCarpeta(err.response?.data?.error || 'Error al cargar la documentación del vehículo.');
      })
      .finally(() => setCargandoCarpeta(false));
  }, []);

  // Cargar carpeta de documentación del chofer seleccionado
  const cargarCarpetaChofer = useCallback((choferId) => {
    if (!choferId) return;
    setCargandoCarpetaChofer(true);
    setErrorCarpetaChofer('');
    api
      .get(`/documentos/choferes/${choferId}`)
      .then(({ data }) => {
        setCarpetaChoferData(data);
      })
      .catch((err) => {
        setErrorCarpetaChofer(err.response?.data?.error || 'Error al cargar la documentación del chofer.');
      })
      .finally(() => setCargandoCarpetaChofer(false));
  }, []);

  // Efecto inicial según la pestaña activa
  useEffect(() => {
    if (tabActiva === 'vehiculos') {
      cargarFlota();
    } else {
      cargarChoferes();
    }
  }, [tabActiva, cargarFlota, cargarChoferes]);

  // Efecto cuando cambia el vehículo seleccionado
  useEffect(() => {
    if (tabActiva === 'vehiculos' && vehiculoSeleccionado) {
      cargarCarpetaVehiculo(vehiculoSeleccionado.id);
    }
  }, [tabActiva, vehiculoSeleccionado, cargarCarpetaVehiculo]);

  // Efecto cuando cambia el chofer seleccionado
  useEffect(() => {
    if (tabActiva === 'choferes' && choferSeleccionado) {
      cargarCarpetaChofer(choferSeleccionado.id);
    }
  }, [tabActiva, choferSeleccionado, cargarCarpetaChofer]);

  function handleCambiarTab(nuevaTab) {
    setTabActiva(nuevaTab);
    if (nuevaTab === 'choferes') {
      if (choferSeleccionado) {
        setSearchParams({ tab: 'choferes', choferId: choferSeleccionado.id });
      } else {
        setSearchParams({ tab: 'choferes' });
      }
    } else {
      if (vehiculoSeleccionado) {
        setSearchParams({ tab: 'vehiculos', vehiculoId: vehiculoSeleccionado.id });
      } else {
        setSearchParams({ tab: 'vehiculos' });
      }
    }
  }

  function handleSelectVehiculo(v) {
    setVehiculoSeleccionado(v);
    setSearchParams({ tab: 'vehiculos', vehiculoId: v.id });
  }

  function handleSelectChofer(c) {
    setChoferSeleccionado(c);
    setSearchParams({ tab: 'choferes', choferId: c.id });
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

  async function descargarPdf(documento) {
    if (!documento?.signedUrl) return;
    try {
      const response = await fetch(documento.signedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documento.nombreOriginal || `${documento.tipoDocumento?.codigo || 'documento'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(documento.signedUrl, '_blank');
    }
  }

  function handleSuccessDoc() {
    setToast('Operación completada exitosamente.');
    if (tabActiva === 'vehiculos') {
      if (vehiculoSeleccionado) {
        cargarCarpetaVehiculo(vehiculoSeleccionado.id);
      }
      cargarFlota();
    } else {
      if (choferSeleccionado) {
        cargarCarpetaChofer(choferSeleccionado.id);
      }
      cargarChoferes();
    }
  }

  function abrirEliminar(documento) {
    setModalEliminar({ open: true, documento, eliminando: false, error: '' });
  }

  async function confirmarEliminar() {
    const { documento } = modalEliminar;
    if (!documento) return;
    setModalEliminar((prev) => ({ ...prev, eliminando: true, error: '' }));
    try {
      if (tabActiva === 'vehiculos') {
        await eliminarDocumentoVehiculo(vehiculoSeleccionado.id, documento.id);
        cargarCarpetaVehiculo(vehiculoSeleccionado.id);
        cargarFlota();
      } else {
        await eliminarDocumentoChofer(choferSeleccionado.id, documento.id);
        cargarCarpetaChofer(choferSeleccionado.id);
        cargarChoferes();
      }
      setModalEliminar({ open: false, documento: null, eliminando: false, error: '' });
      setToast('Documento eliminado correctamente.');
    } catch (err) {
      setModalEliminar((prev) => ({
        ...prev,
        eliminando: false,
        error: err.response?.data?.error || 'No se pudo eliminar el documento.',
      }));
    }
  }

  // Filtrado de vehículos
  const vehiculosFiltrados = vehiculos.filter((v) => {
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      const coincide =
        v.numeroInterno.toLowerCase().includes(q) ||
        v.dominio.toLowerCase().includes(q) ||
        v.marca.toLowerCase().includes(q) ||
        v.modelo.toLowerCase().includes(q);
      if (!coincide) return false;
    }

    if (filtroEstado === 'VENCIDOS') {
      return v.tieneVencidos === true;
    }
    if (filtroEstado === 'PENDIENTES') {
      return v.tienePendientes === true;
    }
    return true;
  });

  // Filtrado de choferes
  const choferesFiltrados = choferes.filter((c) => {
    if (busquedaChofer.trim()) {
      const q = busquedaChofer.toLowerCase();
      const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase();
      const dni = (c.dni || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const coincide =
        nombreCompleto.includes(q) ||
        dni.includes(q) ||
        email.includes(q);
      if (!coincide) return false;
    }

    if (filtroEstadoChofer === 'VENCIDOS') {
      return c.tieneVencidos === true;
    }
    if (filtroEstadoChofer === 'PENDIENTES') {
      return c.tienePendientes === true;
    }
    return true;
  });

  return (
    <Layout>
      <div className="doc-page-container">
        {/* Selector de Pestañas Centrado (Vehículos / Choferes) */}
        <div className="doc-page-header">
          <div className="doc-tabs-container" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'vehiculos'}
              className={`doc-tab-btn ${tabActiva === 'vehiculos' ? 'is-active' : ''}`}
              onClick={() => handleCambiarTab('vehiculos')}
            >
              Vehículos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'choferes'}
              className={`doc-tab-btn ${tabActiva === 'choferes' ? 'is-active' : ''}`}
              onClick={() => handleCambiarTab('choferes')}
            >
              Choferes
            </button>
          </div>
        </div>

        {/* CONTENIDO PESTAÑA: VEHÍCULOS */}
        {tabActiva === 'vehiculos' && (
          cargandoVehiculos ? (
            <div className="doc-loading-state">
              <Spinner />
              <p>Cargando unidades de la flota...</p>
            </div>
          ) : (
            <div className="doc-layout-grid">
              {/* Sidebar Selector de Vehículos */}
              <aside className="doc-sidebar-vehiculos">
                <div className="doc-search-box">
                  <input
                    type="text"
                    placeholder="Buscar interno o patente..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="doc-search-input"
                  />
                  <div className="doc-filter-pills">
                    <button
                      type="button"
                      className={`doc-pill-btn is-vencidos ${filtroEstado === 'VENCIDOS' ? 'is-active' : ''}`}
                      onClick={() => setFiltroEstado((prev) => (prev === 'VENCIDOS' ? null : 'VENCIDOS'))}
                      title="Filtrar coches con documentos vencidos"
                    >
                      Vencidos
                    </button>
                    <button
                      type="button"
                      className={`doc-pill-btn is-pendientes ${filtroEstado === 'PENDIENTES' ? 'is-active' : ''}`}
                      onClick={() => setFiltroEstado((prev) => (prev === 'PENDIENTES' ? null : 'PENDIENTES'))}
                      title="Filtrar coches con documentos pendientes de carga"
                    >
                      Pendientes
                    </button>
                  </div>
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
                            <span className="doc-vehiculo-badge-interno">{v.numeroInterno}</span>
                            <div className="doc-vehiculo-header-right">
                              <span className="doc-vehiculo-dominio">{v.dominio}</span>
                            </div>
                          </div>
                          <div className="doc-vehiculo-item-body">
                            <span className="doc-vehiculo-modelo">
                              {v.marca} {v.modelo}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Contenido: Carpeta Digital de la Unidad */}
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
                            <h2>Coche {vehiculoSeleccionado.numeroInterno}</h2>
                            <span className="doc-unidad-patente">{vehiculoSeleccionado.dominio}</span>
                          </div>
                          <p className="doc-unidad-specs">
                            {vehiculoSeleccionado.tipoVehiculo?.descripcion} • {vehiculoSeleccionado.marca}{' '}
                            {vehiculoSeleccionado.modelo} ({vehiculoSeleccionado.anio}) •{' '}
                            {vehiculoSeleccionado.kilometraje?.toLocaleString()} km
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

                    {/* Tarjetas de Documentos del Vehículo */}
                    <GridDocumentos
                      documentos={carpetaData.documentos}
                      puedeGestionar={puedeGestionar}
                      onVerPdf={abrirVisor}
                      onDescargarPdf={descargarPdf}
                      onHistorial={abrirHistorial}
                      onSubir={abrirSubir}
                      onEliminar={abrirEliminar}
                    />
                  </div>
                ) : null}
              </main>
            </div>
          )
        )}

        {/* CONTENIDO PESTAÑA: CHOFERES */}
        {tabActiva === 'choferes' && (
          cargandoChoferes ? (
            <div className="doc-loading-state">
              <Spinner />
              <p>Cargando legajo de choferes...</p>
            </div>
          ) : (
            <div className="doc-layout-grid">
              {/* Sidebar Selector de Choferes */}
              <aside className="doc-sidebar-vehiculos">
                <div className="doc-search-box">
                  <input
                    type="text"
                    placeholder="Buscar chofer por nombre o DNI..."
                    value={busquedaChofer}
                    onChange={(e) => setBusquedaChofer(e.target.value)}
                    className="doc-search-input"
                  />
                  <div className="doc-filter-pills">
                    <button
                      type="button"
                      className={`doc-pill-btn is-vencidos ${filtroEstadoChofer === 'VENCIDOS' ? 'is-active' : ''}`}
                      onClick={() => setFiltroEstadoChofer((prev) => (prev === 'VENCIDOS' ? null : 'VENCIDOS'))}
                      title="Filtrar choferes con documentos vencidos"
                    >
                      Vencidos
                    </button>
                    <button
                      type="button"
                      className={`doc-pill-btn is-pendientes ${filtroEstadoChofer === 'PENDIENTES' ? 'is-active' : ''}`}
                      onClick={() => setFiltroEstadoChofer((prev) => (prev === 'PENDIENTES' ? null : 'PENDIENTES'))}
                      title="Filtrar choferes con documentos pendientes de carga"
                    >
                      Pendientes
                    </button>
                  </div>
                </div>

                <div className="doc-vehiculos-list">
                  {choferesFiltrados.length === 0 ? (
                    <p className="doc-no-results">No se encontraron choferes.</p>
                  ) : (
                    choferesFiltrados.map((c) => {
                      const isSelected = choferSeleccionado?.id === c.id;
                      const iniciales = `${c.nombre?.[0] || ''}${c.apellido?.[0] || ''}`.toUpperCase();

                      return (
                        <button
                          type="button"
                          key={c.id}
                          className={`doc-vehiculo-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleSelectChofer(c)}
                        >
                          <div className="doc-vehiculo-item-header">
                            <div className="doc-chofer-header-left">
                              <span className="doc-chofer-avatar">{iniciales}</span>
                              <span className="doc-vehiculo-badge-interno">{c.nombre} {c.apellido}</span>
                            </div>
                            <div className="doc-vehiculo-header-right">
                              {c.tieneVencidos && (
                                <span className="doc-item-dot is-danger" title="Posee documentos vencidos" />
                              )}
                              {!c.tieneVencidos && c.tienePendientes && (
                                <span className="doc-item-dot is-warning" title="Posee documentos pendientes" />
                              )}
                              {c.alDia && (
                                <span className="doc-item-dot is-success" title="Documentación al día" />
                              )}
                              <span className="doc-vehiculo-dominio">DNI {c.dni || 'S/D'}</span>
                            </div>
                          </div>
                          <div className="doc-vehiculo-item-body">
                            <span className="doc-vehiculo-modelo">
                              {c.telefono || c.email || 'Sin datos de contacto'}
                            </span>
                            <EstadoDot color={c.activo ? 'green' : 'gray'}>
                              {c.activo ? 'Activo' : 'Inactivo'}
                            </EstadoDot>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Contenido: Carpeta Digital del Chofer */}
              <main className="doc-content-area">
                {!choferSeleccionado ? (
                  <div className="doc-empty-selection">
                    <span className="doc-empty-icon">👤</span>
                    <h3>Seleccioná un chofer</h3>
                    <p>Elegí un chofer del listado para gestionar y consultar sus documentos legales.</p>
                  </div>
                ) : cargandoCarpetaChofer ? (
                  <div className="doc-loading-state">
                    <Spinner />
                    <p>Cargando legajo de {choferSeleccionado.nombre} {choferSeleccionado.apellido}...</p>
                  </div>
                ) : errorCarpetaChofer ? (
                  <Alert variant="danger">{errorCarpetaChofer}</Alert>
                ) : carpetaChoferData ? (
                  <div className="doc-carpeta-wrapper">
                    {/* Ficha resumen del chofer */}
                    <Card className="doc-resumen-card">
                      <div className="doc-resumen-header">
                        <div>
                          <div className="doc-unidad-title-row">
                            <h2>{choferSeleccionado.nombre} {choferSeleccionado.apellido}</h2>
                            <span className="doc-unidad-patente">DNI {choferSeleccionado.dni || 'Sin DNI'}</span>
                            <EstadoDot
                              color={choferSeleccionado.activo ? 'green' : 'gray'}
                              size="md"
                            >
                              {choferSeleccionado.activo ? 'Chofer Activo' : 'Chofer Inactivo'}
                            </EstadoDot>
                          </div>
                          <p className="doc-unidad-specs">
                            Email: {choferSeleccionado.email || '—'} • Teléfono: {choferSeleccionado.telefono || '—'}
                          </p>
                        </div>

                        <div className="doc-resumen-actions">
                          {puedeGestionar && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => navigate('/usuarios')}
                            >
                              Gestionar Usuarios ↗
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* KPIs de Documentación del Chofer */}
                      <div className="doc-kpis-grid">
                        <div className="doc-kpi-item">
                          <span className="doc-kpi-value">
                            {carpetaChoferData.resumen.totalCargados} / {carpetaChoferData.resumen.totalRequeridos}
                          </span>
                          <span className="doc-kpi-label">Documentos cargados</span>
                        </div>

                        <div
                          className={`doc-kpi-item ${carpetaChoferData.resumen.totalVencidos > 0 ? 'is-danger' : ''}`}
                        >
                          <span className="doc-kpi-value">{carpetaChoferData.resumen.totalVencidos}</span>
                          <span className="doc-kpi-label">Documentos vencidos</span>
                        </div>

                        <div
                          className={`doc-kpi-item ${carpetaChoferData.resumen.totalPorVencer > 0 ? 'is-warning' : ''}`}
                        >
                          <span className="doc-kpi-value">{carpetaChoferData.resumen.totalPorVencer}</span>
                          <span className="doc-kpi-label">Por vencer (≤ 30 días)</span>
                        </div>

                        <div className="doc-kpi-item">
                          <span
                            className={`doc-kpi-badge-status ${carpetaChoferData.resumen.alDia ? 'is-ok' : 'is-pending'}`}
                          >
                            {carpetaChoferData.resumen.alDia ? '✓ Al día' : 'Atención requerida'}
                          </span>
                          <span className="doc-kpi-label">Estado legajo</span>
                        </div>
                      </div>
                    </Card>

                    {/* Tarjetas de Documentos del Chofer */}
                    <GridDocumentos
                      documentos={carpetaChoferData.documentos}
                      puedeGestionar={puedeGestionar}
                      onVerPdf={abrirVisor}
                      onDescargarPdf={descargarPdf}
                      onHistorial={abrirHistorial}
                      onSubir={abrirSubir}
                      onEliminar={abrirEliminar}
                    />
                  </div>
                ) : null}
              </main>
            </div>
          )
        )}

        {/* Modal de Carga / Renovación */}
        <ModalSubirDocumento
          open={modalSubir.open}
          onClose={() => setModalSubir({ open: false, tipo: null, docActual: null })}
          vehiculo={tabActiva === 'vehiculos' ? vehiculoSeleccionado : null}
          chofer={tabActiva === 'choferes' ? choferSeleccionado : null}
          tipoDocumento={modalSubir.tipo}
          documentoActual={modalSubir.docActual}
          onSuccess={handleSuccessDoc}
        />

        {/* Modal Visor de PDF */}
        <ModalVisorPdf
          open={modalVisor.open}
          onClose={() => setModalVisor({ open: false, documento: null })}
          documento={modalVisor.documento}
          vehiculo={tabActiva === 'vehiculos' ? vehiculoSeleccionado : null}
          chofer={tabActiva === 'choferes' ? choferSeleccionado : null}
        />

        {/* Modal Historial de Versiones */}
        <ModalHistorialDocumento
          open={modalHistorial.open}
          onClose={() => setModalHistorial({ open: false, tipo: null })}
          vehiculo={tabActiva === 'vehiculos' ? vehiculoSeleccionado : null}
          chofer={tabActiva === 'choferes' ? choferSeleccionado : null}
          tipoDocumento={modalHistorial.tipo}
          onVerPdf={(docHist) => {
            setModalHistorial({ open: false, tipo: null });
            abrirVisor(docHist);
          }}
        />

        {/* Modal de Confirmación de Eliminación de Documento */}
        <ConfirmModal
          open={modalEliminar.open}
          tone="danger"
          icon="🗑️"
          title="Eliminar documento"
          description={
            <>
              <p>
                Vas a eliminar este documento de forma permanente. El archivo PDF adjunto
                también se borrará del almacenamiento.
              </p>
              {modalEliminar.error && (
                <p style={{ color: 'var(--color-danger)', marginTop: '0.5rem', fontWeight: 500 }}>
                  {modalEliminar.error}
                </p>
              )}
            </>
          }
          confirmLabel={modalEliminar.eliminando ? 'Eliminando…' : 'Eliminar permanentemente'}
          cancelLabel="Cancelar"
          onConfirm={confirmarEliminar}
          onCancel={() => setModalEliminar({ open: false, documento: null, eliminando: false, error: '' })}
        />

        {/* Notificación Toast */}
        {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
      </div>
    </Layout>
  );
}

export default Documentacion;
