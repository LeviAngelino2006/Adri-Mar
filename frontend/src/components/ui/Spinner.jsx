import './Spinner.css';

function Spinner({ size = 'md', label = 'Cargando…' }) {
  return (
    <span className={`spinner spinner-${size}`} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;
