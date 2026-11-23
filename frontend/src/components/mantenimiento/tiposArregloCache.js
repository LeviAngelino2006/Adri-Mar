import { listarTiposArreglo } from '../../services/mantenimientoApi';

// Los tipos de arreglo son fijos (se siembran en la base y la API solo los
// lista), así que se piden una sola vez por sesión de la página. El panel del
// vehículo los pide apenas se abre: cuando se entra a "Registrar arreglo" ya
// están y las casillas no aparecen de golpe. Si el pedido falla, el próximo
// vuelve a intentar.
let promesa = null;
let enMemoria = null;

export function pedirTiposArreglo() {
  if (!promesa) {
    promesa = listarTiposArreglo().then(
      ({ data }) => (enMemoria = data.tiposArreglo),
      (error) => {
        promesa = null;
        throw error;
      }
    );
  }
  return promesa;
}

// Los tipos ya traídos (o null): para dibujarlos en el primer render, sin
// esperar a que resuelva la promesa.
export function tiposArregloEnMemoria() {
  return enMemoria;
}
