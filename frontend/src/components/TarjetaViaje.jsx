import { ListadoCard } from './Listado';
import EstadoBadge from './ui/EstadoBadge';
import RutaViaje from './RutaViaje';
import { FechaTileTexto } from './FechaTile';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearHorarioViaje, formatearKm, nombreChofer } from '../utils/viajeFormato';
import { agruparViajesPorDia } from '../utils/viajesPorDia';

// Tarjeta de un viaje en el listado: la usan Viajes y Mis viajes. Los viajes van
// agrupados por día, así que la marca es el bloque de fecha del día de inicio y
// el sub lleva solo el horario.
//
// variante="chofer" es la vista de Mis viajes de un chofer: el sub es solo el
// horario, sin el chofer (es él mismo). Sin variante (Viajes, y Mis viajes de un
// gestor) el sub suma el chofer: "07:30 – 10:00 · Martín Gómez".
function TarjetaViaje({ viaje, onClick, variante }) {
  const { chofer, vehiculo, fechaInicio, fechaFin, kilometrosEstimados } = viaje;
  const vistaChofer = variante === 'chofer';

  const horario = fechaInicio ? formatearHorarioViaje(fechaInicio, fechaFin) : 'Fechas pendientes';
  const sub = vistaChofer ? horario : `${horario} · ${chofer ? nombreChofer(chofer) : 'Chofer pendiente'}`;

  const vehiculoTexto = vehiculo ? (
    <>
      {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span> · {vehiculo.marca}{' '}
      {vehiculo.modelo}
    </>
  ) : (
    'Vehículo pendiente'
  );

  return (
    <ListadoCard
      marca={<FechaTileTexto fecha={fechaInicio} />}
      marcaClassName="fecha-tile"
      titulo={<RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} />}
      estado={
        <EstadoBadge tono={ESTADOS_VIAJE[viaje.estado].tono} size="sm">
          {ESTADOS_VIAJE[viaje.estado].label}
        </EstadoBadge>
      }
      sub={sub}
      pie={[
        vehiculoTexto,
        kilometrosEstimados != null ? `${formatearKm(kilometrosEstimados)} km estimados` : 'Km pendientes',
      ]}
      onClick={onClick}
    />
  );
}

// Listado de Viajes y Mis viajes: las tarjetas agrupadas por día de inicio (día
// de Córdoba), en el orden en que llegan ("Hoy · vie 9 oct", "mié 7 oct").
export function ListadoViajesPorDia({ viajes, variante, onSeleccionar }) {
  return agruparViajesPorDia(viajes).map((grupo) => (
    <section key={grupo.dia ?? 'sin-fecha'} className="listado-grupo">
      <h2 className="listado-dia">{grupo.titulo}</h2>
      <div className="listado-cards">
        {grupo.viajes.map((v) => (
          <TarjetaViaje key={v.id} viaje={v} variante={variante} onClick={() => onSeleccionar(v)} />
        ))}
      </div>
    </section>
  ));
}

export default TarjetaViaje;
