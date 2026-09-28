import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children, perfiles }) {
  const { usuario } = useAuth();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (perfiles && !perfiles.includes(usuario.perfil)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
