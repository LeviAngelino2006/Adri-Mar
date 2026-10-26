import Button from './ui/Button';
import ControlSegmentado from './ui/ControlSegmentado';
import './Listado.css';

// Piezas del patrón único de listado (ver docs/design-system, componente
// Listado): título oculto, barra de herramientas y tarjeta. Las pantallas las
// arman con estas tres piezas y ponen solo el contenido que les corresponde.

const ICONO_LUPA = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const ICONO_FILTRO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="4 4 20 4 14 12.5 14 19 10 21 10 12.5 4 4" />
  </svg>
);

// Los listados no muestran título (la sección ya está marcada en la navegación
// y, en mobile, en la topbar), pero la página sigue teniendo su h1 para los
// lectores de pantalla. El texto es el mismo del ítem de navegación.
export function ListadoHeader({ titulo }) {
  return <h1 className="sr-only">{titulo}</h1>;
}

// Barra única de todos los listados: a la izquierda el buscador (con lupa) y el
// botón "Filtros" con el contador de filtros activos; a la derecha de todo, el
// control de vistas y, al final, la acción principal. Cada pantalla pasa solo lo
// que usa; el orden y la posición son siempre los mismos:
//   busqueda: { valor, onChange(texto), placeholder, maxLength? }
//   filtros:  { abierto, onToggle(), activos }
//   vistas:   las props de ControlSegmentado (Documentación: Vehículos | Choferes;
//             Mantenimiento: Service | Arreglos | Historial)
//   accion:   { etiqueta, onClick } ("Crear vehículo"); debajo de 640px se ve
//             solo el "+" y la etiqueta queda para los lectores de pantalla.
export function ListadoToolbar({ busqueda, filtros, vistas, accion }) {
  return (
    <div className="listado-toolbar">
      {busqueda && (
        <div className="listado-buscar">
          {ICONO_LUPA}
          <input
            type="text"
            value={busqueda.valor}
            onChange={(e) => busqueda.onChange(e.target.value)}
            placeholder={busqueda.placeholder}
            aria-label={busqueda.placeholder}
            maxLength={busqueda.maxLength}
          />
        </div>
      )}
      {filtros && (
        <button type="button" className="filtros-toggle-btn" aria-expanded={filtros.abierto} onClick={filtros.onToggle}>
          {ICONO_FILTRO}
          Filtros
          {filtros.activos > 0 && <span className="filtros-toggle-badge">{filtros.activos}</span>}
        </button>
      )}
      {vistas && <ControlSegmentado {...vistas} />}
      {accion && (
        <Button variant="primary" className="listado-accion" aria-label={accion.etiqueta} onClick={accion.onClick}>
          <span className="listado-accion-signo" aria-hidden="true">
            +
          </span>
          <span className="listado-accion-texto">{accion.etiqueta}</span>
        </Button>
      )}
    </div>
  );
}

// Tarjeta del listado: marca (ícono, Avatar o bloque de fecha), cuerpo con
// título + estado, una bajada opcional en gris debajo del título (el cliente en
// la tarjeta de viaje de gestión), dato principal, detalle opcional y pie (lista
// de datos, separados a los lados). `marcaClassName` suma una clase a la marca (la tarjeta
// de viaje usa `fecha-tile`) y `className`, a la tarjeta (`listado-card-viaje`).
// Sin `onClick` es una tarjeta de solo lectura (un `div`, sin hover ni foco).
export function ListadoCard({
  className,
  marca,
  marcaClassName,
  marcaSinFondo = false,
  titulo,
  estado,
  bajada,
  sub,
  detalle,
  pie,
  onClick,
}) {
  const Contenedor = onClick ? 'button' : 'div';
  return (
    <Contenedor
      type={onClick ? 'button' : undefined}
      className={className ? `listado-card ${className}` : 'listado-card'}
      onClick={onClick}
    >
      <div
        className={marcaClassName ? `listado-card-marca ${marcaClassName}` : 'listado-card-marca'}
        style={marcaSinFondo ? { background: 'none' } : undefined}
        aria-hidden={marcaClassName ? 'true' : undefined}
      >
        {marca}
      </div>
      <div className="listado-card-cuerpo">
        <div className="listado-card-top">
          <span className="listado-card-titulo">{titulo}</span>
          {estado}
        </div>
        {bajada && <div className="listado-card-bajada">{bajada}</div>}
        <div className="listado-card-sub">{sub}</div>
        {detalle && <div className="listado-card-detalle">{detalle}</div>}
        <div className="listado-card-pie">
          {pie.map((dato, indice) => (
            <span key={indice}>{dato}</span>
          ))}
        </div>
      </div>
    </Contenedor>
  );
}
