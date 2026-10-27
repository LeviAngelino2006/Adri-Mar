import axios from 'axios';
import { getToken, getUsuario, actualizarToken, limpiarSesion } from './authStorage';
import { payloadDelToken, cambioLaSesion, CODIGO_DEBE_CAMBIAR_CONTRASENA } from '../utils/sesion';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El backend arma el token renovado con el perfil y la habilitación de la base:
// si no coinciden con el usuario guardado, AuthContext lo refresca.
function tomarTokenRenovado(headers) {
  const nuevoToken = headers?.['x-renewed-token'];
  if (!nuevoToken) return;
  actualizarToken(nuevoToken);
  if (cambioLaSesion(getUsuario(), payloadDelToken(nuevoToken))) {
    window.dispatchEvent(new Event('adrimar:sesion-cambiada'));
  }
}

api.interceptors.response.use(
  (response) => {
    tomarTokenRenovado(response.headers);
    return response;
  },
  (error) => {
    // También en un error: a quien le sacaron el perfil, su próximo pedido en
    // una pantalla que ya no le corresponde le da 403, pero trae el token
    // renovado con el perfil nuevo (autenticar renueva antes de autorizar).
    tomarTokenRenovado(error.response?.headers);
    if (error.response?.status === 401 && getToken()) {
      limpiarSesion();
      window.dispatchEvent(new Event('adrimar:sesion-expirada'));
    }
    // Un gestor le definió una contraseña provisoria (también con la sesión ya
    // abierta): AuthContext lo marca y las rutas llevan a "Cambiar contraseña".
    if (error.response?.status === 403 && error.response.data?.codigo === CODIGO_DEBE_CAMBIAR_CONTRASENA) {
      window.dispatchEvent(new Event('adrimar:debe-cambiar-contrasena'));
    }
    return Promise.reject(error);
  }
);

export default api;
