import { useCallback, useEffect, useState } from 'react';
import { sugerenciasGoogle } from '../services/ubicacionesApi';
import { DEMORA_GOOGLE_MS, debeBuscarEnGoogle, mensajeErrorGoogle, nuevoSessionToken } from '../utils/sugerenciasGoogle';

// Sugerencias de Google Maps para `texto`, con debounce y desde 3 letras,
// mientras `activo` (el desplegable abierto). Mantiene el sessionToken de la
// búsqueda: quien elige un lugar lo manda al backend junto con el placeId y
// después llama a renovarSesion() para que la próxima búsqueda sea otra sesión.
//
// Devuelve { sugerencias, cargando, error, hayTexto, sessionToken, renovarSesion }.
// Una respuesta que llega tarde (de un texto anterior) se descarta.
export default function useSugerenciasGoogle(texto, activo) {
  const [sessionToken, setSessionToken] = useState(() => nuevoSessionToken());
  const [estado, setEstado] = useState({ sugerencias: [], cargando: false, error: null });
  const hayTexto = debeBuscarEnGoogle(texto);

  useEffect(() => {
    if (!activo || !hayTexto) return undefined;

    let vigente = true;
    const temporizador = setTimeout(() => {
      setEstado((e) => ({ ...e, cargando: true, error: null }));
      sugerenciasGoogle(texto.trim(), sessionToken)
        .then(({ data }) => {
          if (vigente) setEstado({ sugerencias: data.sugerencias, cargando: false, error: null });
        })
        .catch((err) => {
          if (vigente) setEstado({ sugerencias: [], cargando: false, error: mensajeErrorGoogle(err) });
        });
    }, DEMORA_GOOGLE_MS);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [texto, activo, hayTexto, sessionToken]);

  const renovarSesion = useCallback(() => setSessionToken(nuevoSessionToken()), []);

  return {
    sugerencias: hayTexto ? estado.sugerencias : [],
    cargando: hayTexto && estado.cargando,
    error: hayTexto ? estado.error : null,
    hayTexto,
    sessionToken,
    renovarSesion,
  };
}
