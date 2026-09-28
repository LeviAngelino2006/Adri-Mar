const prisma = require('./prismaClient');

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

// Patente argentina: formato viejo (ABC123) o formato Mercosur (AB123CD).
const DOMINIO_REGEX = /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/;

function validarDatos({ dominio, numeroInterno, marca, modelo, anio, asientos, kilometraje }) {
  const errores = {};

  const dominioNormalizado = (dominio || '').trim().toUpperCase();
  if (!dominioNormalizado) {
    errores.dominio = 'El dominio es obligatorio';
  } else if (!DOMINIO_REGEX.test(dominioNormalizado)) {
    errores.dominio = 'El dominio debe tener formato de patente argentina (ej. AB123CD o ABC123)';
  }

  if (!numeroInterno) errores.numeroInterno = 'El número de interno es obligatorio';
  if (!marca) errores.marca = 'La marca es obligatoria';
  if (!modelo) errores.modelo = 'El modelo es obligatorio';

  const anioNumero = Number(anio);
  const anioActual = new Date().getFullYear();
  if (anio === undefined || anio === null || anio === '') {
    errores.anio = 'El año es obligatorio';
  } else if (!Number.isInteger(anioNumero) || anioNumero > anioActual) {
    errores.anio = 'El año debe ser un número válido y no futuro';
  }

  const asientosNumero = Number(asientos);
  if (asientos === undefined || asientos === null || asientos === '') {
    errores.asientos = 'La cantidad de asientos es obligatoria';
  } else if (!Number.isInteger(asientosNumero) || asientosNumero < 0) {
    errores.asientos = 'La cantidad de asientos debe ser un número mayor o igual a 0';
  }

  const kilometrajeNumero = Number(kilometraje);
  if (kilometraje === undefined || kilometraje === null || kilometraje === '') {
    errores.kilometraje = 'El kilometraje es obligatorio';
  } else if (!Number.isInteger(kilometrajeNumero) || kilometrajeNumero < 0) {
    errores.kilometraje = 'El kilometraje debe ser un número mayor o igual a 0';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    dominio: dominioNormalizado,
    numeroInterno,
    marca,
    modelo,
    anio: anioNumero,
    asientos: asientosNumero,
    kilometraje: kilometrajeNumero,
  };
}

async function crearVehiculo(datos) {
  const datosValidados = validarDatos(datos);

  const existente = await prisma.vehiculo.findUnique({
    where: { dominio: datosValidados.dominio },
  });
  if (existente) {
    throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
  }

  let vehiculo;
  try {
    vehiculo = await prisma.vehiculo.create({ data: datosValidados });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
    }
    throw err;
  }

  return vehiculo;
}

async function listarVehiculos() {
  return prisma.vehiculo.findMany({
    where: { estado: { not: 'DADO_DE_BAJA' } },
    orderBy: { creadoEn: 'desc' },
  });
}

module.exports = { crearVehiculo, listarVehiculos, ValidacionError, DOMINIO_REGEX };
