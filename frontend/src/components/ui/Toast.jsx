import './Toast.css';

function Toast({ children }) {
  return (
    <div className="toast" role="status">
      {children}
    </div>
  );
}

export default Toast;
