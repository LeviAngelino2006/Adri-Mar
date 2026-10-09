import './Toast.css';

// `action` es opcional: un enlace o botón secundario (por ejemplo "Avisar por
// WhatsApp") que va a la derecha del texto. Un toast con acción tiene que durar
// más en pantalla (ver constants/toast.js).
function Toast({ children, action }) {
  return (
    <div className="toast" role="status">
      <span>{children}</span>
      {action && <span className="toast-accion">{action}</span>}
    </div>
  );
}

export default Toast;
