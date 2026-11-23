import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RUTA_CAMBIAR_CONTRASENA } from '../utils/sesion';

// `permiteContrasenaProvisoria`: solo la ruta de "Cambiar contraseña". Con una
// contraseña provisoria, cualquier otra ruta lleva ahí (el backend, además,
// rechaza todo lo demás).
// `permite`: condición extra sobre el usuario (ej. puedeVerViajes) para lo que no
// se decide solo por perfil; si no se cumple, redirige igual que `perfiles`.
function ProtectedRoute({ children, perfiles, permite, permiteContrasenaProvisoria = false }) {
  const { usuario } = useAuth();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (usuario.debeCambiarContrasena && !permiteContrasenaProvisoria) {
    return <Navigate to={RUTA_CAMBIAR_CONTRASENA} replace />;
  }

  if ((perfiles && !perfiles.includes(usuario.perfil)) || (permite && !permite(usuario))) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
