import './Switch.css';

function Switch({ id, name, checked, onChange, disabled = false, 'aria-describedby': describedBy }) {
  return (
    <span className={`switch ${disabled ? 'switch-disabled' : ''}`.trim()}>
      <input
        type="checkbox"
        role="switch"
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-checked={checked}
        aria-describedby={describedBy}
        className="switch-input"
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </span>
  );
}

export default Switch;
