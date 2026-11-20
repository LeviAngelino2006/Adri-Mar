import Button from './ui/Button';
import { PERFILES_DUPLICAR_VIAJE } from '../constants/perfiles';

// Botón "Duplicar viaje" de la ficha, en la misma botonera que las acciones del
// estado: no cambia este viaje sino que abre el alta de uno nuevo (ver
// valoresParaDuplicar). Está en cualquier estado, también Finalizado y
// Cancelado, para repetir un viaje de otra semana.
function DuplicarViaje({ viaje, perfil, onDuplicar }) {
  if (!PERFILES_DUPLICAR_VIAJE.includes(perfil)) return null;

  return (
    <Button variant="secondary" onClick={() => onDuplicar(viaje)}>
      Duplicar viaje
    </Button>
  );
}

export default DuplicarViaje;
