import { useId } from 'react';
import Button from './ui/Button';
import RutaViaje from './RutaViaje';
import { MOTIVOS_BLOQUEO_COMENZAR, viajeEnCursoQueBloquea } from '../utils/viajeEnCurso';
import './BotonComenzarViaje.css';

// "Comenzar viaje" de la ficha de un viaje y de Tus viajes pendientes. Si el chofer
// (o el vehículo) ya tiene otro viaje En viaje, el botón queda DESHABILITADO con
// el motivo visible debajo (mismo criterio que AvisarPorWhatsApp: un tooltip no
// se ve en el celular) y un acceso al viaje en curso. Así no se llega a cargar el
// odómetro de un viaje que el backend va a rechazar.
//
// `enCurso`: los viajes EN_VIAJE que conoce la pantalla. `onVerViajeEnCurso`
// recibe el viaje en curso. El resto de las props van al Button.
function BotonComenzarViaje({ viaje, enCurso, onComenzar, onVerViajeEnCurso, variant = 'primary', className = '' }) {
  const idMotivo = useId();
  const bloqueo = viajeEnCursoQueBloquea(viaje, enCurso);

  if (!bloqueo) {
    return (
      <Button variant={variant} className={className} onClick={() => onComenzar(viaje)}>
        Comenzar viaje
      </Button>
    );
  }

  const { viaje: enCursoQueBloquea, motivo } = bloqueo;
  return (
    <div className={`comenzar-viaje-bloqueado ${className}`.trim()}>
      <Button variant={variant} disabled aria-describedby={idMotivo}>
        Comenzar viaje
      </Button>
      <p id={idMotivo} className="comenzar-viaje-motivo">
        {MOTIVOS_BLOQUEO_COMENZAR[motivo]}
      </p>
      {onVerViajeEnCurso && (
        <button type="button" className="comenzar-viaje-ir" onClick={() => onVerViajeEnCurso(enCursoQueBloquea)}>
          <span className="comenzar-viaje-ir-texto">Ver el viaje en curso:</span>
          <RutaViaje origen={enCursoQueBloquea.origen} destino={enCursoQueBloquea.destino} paradas={enCursoQueBloquea.paradas} />
        </button>
      )}
    </div>
  );
}

export default BotonComenzarViaje;
