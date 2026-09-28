import axios from 'axios';
import { getToken, actualizarToken, limpiarSesion } from './authStorage';

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

api.interceptors.response.use(
  (response) => {
    const nuevoToken = response.headers['x-renewed-token'];
    if (nuevoToken) {
      actualizarToken(nuevoToken);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      limpiarSesion();
      window.dispatchEvent(new Event('adrimar:sesion-expirada'));
    }
    return Promise.reject(error);
  }
);

export default api;
