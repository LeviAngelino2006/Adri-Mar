import './RutaViaje.css';

const textoParadas = (cantidad) => `${cantidad} ${cantidad === 1 ? 'parada' : 'paradas'}`;

const claseDePunto = (lugar) => (lugar ? 'ruta-viaje-punto' : 'ruta-viaje-punto ruta-viaje-punto-faltante');

// Recorrido de un viaje. Un lado sin dato (viaje histórico anterior a
// Origen/Destino) usa el mismo "No registrado" que la ficha de detalle,
// atenuado para que no parezca un nombre de lugar real.
//
// `paradas` son las de la API ([{ orden, ubicacion: { nombre } }], ya ordenadas).
//
//  - variante "resumen" (por defecto), para listados y tarjetas, en una línea:
//    "Río Tercero → Córdoba · 2 paradas". Sin paradas queda "Río Tercero →
//    Córdoba".
//  - variante "completa", para el detalle: la secuencia entera en vertical, con
//    el origen, cada parada numerada y el destino.
function RutaViaje({ origen, destino, paradas = [], variante = 'resumen' }) {
  if (variante === 'completa') {
    return (
      <ol className="ruta-viaje-completa" aria-label="Recorrido del viaje">
        <li className="ruta-viaje-paso ruta-viaje-paso-extremo">
          <span className="ruta-viaje-paso-rol">Origen</span>
          <span className={claseDePunto(origen)}>{origen?.nombre || 'No registrado'}</span>
        </li>

        {paradas.map((parada) => (
          <li key={parada.orden} className="ruta-viaje-paso">
            <span className="ruta-viaje-paso-rol">Parada {parada.orden}</span>
            <span className="ruta-viaje-punto">{parada.ubicacion.nombre}</span>
          </li>
        ))}

        <li className="ruta-viaje-paso ruta-viaje-paso-extremo">
          <span className="ruta-viaje-paso-rol">Destino</span>
          <span className={claseDePunto(destino)}>{destino?.nombre || 'No registrado'}</span>
        </li>
      </ol>
    );
  }

  return (
    <span className="ruta-viaje">
      <span className={claseDePunto(origen)}>{origen?.nombre || 'No registrado'}</span>
      <span className="ruta-viaje-flecha">→</span>
      <span className={claseDePunto(destino)}>{destino?.nombre || 'No registrado'}</span>
      {paradas.length > 0 && <span className="ruta-viaje-paradas">· {textoParadas(paradas.length)}</span>}
    </span>
  );
}

export default RutaViaje;
