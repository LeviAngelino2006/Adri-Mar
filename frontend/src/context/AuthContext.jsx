import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { getToken, getUsuario, setSesion, actualizarUsuario, limpiarSesion } from '../services/authStorage';
import { MENSAJE_SESION_VENCIDA } from '../utils/sesion';

const AuthContext = createContext(null);

// Lo que el front guarda del usuario logueado (la forma del login y de /auth/me).
const CAMPOS_USUARIO = [
  'id',
  'personaId',
  'nombre',
  'apellido',
  'nombreUsuario',
  'perfil',
  'habilitadoParaConducir',
  'debeCambiarContrasena',
];

// Pisa en el usuario guardado solo los campos que vinieron: un backend anterior
// a esta versión responde /auth/me sin nombre ni apellido, o sin
// debeCambiarContrasena (el front y el back no se despliegan en el mismo instante).
function combinarUsuario(guardado, recibido) {
  const combinado = { ...guardado };
  for (const campo of CAMPOS_USUARIO) {
    if (recibido[campo] !== undefined) combinado[campo] = recibido[campo];
  }
  return combinado;
}

export function AuthProvider({ children }) {
  const [usuario, setUsuarioState] = useState(() => (getToken() ? getUsuario() : null));
  // Por qué se volvió al login sin que el usuario cerrara la sesión (la cuenta
  // se bloqueó, la persona se dio de baja o el token venció). Lo muestra Login.
  const [avisoSesion, setAvisoSesion] = useState('');

  // El usuario guardado es el del login: el perfil o la habilitación pueden
  // haber cambiado desde entonces. Se pide de nuevo al backend.
  const refrescarUsuario = useCallback(async () => {
    if (!getToken()) return;
    try {
      const { data } = await api.get('/auth/me');
      if (data?.usuario) {
        const refrescado = combinarUsuario(getUsuario(), data.usuario);
        actualizarUsuario(refrescado);
        setUsuarioState(refrescado);
      }
    } catch {
      // Un 401 ya lo resuelve el interceptor de api (vuelve al login). Si es
      // la red, se sigue con el usuario guardado.
    }
  }, []);

  useEffect(() => {
    refrescarUsuario();
  }, [refrescarUsuario]);

  useEffect(() => {
    function onSesionExpirada() {
      setUsuarioState(null);
      setAvisoSesion(MENSAJE_SESION_VENCIDA);
    }
    // Un pedido respondió que la contraseña es provisoria (se la definió un
    // gestor con la sesión abierta): desde ya, las rutas llevan a cambiarla.
    function onDebeCambiarContrasena() {
      const usuarioGuardado = getUsuario();
      if (!usuarioGuardado || usuarioGuardado.debeCambiarContrasena) return;
      const marcado = { ...usuarioGuardado, debeCambiarContrasena: true };
      actualizarUsuario(marcado);
      setUsuarioState(marcado);
    }
    window.addEventListener('adrimar:sesion-expirada', onSesionExpirada);
    window.addEventListener('adrimar:sesion-cambiada', refrescarUsuario);
    window.addEventListener('adrimar:debe-cambiar-contrasena', onDebeCambiarContrasena);
    return () => {
      window.removeEventListener('adrimar:sesion-expirada', onSesionExpirada);
      window.removeEventListener('adrimar:sesion-cambiada', refrescarUsuario);
      window.removeEventListener('adrimar:debe-cambiar-contrasena', onDebeCambiarContrasena);
    };
  }, [refrescarUsuario]);

  async function login(nombreUsuario, contrasena) {
    const { data } = await api.post('/auth/login', { nombreUsuario, contrasena });
    setSesion(data.token, data.usuario);
    setUsuarioState(data.usuario);
    setAvisoSesion('');
  }

  function logout() {
    limpiarSesion();
    setUsuarioState(null);
    setAvisoSesion('');
  }

  // Cambia la contraseña de la sesión. El backend devuelve el usuario con
  // debeCambiarContrasena=false, que libera las rutas.
  async function cambiarContrasena(contrasenaActual, contrasenaNueva) {
    const { data } = await api.put('/auth/contrasena', { contrasenaActual, contrasenaNueva });
    const actualizado = combinarUsuario(getUsuario(), { ...data.usuario, debeCambiarContrasena: false });
    actualizarUsuario(actualizado);
    setUsuarioState(actualizado);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, avisoSesion, cambiarContrasena }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
