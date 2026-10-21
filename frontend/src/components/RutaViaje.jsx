import './RutaViaje.css';

const textoParadas = (cantidad) => `${cantidad} ${cantidad === 1 ? 'parada' : 'paradas'}`;

// Espacio que no se corta (U+00A0): pega la flecha al destino y "· 2 paradas" a
// la última palabra del destino.
const PEGADO = String.fromCharCode(0xa0);

const claseDePunto = (lugar) => (lugar ? 'ruta-viaje-punto' : 'ruta-viaje-punto ruta-viaje-punto-faltante');

// Recorrido de un viaje. Un lado sin dato (viaje histórico anterior a
// Origen/Destino) usa el mismo "No registrado" que la ficha de detalle,
// atenuado para que no parezca un nombre de lugar real.
//
// `paradas` son las de la API ([{ orden, ubicacion: { nombre } }], ya ordenadas).
//
//  - variante "resumen" (por defecto), para listados y tarjetas:
//    "Río Tercero → Córdoba · 2 paradas". Sin paradas queda "Río Tercero →
//    Córdoba". Si no entra en una línea corta de forma prolija: solo antes de
//    la flecha o entre palabras de un nombre. La flecha nunca queda al final de
//    una línea (va pegada al destino) y "· 2 paradas" nunca queda sola (va
//    pegada a la última palabra del destino).
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
      <span className={claseDePunto(origen)}>{origen?.nombre || 'No registrado'}</span>{' '}
      <span className="ruta-viaje-flecha">→</span>
      {PEGADO}
      <span className={claseDePunto(destino)}>{destino?.nombre || 'No registrado'}</span>
      {paradas.length > 0 && (
        <>
          {PEGADO}
          <span className="ruta-viaje-paradas">
            ·{PEGADO}
            {textoParadas(paradas.length)}
          </span>
        </>
      )}
    </span>
  );
}

export default RutaViaje;
