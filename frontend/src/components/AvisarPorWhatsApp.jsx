import { useId } from 'react';
import Button from './ui/Button';
import { avisoWhatsApp } from '../utils/whatsapp';
import './AvisarPorWhatsApp.css';

const TEXTO = 'Avisar por WhatsApp';

const ICONO_MENSAJE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
  </svg>
);

// Abre WhatsApp con el aviso del viaje ya escrito para el chofer (link wa.me:
// en el celular lo toma la app). Solo para gestores y sobre un viaje confirmado
// (PROGRAMADO); quien lo monta decide eso.
//
//  - variante "boton" (por defecto): botón secondary. Si no se puede avisar queda
//    DESHABILITADO con el motivo, tanto en el tooltip como en un texto visible
//    debajo (un tooltip no se ve en el celular):
//      · "El chofer no tiene teléfono cargado", o
//      · "El teléfono del chofer no tiene un formato válido. Corregilo en Usuarios."
//  - variante "enlace": un enlace de texto para el Toast de éxito al confirmar.
//    Si no se puede avisar no muestra nada (un enlace deshabilitado en un toast
//    es ruido); el botón del detalle sigue estando, con su motivo.
//
// El link usa un <a target="_blank" rel="noopener noreferrer"> y no window.open.
function AvisarPorWhatsApp({ viaje, variante = 'boton' }) {
  const idMotivo = useId();
  const { url, motivo } = avisoWhatsApp(viaje);

  if (variante === 'enlace') {
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {TEXTO}
      </a>
    );
  }

  if (!url) {
    return (
      <div className="avisar-whatsapp">
        {/* El tooltip va en el contenedor: un botón deshabilitado no recibe el mouse. */}
        <span title={motivo}>
          <Button variant="secondary" disabled aria-describedby={idMotivo}>
            {TEXTO}
          </Button>
        </span>
        <p id={idMotivo} className="avisar-whatsapp-motivo">
          {motivo}
        </p>
      </div>
    );
  }

  return (
    <a className="btn btn-secondary avisar-whatsapp-enlace" href={url} target="_blank" rel="noopener noreferrer">
      {ICONO_MENSAJE}
      <span>{TEXTO}</span>
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

export default AvisarPorWhatsApp;
