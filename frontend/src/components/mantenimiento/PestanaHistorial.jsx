import { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import EstadoBadge from '../ui/EstadoBadge';
import EstadoCarga, { ErrorCarga } from '../ui/EstadoCarga';
import FormField from '../ui/FormField';
import { FechaTileTexto } from '../FechaTile';
import { ListadoCard, ListadoToolbar } from '../Listado';
import { useCarga } from '../../hooks/useCarga';
import { listarHistorial, listarTiposArreglo } from '../../services/mantenimientoApi';
import { ESTADOS_SERVICE, ORDENES_HISTORIAL, POR_PAGINA_HISTORIAL, TIPOS_REGISTRO } from '../../constants/mantenimiento';
import { ESTADOS_VEHICULO } from '../../constants/estadosVehiculo';
import { mensajeErrorCarga } from '../../utils/errorCarga';
import { formatearFechaCorta } from '../../utils/viajeFormato';
import { detalleEstadoService, detalleRegistro, pieRegistro, textoRegistro } from '../../utils/mantenimiento';

const DEMORA_BUSQUEDA_MS = 300;
const FILTROS_VACIOS = { tipo: '', tipoArregloId: '', tipoVehiculoId: '', desde: '', hasta: '' };

// Un service o un arreglo. Es de solo lectura: no abre ninguna ficha.
export function TarjetaRegistro({ registro }) {
  const { vehiculo } = registro;
  return (
    <ListadoCard
      marca={<FechaTileTexto fecha={registro.fecha} />}
      marcaClassName="fecha-tile"
      titulo={
        <>
          {/* El bloque de fecha es decorativo: la fecha completa va para los lectores de pantalla. */}
          <span className="sr-only">{formatearFechaCorta(registro.fecha)}: </span>
          {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
        </>
      }
      estado={
        registro.tipo === 'SERVICE' ? (
          <EstadoBadge tono="brand" size="sm">
            Service
          </EstadoBadge>
        ) : (
          <EstadoBadge tono="neutral" size="sm">
            {registro.tipoArreglo?.nombre ?? 'Arreglo'}
          </EstadoBadge>
        )
      }
      sub={textoRegistro(registro)}
      detalle={detalleRegistro(registro) || undefined}
      pie={[pieRegistro(registro), registro.usuario ? `Registró: ${registro.usuario}` : null].filter(Boolean)}
    />
  );
}

// Encabezado cuando el historial está filtrado por un vehículo (?vehiculoId=):
// el vehículo, el estado de su service y cómo volver a toda la flota.
function EncabezadoVehiculo({ estadoService, onQuitar }) {
  const { vehiculo } = estadoService;
  const dadoDeBaja = vehiculo.estado === 'DADO_DE_BAJA';
  const estado = dadoDeBaja ? ESTADOS_VEHICULO.DADO_DE_BAJA : ESTADOS_SERVICE[estadoService.estado];
  return (
    <div className="historial-vehiculo">
      <div className="historial-vehiculo-datos">
        <div className="historial-vehiculo-top">
          <span className="historial-vehiculo-titulo">
            {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
          </span>
          <EstadoBadge tono={estado.tono} size="sm">
            {estado.label}
          </EstadoBadge>
        </div>
        <p className="historial-vehiculo-sub">
          {vehiculo.marca} {vehiculo.modelo}
          {!dadoDeBaja && ` · ${detalleEstadoService(estadoService)}`}
        </p>
      </div>
      <Button variant="secondary" onClick={onQuitar}>
        Ver toda la flota
      </Button>
    </div>
  );
}

// Pestaña Historial: services y arreglos de toda la flota. El filtrado, el
// orden y el paginado los hace el backend (el historial crece sin límite);
// "Ver más" trae la página siguiente y la suma abajo.
function PestanaHistorial({ vehiculoId, onQuitarVehiculo, tiposVehiculo, vistas }) {
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [orden, setOrden] = useState('fecha_desc');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  // Páginas siguientes de la consulta actual. Se guardan junto con el pedido al
  // que pertenecen: si cambian los filtros, quedan descartadas solas.
  const [mas, setMas] = useState({ pedir: null, items: [], pagina: 1, cargando: false, error: null });

  const cargaTipos = useCarga(useCallback(() => listarTiposArreglo().then(({ data }) => data.tiposArreglo), []));

  // La búsqueda va al backend: se espera a que se deje de escribir.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusquedaAplicada(busqueda.trim()), DEMORA_BUSQUEDA_MS);
    return () => clearTimeout(temporizador);
  }, [busqueda]);

  const consulta = useCallback(
    (pagina) =>
      listarHistorial({
        ...filtros,
        tipoArregloId: filtros.tipo === 'SERVICE' ? '' : filtros.tipoArregloId,
        busqueda: busquedaAplicada,
        vehiculoId: vehiculoId ?? '',
        orden,
        pagina,
        porPagina: POR_PAGINA_HISTORIAL,
      }).then(({ data }) => data),
    [filtros, busquedaAplicada, vehiculoId, orden]
  );
  const pedir = useCallback(() => consulta(1), [consulta]);
  const carga = useCarga(pedir);

  const extra = mas.pedir === pedir ? mas : { items: [], pagina: 1, cargando: false, error: null };
  const items = carga.datos ? [...carga.datos.items, ...extra.items] : [];
  const total = carga.datos?.total ?? 0;
  const quedan = total - items.length;

  function cargarMas() {
    const pagina = extra.pagina + 1;
    setMas({ ...extra, pedir, cargando: true, error: null });
    consulta(pagina).then(
      (datos) =>
        setMas((actual) =>
          actual.pedir === pedir ? { pedir, items: [...actual.items, ...datos.items], pagina, cargando: false, error: null } : actual
        ),
      (error) => setMas((actual) => (actual.pedir === pedir ? { ...actual, cargando: false, error } : actual))
    );
  }

  function cambiarFiltro(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  }

  const activos = Object.entries(filtros).filter(
    ([campo, valor]) => valor && !(campo === 'tipoArregloId' && filtros.tipo === 'SERVICE')
  ).length;
  const hayFiltros = activos > 0 || busquedaAplicada || vehiculoId;
  const estadoVehiculo = carga.datos?.vehiculo;

  return (
    <>
      <ListadoToolbar
        busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar vehículo por interno, dominio, marca o modelo' }}
        filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos }}
        vistas={vistas}
        vistasAlInicio
      />

      {mostrarFiltros && (
        <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
          <FormField id="historial-filtro-tipo" label="Tipo">
            <select value={filtros.tipo} onChange={(e) => cambiarFiltro('tipo', e.target.value)}>
              {TIPOS_REGISTRO.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </FormField>
          {filtros.tipo !== 'SERVICE' && (
            <FormField
              id="historial-filtro-arreglo"
              label="Tipo de arreglo"
              error={cargaTipos.error ? mensajeErrorCarga(cargaTipos.error, 'los tipos de arreglo') : undefined}
            >
              <select value={filtros.tipoArregloId} onChange={(e) => cambiarFiltro('tipoArregloId', e.target.value)}>
                <option value="">Todos</option>
                {(cargaTipos.datos ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField id="historial-filtro-vehiculo" label="Tipo de vehículo">
            <select value={filtros.tipoVehiculoId} onChange={(e) => cambiarFiltro('tipoVehiculoId', e.target.value)}>
              <option value="">Todos</option>
              {tiposVehiculo.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.descripcion}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="historial-filtro-desde" label="Desde">
            <input type="date" value={filtros.desde} onChange={(e) => cambiarFiltro('desde', e.target.value)} />
          </FormField>
          <FormField id="historial-filtro-hasta" label="Hasta">
            <input type="date" value={filtros.hasta} onChange={(e) => cambiarFiltro('hasta', e.target.value)} />
          </FormField>
          <FormField id="historial-filtro-orden" label="Ordenar por">
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              {ORDENES_HISTORIAL.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </FormField>
        </form>
      )}

      {estadoVehiculo && <EncabezadoVehiculo estadoService={estadoVehiculo} onQuitar={onQuitarVehiculo} />}

      <EstadoCarga
        carga={carga}
        forma="viajes"
        que="el historial"
        vacio={
          items.length === 0 && (
            <div className="listado-vacio">
              {hayFiltros ? 'No hay registros con esos filtros.' : 'Todavía no hay services ni arreglos registrados.'}
            </div>
          )
        }
      >
        <p className="historial-resumen">{total === 1 ? '1 registro' : `${total} registros`}</p>
        <div className="listado-cards">
          {items.map((registro) => (
            <TarjetaRegistro key={registro.id} registro={registro} />
          ))}
        </div>
        {extra.error && <ErrorCarga mensaje={mensajeErrorCarga(extra.error, 'más registros')} onReintentar={cargarMas} />}
        {quedan > 0 && !extra.error && (
          <Button variant="secondary" className="historial-ver-mas" onClick={cargarMas} loading={extra.cargando}>
            {extra.cargando ? 'Cargando…' : 'Ver más'}
          </Button>
        )}
      </EstadoCarga>
    </>
  );
}

export default PestanaHistorial;
