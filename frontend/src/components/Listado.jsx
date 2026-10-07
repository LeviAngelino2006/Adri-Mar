import './Listado.css';

// Piezas del patrón único de listado (ver docs/design-system, componente
// Listado): encabezado, barra de herramientas y tarjeta. Las pantallas las
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

// h1 a la izquierda y, a la derecha, la acción principal (children).
export function ListadoHeader({ titulo, children }) {
  return (
    <div className="listado-header">
      <h1>{titulo}</h1>
      {children}
    </div>
  );
}

// Buscador (con lupa) y botón "Filtros" con el contador de filtros activos.
// Cada pantalla pasa solo lo que usa:
//   busqueda: { valor, onChange(texto), placeholder }
//   filtros:  { abierto, onToggle(), activos }
export function ListadoToolbar({ busqueda, filtros }) {
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
    </div>
  );
}

// Tarjeta del listado: marca (ícono o Avatar), cuerpo con título + estado,
// dato principal, detalle opcional y pie (lista de datos, separados a los lados).
export function ListadoCard({ marca, marcaSinFondo = false, titulo, estado, sub, detalle, pie, onClick }) {
  return (
    <button type="button" className="listado-card" onClick={onClick}>
      <div className="listado-card-marca" style={marcaSinFondo ? { background: 'none' } : undefined}>
        {marca}
      </div>
      <div className="listado-card-cuerpo">
        <div className="listado-card-top">
          <span className="listado-card-titulo">{titulo}</span>
          {estado}
        </div>
        <div className="listado-card-sub">{sub}</div>
        {detalle && <div className="listado-card-detalle">{detalle}</div>}
        <div className="listado-card-pie">
          {pie.map((dato, indice) => (
            <span key={indice}>{dato}</span>
          ))}
        </div>
      </div>
    </button>
  );
}
