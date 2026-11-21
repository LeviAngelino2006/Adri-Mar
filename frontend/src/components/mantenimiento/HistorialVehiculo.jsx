import { useCallback, useId, useState } from 'react';
import Button from '../ui/Button';
import EstadoBadge from '../ui/EstadoBadge';
import EstadoCarga, { ErrorCarga } from '../ui/EstadoCarga';
import { useCarga } from '../../hooks/useCarga';
import { listarHistorial } from '../../services/mantenimientoApi';
import { POR_PAGINA_HISTORIAL } from '../../constants/mantenimiento';
import { mensajeErrorCarga } from '../../utils/errorCarga';
import { formatearFechaCorta, formatearKm } from '../../utils/viajeFormato';
import { textoRegistro, textoTiposArreglo, textoTrabajos } from '../../utils/mantenimiento';
import DetalleRegistro from './DetalleRegistro';

const ICONO_FLECHA = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// Un service o un arreglo del historial: una fila que se expande en el mismo
// lugar con todos sus datos (DetalleRegistro), sin abrir otro modal.
export function ItemHistorial({ registro, abierto, onAlternar }) {
  const idDetalle = useId();
  const esService = registro.tipo === 'SERVICE';
  return (
    <li className={abierto ? 'historial-item is-abierto' : 'historial-item'}>
      <button
        type="button"
        className="historial-item-fila"
        aria-expanded={abierto}
        aria-controls={idDetalle}
        onClick={() => onAlternar(registro.id)}
      >
        <span className="historial-item-top">
          <span className="historial-item-fecha">{formatearFechaCorta(registro.fecha)}</span>
          {esService ? (
            <EstadoBadge tono="brand" size="sm">
              Service
            </EstadoBadge>
          ) : (
            <EstadoBadge tono="neutral" size="sm">
              {/* Con tope de ancho: un "¿Qué trabajo?" largo no aprieta la fila. */}
              <span className="historial-badge-tipos" title={textoTrabajos(registro) || undefined}>
                {textoTiposArreglo(registro)}
              </span>
            </EstadoBadge>
          )}
          <span className="historial-item-km num">{formatearKm(registro.kilometraje)} km</span>
          <span className="historial-item-flecha">{ICONO_FLECHA}</span>
        </span>
        <span className="historial-item-sub">{textoRegistro(registro)}</span>
      </button>
      {abierto && (
        <div className="historial-item-detalle">
          <DetalleRegistro registro={registro} id={idDetalle} />
        </div>
      )}
    </li>
  );
}

// Historial del vehículo del panel: services y arreglos juntos, del más reciente
// al más antiguo (GET /mantenimientos/historial?vehiculoId=…&orden=fecha_desc).
// "Ver más" trae la página siguiente y la suma abajo. `abiertoInicial`: el id de
// un registro que arranca expandido (el que se acaba de cargar). Se pueden
// tener varios abiertos a la vez.
function HistorialVehiculo({ vehiculoId, abiertoInicial = null }) {
  const [abiertos, setAbiertos] = useState(() => new Set(abiertoInicial ? [abiertoInicial] : []));
  // Páginas siguientes (la primera la trae useCarga).
  const [mas, setMas] = useState({ items: [], pagina: 1, cargando: false, error: null });

  const consulta = useCallback(
    (pagina) =>
      listarHistorial({ vehiculoId, orden: 'fecha_desc', pagina, porPagina: POR_PAGINA_HISTORIAL }).then(({ data }) => data),
    [vehiculoId]
  );
  const carga = useCarga(useCallback(() => consulta(1), [consulta]));

  const items = carga.datos ? [...carga.datos.items, ...mas.items] : [];
  const total = carga.datos?.total ?? 0;
  const quedan = total - items.length;

  function cargarMas() {
    const pagina = mas.pagina + 1;
    setMas((actual) => ({ ...actual, cargando: true, error: null }));
    consulta(pagina).then(
      (datos) => setMas((actual) => ({ items: [...actual.items, ...datos.items], pagina, cargando: false, error: null })),
      (error) => setMas((actual) => ({ ...actual, cargando: false, error }))
    );
  }

  function alternar(id) {
    setAbiertos((actuales) => {
      const nuevos = new Set(actuales);
      if (nuevos.has(id)) nuevos.delete(id);
      else nuevos.add(id);
      return nuevos;
    });
  }

  return (
    <section className="historial-vehiculo" aria-labelledby="historial-vehiculo-titulo">
      <h3 id="historial-vehiculo-titulo" className="mantenimiento-panel-seccion">
        Historial
      </h3>
      <EstadoCarga
        carga={carga}
        forma="filas"
        que="el historial"
        vacio={items.length === 0 && <p className="historial-vacio">Todavía no hay services ni arreglos de este vehículo.</p>}
      >
        <p className="mantenimiento-resumen">{total === 1 ? '1 registro' : `${total} registros`}</p>
        <ul className="historial-lista">
          {items.map((registro) => (
            <ItemHistorial key={registro.id} registro={registro} abierto={abiertos.has(registro.id)} onAlternar={alternar} />
          ))}
        </ul>
        {mas.error && <ErrorCarga mensaje={mensajeErrorCarga(mas.error, 'más registros')} onReintentar={cargarMas} />}
        {quedan > 0 && !mas.error && (
          <Button variant="secondary" className="historial-ver-mas" onClick={cargarMas} loading={mas.cargando}>
            {mas.cargando ? 'Cargando…' : 'Ver más'}
          </Button>
        )}
      </EstadoCarga>
    </section>
  );
}

export default HistorialVehiculo;
