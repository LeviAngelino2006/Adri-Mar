import { partesFechaTile } from '../utils/viajeFormato';
import './FechaTile.css';

// Día (dos dígitos) y mes de un instante, en hora de Córdoba. Va dentro de un
// contenedor con la clase `fecha-tile`: la marca de ListadoCard en la tarjeta de
// viaje, o FechaTile en Próximos viajes.
export function FechaTileTexto({ fecha }) {
  if (!fecha) return null;
  const { dia, mes } = partesFechaTile(fecha);
  return (
    <>
      <span className="fecha-tile-dia">{dia}</span>
      <span className="fecha-tile-mes">{mes}</span>
    </>
  );
}

// Bloque de fecha suelto. Es decorativo: la fecha ya está en el texto de al lado
// o en el título del grupo.
function FechaTile({ fecha }) {
  return (
    <div className="fecha-tile" aria-hidden="true">
      <FechaTileTexto fecha={fecha} />
    </div>
  );
}

export default FechaTile;
