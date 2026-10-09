import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';
import Alert from '../components/ui/Alert';
import ControlSegmentado from '../components/ui/ControlSegmentado';
import EstadoBadge from '../components/ui/EstadoBadge';
import FormField from '../components/ui/FormField';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import IconoVehiculo from '../components/IconoVehiculo';
import { ListadoCard, ListadoHeader, ListadoToolbar } from '../components/Listado';
import TarjetaDocumento from '../components/documentacion/TarjetaDocumento';
import ModalSubirDocumento from '../components/documentacion/ModalSubirDocumento';
import ModalHistorialDocumento from '../components/documentacion/ModalHistorialDocumento';
import ModalVisorPdf from '../components/documentacion/ModalVisorPdf';
import { ESTADOS_DOCUMENTACION } from '../constants/estadosDocumentacion';
import { ESTADOS_VEHICULO } from '../constants/estadosVehiculo';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import { ordenarPorTipoDocumento } from '../constants/tiposDocumento';
import { DURACION_TOAST_MS } from '../constants/toast';
import { contadoresResumen, iniciales, lineaDetalleListado, textoDocumentosCargados } from '../utils/documentacion';
import { obtenerUrlArchivo } from '../services/documentosApi';
import { ordenarPorInterno } from '../utils/vehiculos';
import './Documentacion.css';

const VISTAS = [
  { valor: 'vehiculos', etiqueta: 'Vehículos' },
  { valor: 'choferes', etiqueta: 'Choferes' },
];

const FILTRO_ESTADO = [
  { value: '', label: 'Todas' },
  ...Object.entries(ESTADOS_DOCUMENTACION).map(([value, { label }]) => ({ value, label })),
];

// Todo lo que cambia entre las dos vistas: de dónde sale el listado, cómo se
// llega a la carpeta de un titular y los textos.
const CONFIG = {
  vehiculos: {
    listado: '/documentos/estado-flota',
    carpeta: (id) => `/documentos/vehiculos/${id}`,
    parametro: 'vehiculoId',
    buscar: 'Buscar por dominio, interno o marca',
    vacio: 'No hay vehículos con ese estado.',
    sinResultados: 'No se encontraron vehículos.',
    cargando: 'Cargando vehículos…',
  },
  choferes: {
    listado: '/documentos/estado-choferes',
    carpeta: (id) => `/documentos/choferes/${id}`,
    parametro: 'choferId',
    buscar: 'Buscar por nombre o DNI',
    vacio: 'No hay choferes con ese estado.',
    sinResultados: 'No se encontraron choferes.',
    cargando: 'Cargando choferes…',
  },
};

// Id de la URL (?vehiculoId= / ?choferId=) o null si falta o no es válido.
function idDeUrl(valor) {
  const id = Number.parseInt(valor, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const perfilLabel = (perfil) => PERFILES.find((p) => p.value === perfil)?.label ?? perfil;

// "Chofer"; un Encargado (u otro perfil) habilitado para conducir lo aclara.
function subtituloPerfil(chofer) {
  const perfil = chofer.perfil?.descripcion;
  const etiqueta = perfilLabel(perfil);
  return perfil !== 'CHOFER' && chofer.habilitadoParaConducir ? `${etiqueta} · habilitado para conducir` : etiqueta;
}

const nombreCompleto = (chofer) => `${chofer.nombre} ${chofer.apellido}`;
const normalizar = (texto) => String(texto ?? '').toLowerCase();

function coincideBusqueda(vista, item, busqueda) {
  const q = normalizar(busqueda).trim();
  if (!q) return true;
  if (vista === 'vehiculos') {
    return [item.dominio, item.numeroInterno, item.marca].some((campo) => normalizar(campo).includes(q));
  }
  return (
    normalizar(nombreCompleto(item)).includes(q) ||
    normalizar(item.dni).replace(/\./g, '').includes(q.replace(/\./g, ''))
  );
}

const porApellido = (a, b) => a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es');

// Dominio con `.patente` y marca del vehículo, o el nombre del chofer: el
// subtítulo de los modales.
function subtituloTitular(vista, ficha) {
  if (vista === 'choferes') return nombreCompleto(ficha.chofer);
  const v = ficha.vehiculo;
  return (
    <>
      {v.numeroInterno} - <span className="patente">{v.dominio}</span> · {v.marca} {v.modelo}
    </>
  );
}

function Documentacion() {
  const [searchParams, setSearchParams] = useSearchParams();

  // La vista y la ficha abierta viven en la URL: sirven los enlaces de Flota y de
  // las alertas (?vehiculoId=, ?tab=choferes&choferId=) y funciona el botón Atrás.
  const vista = searchParams.get('tab') === 'choferes' ? 'choferes' : 'vehiculos';
  const config = CONFIG[vista];
  const fichaId = idDeUrl(searchParams.get(config.parametro));
  const enFicha = fichaId !== null;
  const claveFicha = enFicha ? `${vista}:${fichaId}` : null;

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Se guardan junto con la vista / ficha a la que pertenecen: mientras no coincide
  // con la actual se está cargando, sin tener que apagar y prender banderas.
  const [lista, setLista] = useState(null); // { vista, items }
  const [errorLista, setErrorLista] = useState(null); // { vista, mensaje }
  const [carpeta, setCarpeta] = useState(null); // { clave, data }
  const [errorFicha, setErrorFicha] = useState(null); // { clave, mensaje }

  const [modalCarga, setModalCarga] = useState(null); // { tipo, documento }
  const [modalHistorial, setModalHistorial] = useState(null); // { tipo }
  const [visor, setVisor] = useState(null); // { documento, url }
  const [errorArchivo, setErrorArchivo] = useState('');
  const [toast, setToast] = useState('');

  // El listado se pide al elegir la vista y al volver de una ficha (para reflejar
  // lo que se cargó); abrir una ficha no lo vuelve a pedir.
  useEffect(() => {
    if (enFicha) return undefined;
    let cancelado = false;
    api
      .get(config.listado)
      .then(({ data }) => {
        if (cancelado) return;
        setLista({ vista, items: data[vista] || [] });
        setErrorLista(null);
      })
      .catch((err) => {
        if (cancelado) return;
        setErrorLista({ vista, mensaje: err.response?.data?.error || 'No se pudo cargar el listado.' });
      });
    return () => {
      cancelado = true;
    };
  }, [vista, enFicha, config.listado]);

  const cargarFicha = useCallback(() => {
    if (!fichaId) return Promise.resolve();
    const clave = `${vista}:${fichaId}`;
    return api
      .get(CONFIG[vista].carpeta(fichaId))
      .then(({ data }) => {
        setCarpeta({ clave, data });
        setErrorFicha(null);
      })
      .catch((err) => {
        setErrorFicha({ clave, mensaje: err.response?.data?.error || 'No se pudo cargar la documentación.' });
      });
  }, [vista, fichaId]);

  useEffect(() => {
    cargarFicha();
  }, [cargarFicha]);

  // La ficha reemplaza al listado en la misma ruta y el router no reinicia el
  // scroll: sin esto una aparece desplazada hacia abajo (y el listado al volver).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [fichaId, vista]);

  // El Toast no se oculta solo: lo hace quien lo monta.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  function cambiarVista(nueva) {
    setBusqueda('');
    setEstado('');
    setSearchParams(nueva === 'choferes' ? { tab: 'choferes' } : {});
  }

  function abrirFicha(id) {
    setSearchParams(vista === 'choferes' ? { tab: 'choferes', choferId: id } : { vehiculoId: id });
  }

  function volverAlListado() {
    setSearchParams(vista === 'choferes' ? { tab: 'choferes' } : {});
  }

  // La URL firmada se pide al tocar el botón, no al cargar la carpeta.
  async function abrirVisor(documento) {
    setErrorArchivo('');
    try {
      const url = await obtenerUrlArchivo(documento.id);
      setVisor({ documento, url });
    } catch (err) {
      setErrorArchivo(err.response?.data?.error || 'No se pudo abrir el archivo. Intentá de nuevo.');
    }
  }

  function documentoGuardado() {
    setModalCarga(null);
    setToast('Documento guardado correctamente.');
    cargarFicha();
  }

  const items = lista?.vista === vista ? lista.items : null;
  const itemsFiltrados = items
    ? (vista === 'vehiculos' ? ordenarPorInterno(items) : [...items].sort(porApellido)).filter(
        (item) => coincideBusqueda(vista, item, busqueda) && (!estado || item.estadoDocumentacion === estado)
      )
    : [];
  const cargandoLista = !items && errorLista?.vista !== vista;

  const ficha = carpeta?.clave === claveFicha ? carpeta.data : null;
  const errorDeFicha = errorFicha?.clave === claveFicha ? errorFicha.mensaje : '';

  return (
    <Layout>
      {toast && <Toast>{toast}</Toast>}
      {errorArchivo && <Alert variant="error">{errorArchivo}</Alert>}

      {!enFicha && (
        <>
          <ListadoHeader titulo="Documentación" />

          <ControlSegmentado opciones={VISTAS} valor={vista} onChange={cambiarVista} ariaLabel="Vista de documentación" />

          <ListadoToolbar
            busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: config.buscar }}
            filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos: estado ? 1 : 0 }}
          />

          {mostrarFiltros && (
            <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
              <FormField id="filtro-estado" label="Estado">
                <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {FILTRO_ESTADO.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>
                      {opcion.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </form>
          )}

          {cargandoLista && (
            <div className="loading-state">
              <Spinner label={config.cargando} />
              <span>{config.cargando}</span>
            </div>
          )}

          {errorLista?.vista === vista && !items && <Alert variant="error">{errorLista.mensaje}</Alert>}

          {items && itemsFiltrados.length === 0 && (
            <div className="listado-vacio">{estado ? config.vacio : config.sinResultados}</div>
          )}

          {items && itemsFiltrados.length > 0 && (
            <div className="listado-cards">
              {itemsFiltrados.map((item) => (
                <TarjetaListado key={item.id} vista={vista} item={item} onClick={() => abrirFicha(item.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {enFicha && (
        <>
          <button type="button" className="back-link" onClick={volverAlListado}>
            ← Volver al listado
          </button>

          {errorDeFicha && <Alert variant="error">{errorDeFicha}</Alert>}

          {!ficha && !errorDeFicha && (
            <div className="loading-state">
              <Spinner label="Cargando documentación" />
              <span>Cargando documentación…</span>
            </div>
          )}

          {ficha && (
            <Ficha
              vista={vista}
              ficha={ficha}
              onVerPdf={abrirVisor}
              onActualizar={(tipo, documento) => setModalCarga({ tipo, documento })}
              onHistorial={(tipo) => setModalHistorial({ tipo })}
            />
          )}
        </>
      )}

      {ficha && modalCarga && (
        <ModalSubirDocumento
          subtitulo={subtituloTitular(vista, ficha)}
          vehiculo={vista === 'vehiculos' ? ficha.vehiculo : null}
          chofer={vista === 'choferes' ? ficha.chofer : null}
          tipoDocumento={modalCarga.tipo}
          documentoActual={modalCarga.documento}
          onClose={() => setModalCarga(null)}
          onSuccess={documentoGuardado}
        />
      )}

      {ficha && modalHistorial && (
        <ModalHistorialDocumento
          subtitulo={subtituloTitular(vista, ficha)}
          vehiculo={vista === 'vehiculos' ? ficha.vehiculo : null}
          chofer={vista === 'choferes' ? ficha.chofer : null}
          tipoDocumento={modalHistorial.tipo}
          onClose={() => setModalHistorial(null)}
          onVerPdf={(version) => {
            setModalHistorial(null);
            abrirVisor(version);
          }}
        />
      )}

      {ficha && visor && (
        <ModalVisorPdf
          subtitulo={subtituloTitular(vista, ficha)}
          documento={visor.documento}
          url={visor.url}
          onClose={() => setVisor(null)}
        />
      )}
    </Layout>
  );
}

function TarjetaListado({ vista, item, onClick }) {
  const estado = ESTADOS_DOCUMENTACION[item.estadoDocumentacion];
  const badge = (
    <EstadoBadge tono={estado.tono} size="sm">
      {estado.label}
    </EstadoBadge>
  );
  const detalle = lineaDetalleListado(item);

  if (vista === 'vehiculos') {
    return (
      <ListadoCard
        marca={<IconoVehiculo tipo={item.tipoVehiculo.descripcion} />}
        titulo={
          <>
            {item.numeroInterno} - <span className="patente">{item.dominio}</span>
          </>
        }
        estado={badge}
        sub={`${item.marca} ${item.modelo}`}
        detalle={detalle}
        pie={[textoDocumentosCargados(item), item.tipoVehiculo.descripcion]}
        onClick={onClick}
      />
    );
  }

  const colores = PERFIL_COLORS[item.perfil?.descripcion] || {};
  return (
    <ListadoCard
      marcaSinFondo
      marca={
        <span className="usuarios-avatar" style={{ backgroundColor: colores.bg, color: colores.text }}>
          {iniciales(item.nombre, item.apellido)}
        </span>
      }
      titulo={nombreCompleto(item)}
      estado={badge}
      sub={subtituloPerfil(item)}
      detalle={detalle}
      pie={[textoDocumentosCargados(item)]}
      onClick={onClick}
    />
  );
}

function Ficha({ vista, ficha, onVerPdf, onActualizar, onHistorial }) {
  const esVehiculo = vista === 'vehiculos';
  const titular = esVehiculo ? ficha.vehiculo : ficha.chofer;
  const estadoDoc = ESTADOS_DOCUMENTACION[ficha.resumen.estadoDocumentacion];
  const soloConsulta = esVehiculo
    ? titular.estadoVehiculo?.descripcion === 'DADO_DE_BAJA'
    : titular.estadoUsuario?.descripcion !== 'ACTIVO';

  const subtitulo = esVehiculo
    ? [
        `${titular.marca} ${titular.modelo}`,
        titular.tipoVehiculo?.descripcion,
        ESTADOS_VEHICULO[titular.estadoVehiculo?.descripcion]?.label,
      ]
        .filter(Boolean)
        .join(' · ')
    : subtituloPerfil(titular);

  const ordenados = ordenarPorTipoDocumento(ficha.documentos, (item) => item.tipo.descripcion);
  const secciones = [
    { titulo: 'Con vencimiento', items: ordenados.filter((item) => item.tipo.requiereVencimiento) },
    { titulo: 'Sin vencimiento', items: ordenados.filter((item) => !item.tipo.requiereVencimiento) },
  ].filter((seccion) => seccion.items.length > 0);

  return (
    <>
      <div className="doc-ficha-header">
        <h1>
          {esVehiculo ? (
            <>
              {titular.numeroInterno} - <span className="patente">{titular.dominio}</span>
            </>
          ) : (
            nombreCompleto(titular)
          )}
        </h1>
        <EstadoBadge tono={estadoDoc.tono}>{estadoDoc.label}</EstadoBadge>
      </div>

      <p className="doc-ficha-subtitulo">{subtitulo}</p>

      <p className="doc-ficha-resumen">
        {contadoresResumen(ficha.resumen).map((contador, indice) => (
          <span key={contador.texto}>
            {indice > 0 && ' · '}
            <strong className="num">{contador.numero}</strong> {contador.texto}
          </span>
        ))}
      </p>

      {soloConsulta && (
        <Alert variant="info">
          {esVehiculo
            ? 'Vehículo dado de baja: la documentación es de solo consulta'
            : 'Usuario inactivo: la documentación es de solo consulta'}
        </Alert>
      )}

      {secciones.map((seccion) => (
        <section key={seccion.titulo} className="doc-seccion">
          <h2 className="detalle-seccion-titulo doc-seccion-titulo">{seccion.titulo}</h2>
          <div className="doc-tarjetas">
            {seccion.items.map((item) => (
              <TarjetaDocumento
                key={item.tipo.id}
                item={item}
                soloConsulta={soloConsulta}
                onVerPdf={onVerPdf}
                onActualizar={onActualizar}
                onHistorial={onHistorial}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default Documentacion;
