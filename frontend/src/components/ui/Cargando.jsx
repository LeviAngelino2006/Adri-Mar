import { useContext, useEffect } from 'react';
import IconoVehiculo from '../IconoVehiculo';
import useEtapaCarga from '../../hooks/useEtapaCarga';
import { avisarCargaLenta } from '../../utils/etapaCarga';
import { CargaLentaContext } from './CargaLentaContext';

// Los esqueletos usan las clases reales: se importan sus estilos para que
// midan igual en cualquier pantalla (el historial, por ejemplo, no está en el
// Dashboard; la ficha de Documentación todavía no cargó TarjetaDocumento).
import '../Listado.css';
import '../FechaTile.css';
import '../../pages/Dashboard.css';
import '../documentacion/TarjetaDocumento.css';
import './Cargando.css';

// Estado de carga de una pantalla, panel o modal. Se monta solo mientras se
// está cargando: nada los primeros 300ms, después un esqueleto con la forma del
// contenido y, desde los 3s, el esqueleto se queda y el Layout muestra el
// colectivo con "Conectando con el servidor…".
// `forma`: 'tarjetas' (Flota y Usuarios), 'documentacion' (listado de
// Documentación: suma la línea de detalle), 'documentos' (ficha de
// Documentación: TarjetaDocumento), 'viajes' (Viajes y Mis viajes: grupo con
// título de día y bloque de fecha) o 'filas' (paneles del Dashboard e historial
// de un documento). `aislado`: dibuja su propio colectivo en lugar del
// esqueleto (en un modal, el de la página quedaría tapado). `encabezado` (solo
// con 'documentos'): 'resumen' suma el resumen y el título de la primera
// sección; 'completo', además el título y el subtítulo de la ficha.
function Cargando({ forma = 'tarjetas', cantidad = 3, aislado = false, encabezado = null }) {
  const etapa = useEtapaCarga(true);
  const contexto = useContext(CargaLentaContext);
  const enPagina = !aislado && contexto !== null;
  const sumar = enPagina ? contexto.sumar : null;
  const restar = enPagina ? contexto.restar : null;
  const lento = etapa === 'lento';

  useEffect(() => avisarCargaLenta(lento, sumar, restar), [lento, sumar, restar]);

  return (
    <ContenidoCarga
      etapa={enPagina && lento ? 'esqueleto' : etapa}
      forma={forma}
      cantidad={cantidad}
      encabezado={encabezado}
    />
  );
}

// El marcado de cada etapa, sin timers (lo usan los tests de render).
export function ContenidoCarga({ etapa, forma = 'tarjetas', cantidad = 3, encabezado = null }) {
  return (
    <div className="carga" role="status" aria-live="polite">
      {etapa !== 'oculto' && <span className="sr-only">Cargando…</span>}
      {etapa === 'esqueleto' && <Esqueleto forma={forma} cantidad={cantidad} encabezado={encabezado} />}
      {etapa === 'lento' && <CargaColectivo />}
    </div>
  );
}

// Barra gris dentro de una línea de texto: toma el alto de línea del componente
// real que la contiene.
const Barra = ({ ancho, className }) => (
  <span className={className ? `esqueleto-barra ${className}` : 'esqueleto-barra'} style={{ width: ancho }} />
);

// Mismas clases que el contenido real (ListadoCard, TarjetaViaje,
// TarjetaDocumento y las filas del Dashboard), con barras en lugar de texto:
// así mide lo mismo.
function Esqueleto({ forma, cantidad, encabezado }) {
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
  if (forma === 'documentos') {
    const documentos = (
      <div className="doc-tarjetas" aria-hidden="true">
        {items.map((i) => (
          <article key={i} className="doc-tarjeta esqueleto-documento">
            <div className="doc-tarjeta-info">
              <div className="doc-tarjeta-titulo">
                <h3 className="doc-tarjeta-nombre">
                  <Barra ancho="45%" />
                </h3>
                <span className="esqueleto-barra esqueleto-badge" />
              </div>
              <p className="doc-tarjeta-fechas">
                <Barra ancho="35%" />
              </p>
            </div>
            <div className="doc-tarjeta-acciones">
              <span className="esqueleto-barra esqueleto-boton" />
              <span className="esqueleto-barra esqueleto-boton" />
            </div>
          </article>
        ))}
      </div>
    );
    if (!encabezado) return documentos;
    // Lo que va arriba de las tarjetas en la ficha, con sus clases reales.
    return (
      <div aria-hidden="true">
        {encabezado === 'completo' && (
          <>
            <div className="doc-ficha-header">
              <h1>
                <Barra ancho="200px" />
              </h1>
            </div>
            <p className="doc-ficha-subtitulo">
              <Barra ancho="260px" />
            </p>
          </>
        )}
        <p className="doc-ficha-resumen">
          <Barra ancho="240px" />
        </p>
        <section className="doc-seccion">
          <h2 className="detalle-seccion-titulo doc-seccion-titulo">
            <Barra ancho="120px" />
          </h2>
          {documentos}
        </section>
      </div>
    );
  }
  const esViajes = forma === 'viajes';
  const tarjetas = (
    <div className="listado-cards" aria-hidden="true">
      {items.map((i) => (
        <div key={i} className={esViajes ? 'listado-card esqueleto-tarjeta esqueleto-viaje' : 'listado-card esqueleto-tarjeta'}>
          <div className={esViajes ? 'listado-card-marca fecha-tile' : 'listado-card-marca'} />
          <div className="listado-card-cuerpo">
            <div className="listado-card-top">
              {/* En viajes, la barra solo-mobile imita la ruta partida en dos
                  líneas en el celular (el pie se parte por CSS). */}
              <span className="listado-card-titulo">
                <Barra ancho="55%" />
                {esViajes && <Barra ancho="40%" className="esqueleto-solo-mobile" />}
              </span>
              <span className="esqueleto-barra esqueleto-badge" />
            </div>
            <div className="listado-card-sub">
              <Barra ancho="35%" />
            </div>
            {forma === 'documentacion' && (
              <div className="listado-card-detalle">
                <Barra ancho="50%" />
              </div>
            )}
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
  if (!esViajes) return tarjetas;
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
