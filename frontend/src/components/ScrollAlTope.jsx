import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// El router no reinicia el scroll al cambiar de ruta: la página nueva
// heredaría el desplazamiento de la anterior. Al cambiar el pathname, vuelve
// arriba. (Un cambio solo de `state` o de query no cuenta.)
function ScrollAlTope() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default ScrollAlTope;
