import { useState } from 'react';
import './InputContrasena.css';

const ICONO_OJO_ABIERTO = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ICONO_OJO_TACHADO = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

// Campo de contraseña con botón para mostrar/ocultar el texto. Propaga todas
// las props (incluido id, aria-invalid y aria-describedby de FormField) al
// <input> interno.
function InputContrasena({ className = '', type: _type, disabled, ...props }) {
  const [visible, setVisible] = useState(false);

  const clasesInput = className ? `input-contrasena-campo ${className}` : 'input-contrasena-campo';

  return (
    <div className="input-contrasena">
      <input {...props} type={visible ? 'text' : 'password'} disabled={disabled} className={clasesInput} />
      <button
        type="button"
        className="input-contrasena-toggle"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? ICONO_OJO_TACHADO : ICONO_OJO_ABIERTO}
      </button>
    </div>
  );
}

export default InputContrasena;
