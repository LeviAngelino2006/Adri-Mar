import Spinner from './Spinner';
import './Button.css';

// Botón del design system. Con `href` se renderiza como enlace (<a>) con el
// mismo aspecto: para acciones que navegan afuera (WhatsApp, Google Maps) sin
// armar las clases .btn a mano. Un enlace no se puede deshabilitar: quien lo usa
// muestra un Button sin `href` y `disabled` cuando no hay a dónde ir.
function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  href,
  className = '',
  children,
  ...rest
}) {
  const clases = `btn btn-${variant} ${className}`.trim();

  if (href) {
    return (
      <a className={clases} href={href} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={clases}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" label="Procesando" />}
      <span>{children}</span>
    </button>
  );
}

export default Button;
