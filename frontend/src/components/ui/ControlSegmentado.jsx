import './ControlSegmentado.css';

// Cambia de vista dentro de la misma pantalla (por ejemplo Vehículos | Choferes).
//   opciones: [{ valor, etiqueta, icono?, cantidad? }]. `icono` es un SVG de
//             18px con currentColor y aria-hidden; `cantidad`, el total de la
//             vista (no se muestra si es null o undefined).
//   valor:    el valor de la opción activa
//   onChange: recibe el valor de la opción elegida
//   ariaLabel: nombre del grupo para lectores de pantalla
function ControlSegmentado({ opciones, valor, onChange, ariaLabel }) {
  return (
    <div className="control-segmentado" role="group" aria-label={ariaLabel}>
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            className={activa ? 'control-segmentado-opcion is-activa' : 'control-segmentado-opcion'}
            aria-pressed={activa}
            onClick={() => onChange(opcion.valor)}
          >
            {opcion.icono}
            {opcion.etiqueta}
            {opcion.cantidad != null && <span className="control-segmentado-cantidad">{opcion.cantidad}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default ControlSegmentado;
