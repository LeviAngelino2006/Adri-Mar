import './RutaViaje.css';

// "Origen → Destino" de un viaje. Un lado sin dato (viaje histórico anterior
// a Origen/Destino) usa el mismo "No registrado" que la ficha de detalle,
// atenuado para que no parezca un nombre de lugar real.
function RutaViaje({ origen, destino }) {
  return (
    <span className="ruta-viaje">
      <span className={origen ? 'ruta-viaje-punto' : 'ruta-viaje-punto ruta-viaje-punto-faltante'}>
        {origen?.nombre || 'No registrado'}
      </span>
      <span className="ruta-viaje-flecha">→</span>
      <span className={destino ? 'ruta-viaje-punto' : 'ruta-viaje-punto ruta-viaje-punto-faltante'}>
        {destino?.nombre || 'No registrado'}
      </span>
    </span>
  );
}

export default RutaViaje;
