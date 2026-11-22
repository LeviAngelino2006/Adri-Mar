import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Logo from '../components/ui/Logo';
import FormularioCambiarContrasena from '../components/auth/FormularioCambiarContrasena';
import { RUTA_MI_PERFIL } from '../utils/sesion';
import './Login.css';
import './CambiarContrasena.css';

// Cambio obligatorio de contraseña provisoria (H11): cuando la definió un
// gestor, ProtectedRoute trae todas las rutas acá sin navegación y solo ofrece
// cerrar sesión. Al cambiarla, entra a la app. Si la contraseña ya no es
// provisoria, redirige a Mi perfil (donde vive el cambio voluntario).
function CambiarContrasena() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [completado, setCompletado] = useState(false);

  if (completado) {
    return <Navigate to="/" replace />;
  }

  if (!usuario?.debeCambiarContrasena) {
    return <Navigate to={RUTA_MI_PERFIL} replace />;
  }

  function cerrarSesion() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="login-page">
      <div className="login-brand">
        <Logo variante="sobreMarca" tamano={64} />
        <p className="login-brand-sub">Viajes, flota y mantenimiento</p>
      </div>
      <div className="login-main">
        <Card className="login-card">
          <h1 className="cambiar-contrasena-titulo">Cambiar contraseña</h1>
          <p className="cambiar-contrasena-texto">
            Hola, {usuario.nombre}. Tu contraseña es provisoria: la definió quien te dio el acceso. Elegí una nueva para
            seguir.
          </p>
          <FormularioCambiarContrasena
            disposicion="columna"
            onExito={() => {
              setCompletado(true);
              navigate('/', { replace: true });
            }}
          />
          <Button variant="ghost" className="cambiar-contrasena-salir" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </Card>
      </div>
    </main>
  );
}

export default CambiarContrasena;
