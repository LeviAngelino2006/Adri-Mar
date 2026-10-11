import IconoVehiculo from '../IconoVehiculo';
import useEtapaCarga from '../../hooks/useEtapaCarga';
import './Cargando.css';

// Estado de carga de una pantalla, panel o modal. Se monta solo mientras se
// está cargando: nada los primeros 300ms, después un esqueleto con la forma del
// contenido y, desde los 3s, el colectivo con "Conectando con el servidor…".
// `forma`: 'tarjetas' (anatomía de .listado-card) o 'filas' (paneles del
// Dashboard e historial de un documento).
function Cargando({ forma = 'tarjetas', cantidad = 3 }) {
  const etapa = useEtapaCarga(true);
  return <ContenidoCarga etapa={etapa} forma={forma} cantidad={cantidad} />;
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

function Esqueleto({ forma, cantidad }) {
  const items = Array.from({ length: cantidad }, (_, i) => i);
  if (forma === 'filas') {
    return (
      <div aria-hidden="true">
        {items.map((i) => (
          <div key={i} className="esqueleto-fila">
            <span className="esqueleto esqueleto-hora" />
            <div className="esqueleto-cuerpo">
              <span className="esqueleto esqueleto-linea esqueleto-linea-titulo" />
              <span className="esqueleto esqueleto-linea esqueleto-linea-sub" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="esqueleto-tarjetas" aria-hidden="true">
      {items.map((i) => (
        <div key={i} className="esqueleto-tarjeta">
          <span className="esqueleto esqueleto-marca" />
          <div className="esqueleto-cuerpo">
            <span className="esqueleto esqueleto-linea esqueleto-linea-titulo" />
            <span className="esqueleto esqueleto-linea esqueleto-linea-sub" />
            <span className="esqueleto esqueleto-linea esqueleto-linea-pie" />
          </div>
        </div>
      ))}
    </div>
  );
}

// El colectivo andando, para cargas que tardan más de 3s. La variante chica es
// para el login, debajo del formulario.
export function CargaColectivo({ chica = false }) {
  return (
    <div className={chica ? 'carga-colectivo carga-colectivo-chica' : 'carga-colectivo'}>
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
