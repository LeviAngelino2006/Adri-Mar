const prisma = require('./prismaClient');

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

// Patente argentina: formato viejo (ABC123) o formato Mercosur (AB123CD).
const DOMINIO_REGEX = /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/;

function validarDatos({
  dominio,
  numeroInterno,
  marca,
  modelo,
  anio,
  asientos,
  kilometraje,
  tipoVehiculoId,
}) {
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

  const tipoVehiculoIdNumero = Number(tipoVehiculoId);
  if (tipoVehiculoId === undefined || tipoVehiculoId === null || tipoVehiculoId === '') {
    errores.tipoVehiculoId = 'El tipo de vehículo es obligatorio';
  } else if (!Number.isInteger(tipoVehiculoIdNumero) || tipoVehiculoIdNumero <= 0) {
    errores.tipoVehiculoId = 'El tipo de vehículo no es válido';
  }

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
    tipoVehiculoId: tipoVehiculoIdNumero,
  };
}

async function validarTipoVehiculo(tipoVehiculoId, errores) {
  const tipo = await prisma.tipoVehiculo.findUnique({ where: { id: tipoVehiculoId } });
  if (!tipo) {
    throw new ValidacionError({ ...errores, tipoVehiculoId: 'El tipo de vehículo no existe' });
  }
}

async function crearVehiculo(datos) {
  const datosValidados = validarDatos(datos);
  await validarTipoVehiculo(datosValidados.tipoVehiculoId, {});

  const existente = await prisma.vehiculo.findUnique({
    where: { dominio: datosValidados.dominio },
  });
  if (existente) {
    throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
  }

  let vehiculo;
  try {
    vehiculo = await prisma.vehiculo.create({
      data: datosValidados,
      include: { tipoVehiculo: true },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
    }
    throw err;
  }

  return vehiculo;
}

const ESTADOS_VALIDOS = ['OPERATIVO', 'EN_TALLER', 'DADO_DE_BAJA'];

async function listarVehiculos({ estado, busqueda } = {}) {
  const where = {};

  if (estado && estado !== 'TODOS') {
    if (ESTADOS_VALIDOS.includes(estado)) {
      where.estado = estado;
    }
  } else if (!estado) {
    where.estado = { not: 'DADO_DE_BAJA' };
  }
  // estado === 'TODOS' -> sin filtro de estado

  if (busqueda) {
    where.OR = [
      { dominio: { contains: busqueda, mode: 'insensitive' } },
      { numeroInterno: { contains: busqueda, mode: 'insensitive' } },
      { marca: { contains: busqueda, mode: 'insensitive' } },
    ];
  }

  return prisma.vehiculo.findMany({
    where,
    orderBy: { creadoEn: 'desc' },
    include: { tipoVehiculo: true },
  });
}

async function listarTiposVehiculo() {
  return prisma.tipoVehiculo.findMany({ orderBy: { descripcion: 'asc' } });
}

class NoEncontradoError extends Error {}
class DadoDeBajaError extends Error {}

async function obtenerVehiculo(id) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(id) },
    include: { tipoVehiculo: true },
  });
  if (!vehiculo) {
    throw new NoEncontradoError();
  }
  return vehiculo;
}

async function actualizarVehiculo(id, datos) {
  const actual = await obtenerVehiculo(id);

  if (actual.estado === 'DADO_DE_BAJA') {
    throw new DadoDeBajaError();
  }

  const datosValidados = validarDatos(datos);
  await validarTipoVehiculo(datosValidados.tipoVehiculoId, {});

  const otroConMismoDominio = await prisma.vehiculo.findUnique({
    where: { dominio: datosValidados.dominio },
  });
  if (otroConMismoDominio && otroConMismoDominio.id !== actual.id) {
    throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
  }

  let vehiculo;
  try {
    vehiculo = await prisma.vehiculo.update({
      where: { id: actual.id },
      data: datosValidados,
      include: { tipoVehiculo: true },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
    }
    throw err;
  }

  return vehiculo;
}

class YaDadoDeBajaError extends Error {}

async function darDeBajaVehiculo(id) {
  const actual = await obtenerVehiculo(id);

  if (actual.estado === 'DADO_DE_BAJA') {
    throw new YaDadoDeBajaError();
  }

  return prisma.vehiculo.update({
    where: { id: actual.id },
    data: { estado: 'DADO_DE_BAJA', fechaBaja: new Date() },
  });
}

module.exports = {
  crearVehiculo,
  listarVehiculos,
  listarTiposVehiculo,
  obtenerVehiculo,
  actualizarVehiculo,
  darDeBajaVehiculo,
  ValidacionError,
  NoEncontradoError,
  DadoDeBajaError,
  YaDadoDeBajaError,
  DOMINIO_REGEX,
  ESTADOS_VALIDOS,
};
