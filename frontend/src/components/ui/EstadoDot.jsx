import './EstadoDot.css';

function EstadoDot({ color, size = 'sm', children }) {
  return (
    <span className={`estado-dot-label estado-dot-label-${size}`}>
      <span className="estado-dot" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export default EstadoDot;
