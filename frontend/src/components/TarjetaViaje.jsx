import { ListadoCard } from './Listado';
import EstadoBadge from './ui/EstadoBadge';
import RutaViaje from './RutaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { formatearKm, formatearRangoCompacto, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';

const ICONO_RUTA = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
  </svg>
);

// Tarjeta de un viaje en el listado: la usan Viajes y Mis viajes.
function TarjetaViaje({ viaje, onClick }) {
  const { chofer, vehiculo, fechaInicio, fechaFin, kilometrosEstimados } = viaje;

  return (
    <ListadoCard
      marca={ICONO_RUTA}
      titulo={chofer ? nombreChofer(chofer) : 'Chofer pendiente'}
      estado={
        <EstadoBadge tono={ESTADOS_VIAJE[viaje.estado].tono} size="sm">
          {ESTADOS_VIAJE[viaje.estado].label}
        </EstadoBadge>
      }
      sub={<RutaViaje origen={viaje.origen} destino={viaje.destino} />}
      detalle={vehiculo ? `${nombreVehiculo(vehiculo)} (${vehiculo.marca} ${vehiculo.modelo})` : 'Vehículo pendiente'}
      pie={[
        fechaInicio && fechaFin ? formatearRangoCompacto(fechaInicio, fechaFin) : 'Fechas pendientes',
        kilometrosEstimados != null ? `${formatearKm(kilometrosEstimados)} km estimados` : 'Km pendientes',
      ]}
      onClick={onClick}
    />
  );
}

export default TarjetaViaje;
