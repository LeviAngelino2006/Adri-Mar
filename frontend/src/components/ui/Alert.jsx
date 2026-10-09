import './Alert.css';

const ROLES = {
  error: 'alert',
  success: 'status',
  info: 'status',
  warning: 'status',
};

function Alert({ variant = 'info', children }) {
  return (
    <div className={`alert alert-${variant}`} role={ROLES[variant]}>
      {children}
    </div>
  );
}

export default Alert;
