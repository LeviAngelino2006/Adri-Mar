import { useContext, useEffect } from 'react';
import IconoVehiculo from '../IconoVehiculo';
import useEtapaCarga from '../../hooks/useEtapaCarga';
import { avisarCargaLenta } from '../../utils/etapaCarga';
import { CargaLentaContext } from './CargaLentaContext';

// Los esqueletos usan las clases reales: se importan sus estilos para que
// midan igual en cualquier pantalla (el historial, por ejemplo, no está en el
// Dashboard).
import '../Listado.css';
import '../FechaTile.css';
import '../../pages/Dashboard.css';
import './Cargando.css';

// Estado de carga de una pantalla, panel o modal. Se monta solo mientras se
// está cargando: nada los primeros 300ms, después un esqueleto con la forma del
// contenido y, desde los 3s, el esqueleto se queda y el Layout muestra el
// colectivo con "Conectando con el servidor…".
// `forma`: 'tarjetas' (Flota, Usuarios y Documentación), 'viajes' (Viajes y Mis
// viajes: grupo con título de día y bloque de fecha) o 'filas' (paneles del
// Dashboard e historial de un documento). `aislado`: dibuja su propio colectivo
// en lugar del esqueleto (en un modal, el de la página quedaría tapado).
function Cargando({ forma = 'tarjetas', cantidad = 3, aislado = false }) {
  const etapa = useEtapaCarga(true);
  const contexto = useContext(CargaLentaContext);
  const enPagina = !aislado && contexto !== null;
  const sumar = enPagina ? contexto.sumar : null;
  const restar = enPagina ? contexto.restar : null;
  const lento = etapa === 'lento';

  useEffect(() => avisarCargaLenta(lento, sumar, restar), [lento, sumar, restar]);

  return <ContenidoCarga etapa={enPagina && lento ? 'esqueleto' : etapa} forma={forma} cantidad={cantidad} />;
}

// El marcado de cada etapa, sin timers (lo usan los tests de render).
export function ContenidoCarga({ etapa, forma = 'tarjetas', cantidad = 3 }) {
  return (
    <div className="carga" role="status" aria-live="polite">
      {etapa !== 'oculto' && <span className="sr-only">Cargando…</span>}
      {etapa === 'esqueleto' && <Esqueleto forma={forma} cantidad={cantidad} />}
      {etapa === 'lento' && <CargaColectivo />}
    </div>
  );
}

// Barra gris dentro de una línea de texto: toma el alto de línea del componente
// real que la contiene.
const Barra = ({ ancho }) => <span className="esqueleto-barra" style={{ width: ancho }} />;

// Mismas clases que el contenido real (ListadoCard, TarjetaViaje y las filas del
// Dashboard), con barras en lugar de texto: así mide lo mismo.
function Esqueleto({ forma, cantidad }) {
  const items = Array.from({ length: cantidad }, (_, i) => i);
  if (forma === 'filas') {
    return (
      <ul className="dashboard-lista" aria-hidden="true">
        {items.map((i) => (
          <li key={i}>
            <div className="dashboard-fila esqueleto-fila">
              <span className="hora-col">
                <span>
                  <Barra ancho="40px" />
                </span>
                <small>
                  <Barra ancho="32px" />
                </small>
              </span>
              <span className="dashboard-fila-info">
                <span className="dashboard-fila-titulo">
                  <Barra ancho="60%" />
                </span>
                <span className="dashboard-fila-meta">
                  <Barra ancho="40%" />
                </span>
              </span>
              <span className="esqueleto-barra esqueleto-badge" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  const tarjetas = (
    <div className="listado-cards" aria-hidden="true">
      {items.map((i) => (
        <div key={i} className="listado-card esqueleto-tarjeta">
          <div className={forma === 'viajes' ? 'listado-card-marca fecha-tile' : 'listado-card-marca'} />
          <div className="listado-card-cuerpo">
            <div className="listado-card-top">
              <span className="listado-card-titulo">
                <Barra ancho="55%" />
              </span>
              <span className="esqueleto-barra esqueleto-badge" />
            </div>
            <div className="listado-card-sub">
              <Barra ancho="35%" />
            </div>
            {/* Las barras del pie van en <span>: sueltas dentro del flex
                pierden el alto de línea y la tarjeta queda 10px más baja. */}
            <div className="listado-card-pie">
              <span style={{ width: '40%' }}>
                <Barra ancho="100%" />
              </span>
              <span style={{ width: '20%' }}>
                <Barra ancho="100%" />
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
  if (forma !== 'viajes') return tarjetas;
  return (
    <section className="listado-grupo" aria-hidden="true">
      <h2 className="listado-dia">
        <Barra ancho="110px" />
      </h2>
      {tarjetas}
    </section>
  );
}

// El colectivo andando, para cargas que tardan más de 3s. La variante chica es
// para el login, debajo del formulario; `className` suma clases (el Layout le
// pasa carga-colectivo-pagina).
export function CargaColectivo({ chica = false, className = '' }) {
  const clases = ['carga-colectivo', chica && 'carga-colectivo-chica', className].filter(Boolean).join(' ');
  return (
    <div className={clases}>
      <div className="carga-colectivo-ruta">
        <span className="carga-colectivo-bus">
          <IconoVehiculo tipo="Colectivo" tamano={chica ? 40 : 56} />
        </span>
      </div>
      <span className="carga-colectivo-texto">Conectando con el servidor…</span>
      <span className="carga-colectivo-hint">Puede tardar unos segundos más.</span>
    </div>
  );
}

export default Cargando;
