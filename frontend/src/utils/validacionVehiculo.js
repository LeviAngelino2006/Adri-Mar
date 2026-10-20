// Validación del alta y la edición de un vehículo, toda junta y antes de
// enviar, para que los errores salgan en una sola vuelta. El backend sigue
// validando todo igual (vehiculoService.validarDatos y, en el alta,
// validarKilometrajeInicial, que va aparte y por eso llegaba en una segunda
// vuelta). Los textos son los del backend, salvo donde el front sabe más: la
// marca (el backend solo recibe el modelo) y los rangos de año y asientos.

// Mismo formato que DOMINIO_REGEX de vehiculoService: ABC123 o AB123CD.
const DOMINIO_REGEX = /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/;

// Rangos razonables para la flota. El backend solo exige un año no futuro y
// asientos >= 0; acá se acota más para frenar errores de tipeo (1890, 0).
export const ANIO_MINIMO = 1970;
export const ASIENTOS_MINIMO = 1;
export const ASIENTOS_MAXIMO = 100;

const vacio = (valor) => valor === '' || valor === null || valor === undefined;
const esEntero = (valor) => /^\d+$/.test(String(valor).trim());

function errorEnteroEnRango(valor, minimo, maximo, { obligatorio, fueraDeRango }) {
  if (vacio(valor)) return obligatorio;
  if (!esEntero(valor)) return fueraDeRango;
  const numero = Number(valor);
  return numero < minimo || numero > maximo ? fueraDeRango : null;
}

// { campo: mensaje } de lo que hay que corregir; {} si está todo bien.
// `conKilometraje`: true en el alta (el kilometraje inicial es obligatorio); al
// editar no se manda. `anioActual` se puede pasar para los tests.
export function validarVehiculo(form, { conKilometraje, anioActual = new Date().getFullYear() }) {
  const errores = {};

  if (!String(form.numeroInterno ?? '').trim()) errores.numeroInterno = 'El número de interno es obligatorio';

  const dominio = String(form.dominio ?? '').trim().toUpperCase();
  if (!dominio) {
    errores.dominio = 'El dominio es obligatorio';
  } else if (!DOMINIO_REGEX.test(dominio)) {
    errores.dominio = 'El dominio debe tener formato de patente argentina (ej. AB123CD o ABC123)';
  }

  // Sin marca, el selector de modelo está deshabilitado: el error va en Marca.
  if (vacio(form.marcaId)) {
    errores.marcaId = 'Elegí la marca';
  } else if (vacio(form.modeloId)) {
    errores.modeloId = 'Elegí el modelo';
  }

  if (vacio(form.tipoVehiculoId)) errores.tipoVehiculoId = 'El tipo de vehículo es obligatorio';

  const errorAnio = errorEnteroEnRango(form.anio, ANIO_MINIMO, anioActual, {
    obligatorio: 'El año es obligatorio',
    fueraDeRango: `El año tiene que estar entre ${ANIO_MINIMO} y ${anioActual}`,
  });
  if (errorAnio) errores.anio = errorAnio;

  const errorAsientos = errorEnteroEnRango(form.asientos, ASIENTOS_MINIMO, ASIENTOS_MAXIMO, {
    obligatorio: 'La cantidad de asientos es obligatoria',
    fueraDeRango: `La cantidad de asientos tiene que estar entre ${ASIENTOS_MINIMO} y ${ASIENTOS_MAXIMO}`,
  });
  if (errorAsientos) errores.asientos = errorAsientos;

  if (conKilometraje) {
    if (vacio(form.kilometraje)) {
      errores.kilometraje = 'El kilometraje es obligatorio';
    } else if (!esEntero(form.kilometraje)) {
      errores.kilometraje = 'El kilometraje debe ser un número mayor o igual a 0';
    }
  }

  return errores;
}
