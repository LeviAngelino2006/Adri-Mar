import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { getToken, getUsuario, setSesion, limpiarSesion } from '../services/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuarioState] = useState(() => (getToken() ? getUsuario() : null));

  useEffect(() => {
    function onSesionExpirada() {
      setUsuarioState(null);
    }
    window.addEventListener('adrimar:sesion-expirada', onSesionExpirada);
    return () => window.removeEventListener('adrimar:sesion-expirada', onSesionExpirada);
  }, []);

  async function login(nombreUsuario, contrasena) {
    const { data } = await api.post('/auth/login', { nombreUsuario, contrasena });
    setSesion(data.token, data.usuario);
    setUsuarioState(data.usuario);
  }

  function logout() {
    limpiarSesion();
    setUsuarioState(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
