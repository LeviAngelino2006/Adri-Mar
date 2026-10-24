// Primera opción de un <select>: la del valor vacío (value=""). Todo select de
// formulario arranca con esta opción, nunca con un <option value=""> a mano.
//  - Obligatorio (`obligatorio`): es un placeholder ("Elegí el vehículo"). Se ve
//    mientras no hay nada elegido, pero no se puede elegir: va deshabilitada y
//    oculta de la lista desplegable.
//  - Opcional: es una opción más ("Sin definir"), para volver a "sin valor".
// Los filtros de los listados no la usan: su "Todos" es un valor del filtro.
function OpcionVacia({ obligatorio = false, children }) {
  return (
    <option value="" disabled={obligatorio} hidden={obligatorio}>
      {children}
    </option>
  );
}

export default OpcionVacia;
