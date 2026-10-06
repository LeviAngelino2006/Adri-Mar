import { capitalizarCatalogo } from '../../utils/viajeFormato';

// <option>s de un catálogo del backend (estados y métodos de pago, que se
// guardan en mayúsculas): "PAGADO" se muestra como "Pagado".
function OpcionesCatalogo({ items }) {
  return items.map((item) => (
    <option key={item.id} value={item.id}>
      {capitalizarCatalogo(item.descripcion)}
    </option>
  ));
}

export default OpcionesCatalogo;
