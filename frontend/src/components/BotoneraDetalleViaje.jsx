import Button from './ui/Button';
import AvisarPorWhatsApp from './AvisarPorWhatsApp';
import BotonComenzarViaje from './BotonComenzarViaje';
import DuplicarViaje from './DuplicarViaje';
import { PERFILES_DUPLICAR_VIAJE } from '../constants/perfiles';

// Botonera de la ficha de un viaje: todas las acciones en una sola fila
// (flex-wrap en mobile, ver .viajes-detalle-actions en Viajes.css).
//
// Regla de estilo: a lo sumo UN primary por fila.
//  - primary: la acción que avanza el estado del viaje. Confirmar viaje
//    (A_CONFIRMAR), Comenzar viaje (PROGRAMADO) o Finalizar viaje (EN_VIAJE).
//    Cada una depende de un estado distinto, así que nunca aparecen dos juntas.
//  - secondary: Avisar por WhatsApp, Editar viaje, Duplicar viaje.
//  - danger: Cancelar viaje.
//
// La visibilidad depende del estado y del perfil:
//  - `puedeGestionar`: Administrador / Encargado.
//  - `puedeOperar`: puede comenzar / finalizar ESTE viaje (gestor o su chofer).
// Sin ninguna acción visible no se renderiza nada.
function BotoneraDetalleViaje({
  viaje,
  perfil,
  puedeGestionar,
  puedeOperar,
  enCurso,
  onComenzar,
  onVerViajeEnCurso,
  onFinalizar,
  onConfirmar,
  onEditar,
  onDuplicar,
  onCancelar,
}) {
  const esAConfirmar = viaje.estado === 'A_CONFIRMAR';
  const esProgramado = viaje.estado === 'PROGRAMADO';
  const esEnViaje = viaje.estado === 'EN_VIAJE';
  // Editar y Cancelar: gestores, sobre un viaje A confirmar o Programado.
  const accionesDeGestion = puedeGestionar && (esAConfirmar || esProgramado);
  const hayAcciones =
    accionesDeGestion || ((esProgramado || esEnViaje) && puedeOperar) || PERFILES_DUPLICAR_VIAJE.includes(perfil);

  if (!hayAcciones) return null;

  return (
    <div className="viajes-detalle-actions">
      {esAConfirmar && puedeGestionar && (
        <Button variant="primary" onClick={() => onConfirmar(viaje)}>
          Confirmar viaje
        </Button>
      )}
      {esProgramado && puedeOperar && (
        <BotonComenzarViaje
          viaje={viaje}
          enCurso={enCurso}
          onComenzar={onComenzar}
          onVerViajeEnCurso={onVerViajeEnCurso}
        />
      )}
      {esEnViaje && puedeOperar && (
        <Button variant="primary" onClick={() => onFinalizar(viaje)}>
          Finalizar viaje
        </Button>
      )}
      {esProgramado && puedeGestionar && <AvisarPorWhatsApp viaje={viaje} />}
      {accionesDeGestion && (
        <Button variant="secondary" onClick={() => onEditar(viaje)}>
          Editar viaje
        </Button>
      )}
      <DuplicarViaje viaje={viaje} perfil={perfil} onDuplicar={onDuplicar} />
      {accionesDeGestion && (
        <Button variant="danger" onClick={() => onCancelar(viaje)}>
          Cancelar viaje
        </Button>
      )}
    </div>
  );
}

export default BotoneraDetalleViaje;
