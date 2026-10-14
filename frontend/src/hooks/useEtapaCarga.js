import { useEffect, useState } from 'react';
import { etapaPorTiempo, UMBRAL_ESQUELETO_MS, UMBRAL_LENTO_MS } from '../utils/etapaCarga';

// Etapa del estado de carga mientras `activo` es true: 'oculto' hasta los
// 300ms, 'esqueleto' hasta los 3s y 'lento' después. Al pasar `activo` a false
// o al desmontar se limpian los timers y vuelve a 'oculto'.
export function useEtapaCarga(activo) {
  const [etapa, setEtapa] = useState('oculto');

  useEffect(() => {
    if (!activo) return undefined;
    const timers = [UMBRAL_ESQUELETO_MS, UMBRAL_LENTO_MS].map((ms) =>
      setTimeout(() => setEtapa(etapaPorTiempo(ms)), ms)
    );
    return () => {
      timers.forEach(clearTimeout);
      setEtapa('oculto');
    };
  }, [activo]);

  return activo ? etapa : 'oculto';
}

export default useEtapaCarga;
