import Button from './ui/Button';
import { urlRecorrido } from '../utils/googleMaps';
import './BotonVerRecorrido.css';

const ICONO_EXTERNO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

const TEXTO = 'Ver recorrido en Google Maps';

// Abre en una pestaña nueva la ruta completa (origen → paradas → destino) en
// Google Maps, para leer los km y el tiempo. Es un enlace común (<a>) y no un
// window.open: es accesible, se puede abrir con el menú contextual y en el
// celular lo toma la app de Google Maps. Sin origen o sin destino no hay ruta que
// mostrar: un enlace no se puede deshabilitar, así que en ese caso va un botón
// deshabilitado con el mismo texto.
//
// origen / destino / cada parada: cualquier objeto con `nombre` (el formulario
// pasa los nombres elegidos en los selectores aunque el viaje no esté guardado).
function BotonVerRecorrido({ origen, paradas = [], destino }) {
  const url = urlRecorrido({ origen, paradas, destino });

  if (!url) {
    return (
      <Button variant="secondary" disabled>
        {TEXTO}
      </Button>
    );
  }

  return (
    <a className="btn btn-secondary boton-ver-recorrido" href={url} target="_blank" rel="noopener noreferrer">
      <span>{TEXTO}</span>
      {ICONO_EXTERNO}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

export default BotonVerRecorrido;
