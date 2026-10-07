import './EstadoBadge.css';

// Pastilla de estado para tarjetas y fichas, donde el estado es el dato
// principal. En tablas densas se sigue usando EstadoDot.
// tono: brand | success | warning | error | neutral (ver constants/estados*).
function EstadoBadge({ tono = 'neutral', size = 'md', children }) {
  return (
    <span className={`estado-badge estado-badge-${tono} estado-badge-${size}`}>
      <span className="estado-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export default EstadoBadge;
