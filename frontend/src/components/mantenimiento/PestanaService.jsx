import { useState } from 'react';
import EstadoBadge from '../ui/EstadoBadge';
import EstadoCarga from '../ui/EstadoCarga';
import FormField from '../ui/FormField';
import IconoVehiculo from '../IconoVehiculo';
import { ListadoCard, ListadoToolbar } from '../Listado';
import { ESTADOS_SERVICE, ORDENES_SERVICE } from '../../constants/mantenimiento';
import { formatearKm } from '../../utils/viajeFormato';
import {
  detalleEstadoService,
  filtrarEstadoService,
  ordenarEstadoService,
  textoIntervalo,
} from '../../utils/mantenimiento';

const FILTRO_ESTADO = [{ value: '', label: 'Todos' }, ...Object.entries(ESTADOS_SERVICE).map(([value, { label }]) => ({ value, label }))];

// Avance hacia el próximo service: la fracción del intervalo recorrida (llena
// al llegar o pasar el service). El color va de verde a rojo con el avance.
function BarraService({ porcentajeConsumido }) {
  const avance = Math.min(1, Math.max(0, porcentajeConsumido ?? 0));
  const porcentaje = Math.round(avance * 100);
  return (
    <span
      className="service-barra"
      role="progressbar"
      aria-label="Intervalo de service recorrido"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
      style={{ '--avance': avance }}
    >
      <span className="service-barra-fill" style={{ width: `${porcentaje}%` }} />
    </span>
  );
}

// Tarjeta del estado del service de un vehículo. Con plan, el click abre
// "Registrar service"; sin plan, "Asignar plan".
export function TarjetaService({ item, onClick }) {
  const { vehiculo } = item;
  const estado = ESTADOS_SERVICE[item.estado];
  return (
    <ListadoCard
      marca={<IconoVehiculo tipo={vehiculo.tipoVehiculo} />}
      titulo={
        <>
          {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
        </>
      }
      estado={
        <EstadoBadge tono={estado.tono} size="sm">
          {estado.label}
        </EstadoBadge>
      }
      sub={`${vehiculo.marca} ${vehiculo.modelo}`}
      detalle={
        item.estado === 'SIN_PLAN' ? (
          detalleEstadoService(item)
        ) : (
          <>
            {detalleEstadoService(item)}
            <BarraService porcentajeConsumido={item.porcentajeConsumido} />
          </>
        )
      }
      pie={[
        textoIntervalo(item),
        item.plan ? `Último: ${formatearKm(item.plan.kmUltimoService)} km` : `Odómetro: ${formatearKm(vehiculo.kilometraje)} km`,
      ]}
      onClick={onClick}
    />
  );
}

// Pestaña Service: el estado del service de cada vehículo, con buscador,
// filtros (estado y tipo de vehículo) y orden. Sin acción en la barra: el
// service se registra tocando la tarjeta del vehículo (que ya lo trae elegido). Los datos los carga la página
// (también los usan Arreglos y el contador de alertas); acá solo se filtran y
// ordenan, porque son pocos vehículos.
function PestanaService({ carga, tiposVehiculo, vistas, onRegistrar, onAsignar }) {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [tipoVehiculoId, setTipoVehiculoId] = useState('');
  const [orden, setOrden] = useState('urgencia');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const items = carga.datos ?? [];
  const visibles = ordenarEstadoService(filtrarEstadoService(items, { busqueda, estado, tipoVehiculoId }), orden);
  const activos = [estado, tipoVehiculoId].filter(Boolean).length;

  return (
    <>
      <ListadoToolbar
        busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar por interno, dominio, marca o modelo' }}
        filtros={{ abierto: mostrarFiltros, onToggle: () => setMostrarFiltros((m) => !m), activos }}
        vistas={vistas}
        vistasAlInicio
      />

      {mostrarFiltros && (
        <form className="listado-filtros" onSubmit={(e) => e.preventDefault()}>
          <FormField id="service-filtro-estado" label="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              {FILTRO_ESTADO.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="service-filtro-tipo" label="Tipo de vehículo">
            <select value={tipoVehiculoId} onChange={(e) => setTipoVehiculoId(e.target.value)}>
              <option value="">Todos</option>
              {tiposVehiculo.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.descripcion}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="service-filtro-orden" label="Ordenar por">
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              {ORDENES_SERVICE.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </FormField>
        </form>
      )}

      <EstadoCarga
        carga={carga}
        forma="documentacion"
        que="el estado del service"
        vacio={
          visibles.length === 0 && (
            <div className="listado-vacio">
              {items.length === 0 ? 'No hay vehículos en la flota.' : 'No hay vehículos con esos filtros.'}
            </div>
          )
        }
      >
        <div className="listado-cards">
          {visibles.map((item) => (
            <TarjetaService
              key={item.vehiculo.id}
              item={item}
              onClick={() => (item.estado === 'SIN_PLAN' ? onAsignar(item) : onRegistrar(item))}
            />
          ))}
        </div>
      </EstadoCarga>
    </>
  );
}

export default PestanaService;
