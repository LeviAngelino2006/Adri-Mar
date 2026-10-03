const prisma = require('./prismaClient');

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradoError extends Error {
  constructor(recurso) {
    super(`${recurso} no encontrado`);
    this.recurso = recurso;
  }
}

const ORIGENES_VALIDOS_CREAR = ['ALTA_VEHICULO', 'INICIO_VIAJE', 'FIN_VIAJE', 'MANUAL'];
const ORIGENES_CON_VIAJE_OBLIGATORIO = ['INICIO_VIAJE', 'FIN_VIAJE'];

async function obtenerOrigenPorDescripcion(descripcion, cliente = prisma) {
  const origen = await cliente.origenLectura.findUnique({ where: { descripcion } });
  if (!origen) {
    throw new Error(`Origen de lectura "${descripcion}" no configurado`);
  }
  return origen;
}

function serializarLectura(lectura) {
  return {
    id: lectura.id,
    vehiculoId: lectura.vehiculoId,
    valorKm: lectura.valorKm,
    fechaHora: lectura.fechaHora,
    origen: lectura.origen.descripcion,
    viajeId: lectura.viajeId,
    usuarioId: lectura.usuarioId,
    lecturaCorregidaId: lectura.lecturaCorregidaId,
    motivo: lectura.motivo,
    creadoEn: lectura.creadoEn,
  };
}

async function obtenerUltimaLectura(vehiculoId) {
  const vehiculoIdNumero = Number(vehiculoId);

  const lectura = await prisma.lecturaOdometro.findFirst({
    where: { vehiculoId: vehiculoIdNumero },
    orderBy: { fechaHora: 'desc' },
    include: { origen: true },
  });

  return lectura ? serializarLectura(lectura) : null;
}

function validarDatosCrear({ vehiculoId, valorKm, origen, viajeId, usuarioId }) {
  const errores = {};

  const vehiculoIdNumero = Number(vehiculoId);
  if (!Number.isInteger(vehiculoIdNumero) || vehiculoIdNumero <= 0) {
    errores.vehiculoId = 'El vehículo es obligatorio';
  }

  if (origen === 'CORRECCION') {
    errores.origen = 'Para corregir una lectura existente usá corregirLectura, no crearLectura';
  } else if (!ORIGENES_VALIDOS_CREAR.includes(origen)) {
    errores.origen = 'El origen indicado no es válido';
  }

  const valorKmNumero = Number(valorKm);
  if (!Number.isInteger(valorKmNumero) || valorKmNumero < 0) {
    errores.valorKm = 'El valor del odómetro debe ser un número entero mayor o igual a 0';
  }

  const viajeIdNumero = viajeId != null ? Number(viajeId) : null;
  if (ORIGENES_CON_VIAJE_OBLIGATORIO.includes(origen)) {
    if (!Number.isInteger(viajeIdNumero) || viajeIdNumero <= 0) {
      errores.viajeId = `El viaje es obligatorio para el origen ${origen}`;
    }
  } else if (viajeId !== undefined && viajeId !== null) {
    errores.viajeId = `El origen ${origen || ''} no puede estar asociado a un viaje`.trim();
  }

  const usuarioIdNumero = Number(usuarioId);
  if (!Number.isInteger(usuarioIdNumero) || usuarioIdNumero <= 0) {
    errores.usuarioId = 'El usuario que registra la lectura es obligatorio';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    vehiculoId: vehiculoIdNumero,
    valorKm: valorKmNumero,
    origen,
    viajeId: viajeIdNumero,
    usuarioId: usuarioIdNumero,
  };
}

// Usa crearLectura para ALTA_VEHICULO / INICIO_VIAJE / FIN_VIAJE / MANUAL. Las
// correcciones van por corregirLectura, que tiene su propia validación (no se
// permiten como un origen más acá, para no tener dos caminos de creación de
// correcciones).
async function crearLectura({ vehiculoId, valorKm, origen, viajeId, usuarioId }) {
  const datos = validarDatosCrear({ vehiculoId, valorKm, origen, viajeId, usuarioId });

  return prisma.$transaction(async (tx) => {
    // Lock de fila sobre el vehículo: evita que dos crearLectura simultáneas
    // para el mismo vehículo lean la misma "última lectura" antes de que
    // ninguna haya escrito todavía.
    const filas = await tx.$queryRaw`SELECT id FROM vehiculos WHERE id = ${datos.vehiculoId} FOR UPDATE`;
    if (filas.length === 0) {
      throw new NoEncontradoError('vehiculo');
    }

    const ultima = await tx.lecturaOdometro.findFirst({
      where: { vehiculoId: datos.vehiculoId },
      orderBy: { fechaHora: 'desc' },
    });

    if (ultima && datos.valorKm < ultima.valorKm) {
      throw new ValidacionError({
        valorKm: `El valor no puede ser menor a la última lectura registrada (${ultima.valorKm} km)`,
      });
    }

    const origenRow = await obtenerOrigenPorDescripcion(datos.origen, tx);

    const creada = await tx.lecturaOdometro.create({
      data: {
        vehiculoId: datos.vehiculoId,
        valorKm: datos.valorKm,
        fechaHora: new Date(),
        origenId: origenRow.id,
        viajeId: datos.viajeId,
        usuarioId: datos.usuarioId,
      },
      include: { origen: true },
    });

    await tx.vehiculo.update({
      where: { id: datos.vehiculoId },
      data: { kilometraje: datos.valorKm },
    });

    return serializarLectura(creada);
  });
}

async function listarLecturas(vehiculoId, { origen, fechaDesde, fechaHasta } = {}) {
  const where = { vehiculoId: Number(vehiculoId) };

  if (origen) {
    where.origen = { descripcion: origen };
  }

  const fechaDesdeDate = fechaDesde ? new Date(fechaDesde) : null;
  const fechaHastaDate = fechaHasta ? new Date(fechaHasta) : null;
  const desdeValida = fechaDesdeDate && !Number.isNaN(fechaDesdeDate.getTime());
  const hastaValida = fechaHastaDate && !Number.isNaN(fechaHastaDate.getTime());

  if (desdeValida || hastaValida) {
    where.fechaHora = {
      ...(desdeValida ? { gte: fechaDesdeDate } : {}),
      ...(hastaValida ? { lte: fechaHastaDate } : {}),
    };
  }

  const lecturas = await prisma.lecturaOdometro.findMany({
    where,
    include: { origen: true },
    orderBy: { fechaHora: 'asc' },
  });

  return lecturas.map(serializarLectura);
}

function validarDatosCorregir({ lecturaCorregidaId, valorKm, motivo, usuarioId }) {
  const errores = {};

  const lecturaCorregidaIdNumero = Number(lecturaCorregidaId);
  if (!Number.isInteger(lecturaCorregidaIdNumero) || lecturaCorregidaIdNumero <= 0) {
    errores.lecturaCorregidaId = 'La lectura a corregir es obligatoria';
  }

  const valorKmNumero = Number(valorKm);
  if (!Number.isInteger(valorKmNumero) || valorKmNumero < 0) {
    errores.valorKm = 'El valor del odómetro debe ser un número entero mayor o igual a 0';
  }

  const motivoNormalizado = (motivo || '').trim();
  if (!motivoNormalizado) {
    errores.motivo = 'El motivo de la corrección es obligatorio';
  }

  const usuarioIdNumero = Number(usuarioId);
  if (!Number.isInteger(usuarioIdNumero) || usuarioIdNumero <= 0) {
    errores.usuarioId = 'El usuario que registra la corrección es obligatorio';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    lecturaCorregidaId: lecturaCorregidaIdNumero,
    valorKm: valorKmNumero,
    motivo: motivoNormalizado,
    usuarioId: usuarioIdNumero,
  };
}

// La corrección se valida contra los vecinos (por fechaHora) DE LA LECTURA
// QUE SE ESTÁ CORRIGIENDO, no contra "la última lectura del vehículo" en
// general — así se puede corregir una lectura vieja que ya no es la más
// reciente. Simplificación consciente: cada vecino se usa con su propio
// valorKm tal cual está guardado, sin resolver si ese vecino fue a su vez
// corregido después (ver reporte sobre el caso encontrado al probar esto con
// correcciones encadenadas).
async function corregirLectura({ lecturaCorregidaId, valorKm, motivo, usuarioId }) {
  const datos = validarDatosCorregir({ lecturaCorregidaId, valorKm, motivo, usuarioId });

  return prisma.$transaction(async (tx) => {
    const lecturaCorregida = await tx.lecturaOdometro.findUnique({
      where: { id: datos.lecturaCorregidaId },
    });
    if (!lecturaCorregida) {
      throw new NoEncontradoError('lectura');
    }

    // Mismo patrón de lock que crearLectura, ahora sobre el vehículo dueño de
    // la lectura que se está corrigiendo.
    await tx.$queryRaw`SELECT id FROM vehiculos WHERE id = ${lecturaCorregida.vehiculoId} FOR UPDATE`;

    const anterior = await tx.lecturaOdometro.findFirst({
      where: {
        vehiculoId: lecturaCorregida.vehiculoId,
        id: { not: datos.lecturaCorregidaId },
        fechaHora: { lt: lecturaCorregida.fechaHora },
      },
      orderBy: { fechaHora: 'desc' },
    });

    const posterior = await tx.lecturaOdometro.findFirst({
      where: {
        vehiculoId: lecturaCorregida.vehiculoId,
        id: { not: datos.lecturaCorregidaId },
        fechaHora: { gt: lecturaCorregida.fechaHora },
      },
      orderBy: { fechaHora: 'asc' },
    });

    if (anterior && datos.valorKm < anterior.valorKm) {
      throw new ValidacionError({
        valorKm: `El valor no puede ser menor a la lectura anterior a la corregida (${anterior.valorKm} km)`,
      });
    }
    if (posterior && datos.valorKm > posterior.valorKm) {
      throw new ValidacionError({
        valorKm: `El valor no puede ser mayor a la lectura posterior a la corregida (${posterior.valorKm} km)`,
      });
    }

    const origenCorreccion = await obtenerOrigenPorDescripcion('CORRECCION', tx);

    const creada = await tx.lecturaOdometro.create({
      data: {
        vehiculoId: lecturaCorregida.vehiculoId,
        valorKm: datos.valorKm,
        fechaHora: new Date(),
        origenId: origenCorreccion.id,
        viajeId: lecturaCorregida.viajeId,
        usuarioId: datos.usuarioId,
        lecturaCorregidaId: datos.lecturaCorregidaId,
        motivo: datos.motivo,
      },
      include: { origen: true },
    });

    // Si la lectura corregida no tenía ninguna lectura posterior, era (antes
    // de esta corrección) la más reciente conocida del vehículo, y esta
    // corrección pasa a representar el valor vigente actual: el caché se
    // actualiza. Si ya existía una lectura posterior, esa lectura más nueva
    // sigue siendo la vigente y el caché no se toca — corregir un dato viejo
    // no cambia cuál es la lectura más reciente conocida del vehículo.
    if (!posterior) {
      await tx.vehiculo.update({
        where: { id: lecturaCorregida.vehiculoId },
        data: { kilometraje: datos.valorKm },
      });
    }

    return serializarLectura(creada);
  });
}

// Sigue la cadena de correcciones hacia adelante (quién corrige a quién)
// hasta encontrar la que no tiene, a su vez, ninguna corrección posterior.
async function obtenerLecturaVigente(lecturaId) {
  const lecturaIdNumero = Number(lecturaId);

  let actual = await prisma.lecturaOdometro.findUnique({
    where: { id: lecturaIdNumero },
    include: { origen: true },
  });
  if (!actual) {
    throw new NoEncontradoError('lectura');
  }

  let siguiente = await prisma.lecturaOdometro.findFirst({
    where: { lecturaCorregidaId: actual.id },
    orderBy: { creadoEn: 'desc' },
    include: { origen: true },
  });

  while (siguiente) {
    actual = siguiente;
    // eslint-disable-next-line no-await-in-loop
    siguiente = await prisma.lecturaOdometro.findFirst({
      where: { lecturaCorregidaId: actual.id },
      orderBy: { creadoEn: 'desc' },
      include: { origen: true },
    });
  }

  return serializarLectura(actual);
}

module.exports = {
  obtenerUltimaLectura,
  crearLectura,
  listarLecturas,
  corregirLectura,
  obtenerLecturaVigente,
  ValidacionError,
  NoEncontradoError,
};
