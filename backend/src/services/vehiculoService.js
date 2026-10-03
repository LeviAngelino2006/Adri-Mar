const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');

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
    tipoVehiculoId: tipoVehiculoIdNumero,
  };
}

// El kilometraje deja de ser un campo editable en el alta/edición "normal":
// solo se usa como punto de partida en el alta, para generar la lectura
// ALTA_VEHICULO (ver crearVehiculo). Por eso se valida aparte, no dentro de
// validarDatos — actualizarVehiculo no lo necesita ni lo toca.
function validarKilometrajeInicial(kilometraje) {
  const kilometrajeNumero = Number(kilometraje);
  if (kilometraje === undefined || kilometraje === null || kilometraje === '') {
    throw new ValidacionError({ kilometraje: 'El kilometraje es obligatorio' });
  }
  if (!Number.isInteger(kilometrajeNumero) || kilometrajeNumero < 0) {
    throw new ValidacionError({ kilometraje: 'El kilometraje debe ser un número mayor o igual a 0' });
  }
  return kilometrajeNumero;
}

async function validarTipoVehiculo(tipoVehiculoId, errores) {
  const tipo = await prisma.tipoVehiculo.findUnique({ where: { id: tipoVehiculoId } });
  if (!tipo) {
    throw new ValidacionError({ ...errores, tipoVehiculoId: 'El tipo de vehículo no existe' });
  }
}

async function obtenerEstadoVehiculoPorDescripcion(descripcion) {
  const estado = await prisma.estadoVehiculo.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de vehículo "${descripcion}" no configurado`);
  }
  return estado;
}

function serializarVehiculo(vehiculo) {
  return {
    id: vehiculo.id,
    dominio: vehiculo.dominio,
    numeroInterno: vehiculo.numeroInterno,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    anio: vehiculo.anio,
    asientos: vehiculo.asientos,
    kilometraje: vehiculo.kilometraje,
    estado: vehiculo.estadoVehiculo.descripcion,
    tipoVehiculoId: vehiculo.tipoVehiculoId,
    tipoVehiculo: vehiculo.tipoVehiculo,
    fechaBaja: vehiculo.fechaBaja,
    creadoEn: vehiculo.creadoEn,
  };
}

async function crearVehiculo(datos, { usuarioId } = {}) {
  const datosValidados = validarDatos(datos);
  const kilometrajeInicial = validarKilometrajeInicial(datos.kilometraje);
  await validarTipoVehiculo(datosValidados.tipoVehiculoId, {});

  const existente = await prisma.vehiculo.findUnique({
    where: { dominio: datosValidados.dominio },
  });
  if (existente) {
    throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
  }

  const estadoOperativo = await obtenerEstadoVehiculoPorDescripcion('OPERATIVO');

  let vehiculo;
  try {
    vehiculo = await prisma.$transaction(async (tx) => {
      // kilometraje no tiene default en el schema (columna NOT NULL) y hay
      // que darle algún valor en el INSERT; 0 es un placeholder que nunca
      // llega a ser visible fuera de esta transacción, porque la lectura
      // ALTA_VEHICULO de abajo lo pisa en la misma transacción antes de
      // hacer commit — el valor final siempre lo decide la lectura, no el
      // create del vehículo.
      const creado = await tx.vehiculo.create({
        data: { ...datosValidados, kilometraje: 0, estadoVehiculoId: estadoOperativo.id },
      });

      await lecturaOdometroService.crearLectura(
        {
          vehiculoId: creado.id,
          valorKm: kilometrajeInicial,
          origen: 'ALTA_VEHICULO',
          viajeId: null,
          usuarioId,
        },
        { cliente: tx }
      );

      return tx.vehiculo.findUnique({
        where: { id: creado.id },
        include: { tipoVehiculo: true, estadoVehiculo: true },
      });
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
    }
    throw err;
  }

  return serializarVehiculo(vehiculo);
}

const ESTADOS_VALIDOS = ['OPERATIVO', 'EN_TALLER', 'DADO_DE_BAJA'];

async function listarVehiculos({ estado, busqueda } = {}) {
  const where = {};

  if (estado && estado !== 'TODOS') {
    if (ESTADOS_VALIDOS.includes(estado)) {
      where.estadoVehiculo = { descripcion: estado };
    }
  } else if (!estado) {
    where.estadoVehiculo = { descripcion: { not: 'DADO_DE_BAJA' } };
  }
  // estado === 'TODOS' -> sin filtro de estado

  if (busqueda) {
    where.OR = [
      { dominio: { contains: busqueda, mode: 'insensitive' } },
      { numeroInterno: { contains: busqueda, mode: 'insensitive' } },
      { marca: { contains: busqueda, mode: 'insensitive' } },
    ];
  }

  const vehiculos = await prisma.vehiculo.findMany({
    where,
    orderBy: { creadoEn: 'desc' },
    include: { tipoVehiculo: true, estadoVehiculo: true },
  });

  return vehiculos.map(serializarVehiculo);
}

async function listarTiposVehiculo() {
  return prisma.tipoVehiculo.findMany({ orderBy: { descripcion: 'asc' } });
}

class NoEncontradoError extends Error {}
class DadoDeBajaError extends Error {}

async function obtenerVehiculo(id) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(id) },
    include: { tipoVehiculo: true, estadoVehiculo: true },
  });
  if (!vehiculo) {
    throw new NoEncontradoError();
  }
  return serializarVehiculo(vehiculo);
}

async function actualizarVehiculo(id, datos) {
  const actual = await obtenerVehiculo(id);

  if (actual.estado === 'DADO_DE_BAJA') {
    throw new DadoDeBajaError();
  }

  // kilometraje ya no se acepta por esta vía (LecturaOdometro es la única
  // fuente de verdad) — si llega en el body simplemente se ignora, no se
  // valida ni se aplica. validarDatos ni siquiera lo mira.
  const kilometrajeIgnorado = datos.kilometraje !== undefined;

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
      include: { tipoVehiculo: true, estadoVehiculo: true },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ dominio: 'Ese dominio ya está registrado' });
    }
    throw err;
  }

  return { vehiculo: serializarVehiculo(vehiculo), kilometrajeIgnorado };
}

class YaDadoDeBajaError extends Error {}

// Caso borde ya decidido: un vehículo con un viaje En viaje en curso no se
// puede dar de baja (ni, a futuro, pasar a taller) hasta que ese viaje
// finalice. Se consulta viajes directamente acá en vez de importar
// viajeService, para no crear una dependencia cruzada entre services — esta
// tarea agrega validaciones del lado de vehículos consultando viajes, no al
// revés.
class VehiculoEnUsoError extends Error {}

async function tieneViajeEnCurso(vehiculoId) {
  const viaje = await prisma.viaje.findFirst({
    where: { vehiculoId, estadoViaje: { descripcion: 'EN_VIAJE' } },
  });
  return Boolean(viaje);
}

async function darDeBajaVehiculo(id) {
  const actual = await obtenerVehiculo(id);

  if (actual.estado === 'DADO_DE_BAJA') {
    throw new YaDadoDeBajaError();
  }

  if (await tieneViajeEnCurso(actual.id)) {
    throw new VehiculoEnUsoError(
      'El vehículo tiene un viaje En viaje en curso. Debe finalizarse antes de dar de baja el vehículo.'
    );
  }

  const estadoDadoDeBaja = await obtenerEstadoVehiculoPorDescripcion('DADO_DE_BAJA');

  const vehiculo = await prisma.vehiculo.update({
    where: { id: actual.id },
    data: { estadoVehiculoId: estadoDadoDeBaja.id, fechaBaja: new Date() },
    include: { tipoVehiculo: true, estadoVehiculo: true },
  });

  return serializarVehiculo(vehiculo);
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
  VehiculoEnUsoError,
  DOMINIO_REGEX,
  ESTADOS_VALIDOS,
};
