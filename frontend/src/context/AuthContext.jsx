import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { getToken, getUsuario, setSesion, actualizarUsuario, limpiarSesion } from '../services/authStorage';
import { MENSAJE_SESION_VENCIDA } from '../utils/sesion';

const AuthContext = createContext(null);

// Lo que el front guarda del usuario logueado (la forma del login y de /auth/me).
const CAMPOS_USUARIO = ['id', 'personaId', 'nombre', 'apellido', 'nombreUsuario', 'perfil', 'habilitadoParaConducir'];

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
        // Se pisan solo los campos que vinieron, sobre el usuario guardado: un
        // backend anterior a esta versión responde /auth/me sin nombre ni
        // apellido (el front y el back no se despliegan en el mismo instante).
        const refrescado = { ...getUsuario() };
        for (const campo of CAMPOS_USUARIO) {
          if (data.usuario[campo] !== undefined) refrescado[campo] = data.usuario[campo];
        }
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
    window.addEventListener('adrimar:sesion-expirada', onSesionExpirada);
    window.addEventListener('adrimar:sesion-cambiada', refrescarUsuario);
    return () => {
      window.removeEventListener('adrimar:sesion-expirada', onSesionExpirada);
      window.removeEventListener('adrimar:sesion-cambiada', refrescarUsuario);
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

  return (
    <AuthContext.Provider value={{ usuario, login, logout, avisoSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
