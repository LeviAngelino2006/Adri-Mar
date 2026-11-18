import { cloneElement } from 'react';
import AyudaTooltip from './AyudaTooltip.jsx';
import './FormField.css';

// `ayuda`: texto estático de formato o explicación; va en un tooltip junto al
// label. `hint`: texto que tiene que quedar a la vista (datos del registro,
// estado de carga); va debajo del campo y se oculta si hay error.
function FormField({ id, label, error, hint, ayuda, required, children }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const ayudaId = ayuda ? `${id}-ayuda` : undefined;
  const describedBy = [ayudaId, hintId, errorId].filter(Boolean).join(' ') || undefined;

  const field = cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required ? true : undefined,
  });

  const etiqueta = (
    <label htmlFor={id}>
      {label}
      {required && (
        <span className="form-field-required" aria-hidden="true">
          {' *'}
        </span>
      )}
    </label>
  );

  return (
    <div className="form-field">
      {ayuda ? (
        // El ícono va fuera del <label>: adentro sumaría "Más información"
        // al nombre accesible del campo.
        <div className="form-field-label-fila">
          {etiqueta}
          <AyudaTooltip id={ayudaId} texto={ayuda} />
        </div>
      ) : (
        etiqueta
      )}
      {field}
      {hint && !error && (
        <p id={hintId} className="form-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="form-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
