import Button from './ui/Button';

// Los mismos perfiles que pueden crear viajes.
const PERFILES_DUPLICAR = ['ADMINISTRADOR', 'ENCARGADO'];

// Botón "Duplicar viaje" de la ficha, en una fila propia debajo de las acciones
// del estado: no cambia este viaje sino que abre el alta de uno nuevo (ver
// valoresParaDuplicar). Está en cualquier estado, también Finalizado y
// Cancelado, para repetir un viaje de otra semana.
function DuplicarViaje({ viaje, perfil, onDuplicar }) {
  if (!PERFILES_DUPLICAR.includes(perfil)) return null;

  return (
    <div className="viajes-detalle-actions">
      <Button variant="secondary" onClick={() => onDuplicar(viaje)}>
        Duplicar viaje
      </Button>
    </div>
  );
}

export default DuplicarViaje;
