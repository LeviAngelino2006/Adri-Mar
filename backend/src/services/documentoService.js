const crypto = require('crypto');
const path = require('path');
const prisma = require('./prismaClient');
const storageService = require('./storageService');

// Un documento pertenece a un vehículo o a un chofer. Todo el servicio se
// escribe una sola vez y recibe el titular como { categoria, id }, donde
// categoria es la descripcion de CategoriaDocumento ('VEHICULO' | 'CHOFER').
//
// No hay un flag "vigente": cada fila de `documentos` es una versión y la
// vigente es la más reciente por titular y tipo (ver ORDEN_RECIENTE). Eliminar
// la última versión deja vigente a la anterior sin lógica extra.

const ID_MAXIMO = 2147483647; // INTEGER de Postgres
const MAX_HISTORICOS = 2; // versiones viejas que se conservan además de la vigente
const SEGUNDOS_URL_ARCHIVO = 5 * 60;

// Adri-mar opera solo en Córdoba (UTC-3 todo el año): mismo criterio de offset
// fijo que aFechaCordoba() en viajeService, en vez de depender de la zona
// horaria del servidor.
const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Más reciente primero; el id desempata dos cargas en el mismo instante.
const ORDEN_RECIENTE = [{ creadoEn: 'desc' }, { id: 'desc' }];

const SELECT_USUARIO = { select: { id: true, nombre: true, apellido: true } };
const INCLUDE_TIPO = { include: { categoriaDocumento: true } };

function errorHttp(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// Errores de validación por campo, con el mismo formato que
// vehiculoService.ValidacionError: el controller responde 400 { errores }.
class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function parsearId(valor, mensaje) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) throw errorHttp(400, mensaje);
  const id = Number(texto);
  if (id < 1 || id > ID_MAXIMO) throw errorHttp(400, mensaje);
  return id;
}

function sanearNombreArchivo(nombreOriginal) {
  if (!nombreOriginal) return null;
  try {
    return Buffer.from(nombreOriginal, 'latin1').toString('utf8').normalize('NFC');
  } catch {
    return String(nombreOriginal).normalize('NFC');
  }
}

// --- Vigencia ---------------------------------------------------------------

// Día calendario de Córdoba de un instante, como días desde la época.
function diaCordoba(fecha) {
  const iso = new Date(fecha.getTime() - CORDOBA_OFFSET_MS).toISOString().slice(0, 10);
  return Date.parse(`${iso}T00:00:00Z`) / MS_POR_DIA;
}

// Días de calendario (en Córdoba) entre hoy y el vencimiento; negativo si ya
// venció, 0 si vence hoy. null si no tiene vencimiento.
function diasHastaVencimiento(fechaVencimiento, ahora = new Date()) {
  if (!fechaVencimiento) return null;
  return diaCordoba(new Date(fechaVencimiento)) - diaCordoba(ahora);
}

// Único cálculo de vigencia: lo usan la carpeta, el estado de flota/choferes y
// las alertas. Sin documento es PENDIENTE; sin fecha de vencimiento, VIGENTE.
// El umbral de "Por vencer" es el diasAviso del tipo del documento, así que
// `doc` tiene que traer `tipoDocumento` (toda consulta lo incluye).
function calcularEstadoVigencia(doc, ahora = new Date()) {
  if (!doc) return 'PENDIENTE';
  const dias = diasHastaVencimiento(doc.fechaVencimiento, ahora);
  if (dias === null) return 'VIGENTE';
  if (dias < 0) return 'VENCIDO';
  if (dias <= doc.tipoDocumento.diasAviso) return 'POR_VENCER';
  return 'VIGENTE';
}

// --- Titulares --------------------------------------------------------------

const TITULARES = {
  VEHICULO: {
    campo: 'vehiculoId',
    carpetaStorage: 'vehiculos',
    noEncontrado: 'Vehículo no encontrado',
    // La carpeta de un vehículo dado de baja se puede consultar, no modificar.
    validarParaRegistro: (vehiculo) => {
      if (vehiculo.estadoVehiculo?.descripcion === 'DADO_DE_BAJA') {
        throw errorHttp(400, 'No se puede modificar la documentación de un vehículo dado de baja.');
      }
    },
    buscar: (id) =>
      prisma.vehiculo.findUnique({
        where: { id },
        include: { tipoVehiculo: true, estadoVehiculo: true },
      }),
    ficha: (vehiculo) => ({ vehiculo }),
  },
  CHOFER: {
    campo: 'choferId',
    carpetaStorage: 'choferes',
    noEncontrado: 'Chofer no encontrado',
    // Solo se le carga documentación a un usuario ACTIVO que conduce (perfil
    // CHOFER o habilitado para conducir). Consultar su carpeta sigue permitido
    // para conservar el historial.
    validarParaRegistro: (usuario) => {
      if (usuario.estadoUsuario?.descripcion !== 'ACTIVO') {
        throw errorHttp(400, 'No se puede registrar documentación de un usuario inactivo.');
      }
      if (usuario.perfil?.descripcion !== 'CHOFER' && !usuario.habilitadoParaConducir) {
        throw errorHttp(400, 'El usuario no es chofer ni está habilitado para conducir.');
      }
    },
    buscar: (id) =>
      prisma.usuario.findUnique({
        where: { id },
        include: { perfil: true, estadoUsuario: true },
      }),
    ficha: (chofer) => ({
      chofer: {
        id: chofer.id,
        nombre: chofer.nombre,
        apellido: chofer.apellido,
        dni: chofer.dni,
        email: chofer.email,
        telefono: chofer.telefono,
        nombreUsuario: chofer.nombreUsuario,
        perfil: chofer.perfil,
        estadoUsuario: chofer.estadoUsuario,
        habilitadoParaConducir: chofer.habilitadoParaConducir,
      },
    }),
  },
};

function descriptorDe(categoria) {
  const descriptor = TITULARES[categoria];
  if (!descriptor) throw errorHttp(400, 'La categoría de documento es inválida. Valores: VEHICULO, CHOFER.');
  return descriptor;
}

// Valida el id y que el titular exista. Devuelve la entidad (vehículo/usuario).
async function buscarTitular({ categoria, id }) {
  const descriptor = descriptorDe(categoria);
  const titularId = parsearId(id, 'El identificador del titular no es válido.');
  const entidad = await descriptor.buscar(titularId);
  if (!entidad) throw errorHttp(404, descriptor.noEncontrado);
  return { descriptor, entidad, id: titularId };
}

// Busca el tipo y exige que pertenezca a la categoría del titular.
async function buscarTipoParaTitular(tipoDocumentoId, categoria) {
  const tipoId = parsearId(tipoDocumentoId, 'El tipo de documento es inválido.');
  const tipo = await prisma.tipoDocumento.findUnique({
    where: { id: tipoId },
    include: { categoriaDocumento: true },
  });
  if (!tipo) throw errorHttp(404, 'Tipo de documento no encontrado.');
  if (tipo.categoriaDocumento.descripcion !== categoria) {
    throw errorHttp(400, `El tipo de documento '${tipo.descripcion}' no aplica a ${categoria === 'VEHICULO' ? 'vehículos' : 'choferes'}.`);
  }
  return tipo;
}

// --- Catálogo ---------------------------------------------------------------

/**
 * Tipos de documento de una categoría ('VEHICULO' o 'CHOFER').
 */
async function listarTipos(categoria = 'VEHICULO') {
  descriptorDe(categoria);
  return prisma.tipoDocumento.findMany({
    where: { categoriaDocumento: { descripcion: categoria } },
    include: INCLUDE_TIPO.include,
    orderBy: { id: 'asc' },
  });
}

// --- Consultas --------------------------------------------------------------

// Estado de la documentación de un titular a partir de sus tipos requeridos y
// de sus versiones vigentes (cada una con `tipoDocumento.{descripcion,diasAviso}`).
// Lo comparten la carpeta y el estado de flota/choferes.
//
// estadoDocumentacion, por prioridad: VENCIDA si hay algún documento vencido;
// si no, POR_VENCER; si no, INCOMPLETA si falta algún tipo; si no, AL_DIA.
function resumirDocumentacion(tipos, vigentes, ahora = new Date()) {
  const conEstado = vigentes.map((doc) => ({ doc, estado: calcularEstadoVigencia(doc, ahora) }));
  const porVencimiento = (a, b) => new Date(a.doc.fechaVencimiento) - new Date(b.doc.fechaVencimiento);
  const vencidos = conEstado.filter((e) => e.estado === 'VENCIDO').sort(porVencimiento);
  const porVencer = conEstado.filter((e) => e.estado === 'POR_VENCER').sort(porVencimiento);

  const cargados = new Set(vigentes.map((d) => d.tipoDocumentoId));
  const faltantes = tipos.filter((t) => !cargados.has(t.id)).map((t) => t.descripcion);

  let estadoDocumentacion = 'AL_DIA';
  if (vencidos.length > 0) estadoDocumentacion = 'VENCIDA';
  else if (porVencer.length > 0) estadoDocumentacion = 'POR_VENCER';
  else if (faltantes.length > 0) estadoDocumentacion = 'INCOMPLETA';

  // El vencido más viejo o, si no hay vencidos, el próximo a vencer.
  const urgente = vencidos[0] ?? porVencer[0] ?? null;
  // El próximo vencimiento que todavía no pasó (por vencer o vigente).
  const proximo = conEstado
    .filter((e) => e.estado !== 'VENCIDO' && e.doc.fechaVencimiento)
    .sort(porVencimiento)[0];

  return {
    totalRequeridos: tipos.length,
    totalCargados: tipos.length - faltantes.length,
    totalVencidos: vencidos.length,
    totalPorVencer: porVencer.length,
    estadoDocumentacion,
    documentoUrgente: urgente
      ? {
          tipo: urgente.doc.tipoDocumento.descripcion,
          fechaVencimiento: urgente.doc.fechaVencimiento,
          estadoVigencia: urgente.estado,
        }
      : null,
    faltantes,
    proximoVencimiento: proximo
      ? { tipo: proximo.doc.tipoDocumento.descripcion, fechaVencimiento: proximo.doc.fechaVencimiento }
      : null,
  };
}

/**
 * Carpeta de documentación completa de un titular: todos los tipos de su
 * categoría con la versión vigente (o pendiente). El PDF se pide aparte con
 * obtenerUrlArchivo: acá solo se informa si tiene archivo (tieneArchivo).
 */
async function obtenerCarpeta(titular) {
  const { descriptor, entidad, id } = await buscarTitular(titular);

  const ahora = new Date();
  const tipos = await listarTipos(titular.categoria);
  const vigentes = await prisma.documento.findMany({
    where: { [descriptor.campo]: id },
    distinct: ['tipoDocumentoId'],
    orderBy: ORDEN_RECIENTE,
    include: { tipoDocumento: INCLUDE_TIPO, usuario: SELECT_USUARIO },
  });
  const versiones = await prisma.documento.findMany({
    where: { [descriptor.campo]: id },
    select: { tipoDocumentoId: true },
  });
  const cantidadVersiones = (tipoId) => versiones.filter((v) => v.tipoDocumentoId === tipoId).length;

  const carpeta = tipos.map((tipo) => {
    const doc = vigentes.find((d) => d.tipoDocumentoId === tipo.id) || null;
    if (!doc) return { tipo, cargado: false, cantidadVersiones: 0, documento: null };
    return {
      tipo,
      cargado: true,
      cantidadVersiones: cantidadVersiones(tipo.id),
      documento: {
        ...doc,
        esVigente: true,
        tieneArchivo: Boolean(doc.archivoPath),
        estadoVigencia: calcularEstadoVigencia(doc, ahora),
      },
    };
  });

  const resumen = resumirDocumentacion(tipos, vigentes, ahora);
  return {
    ...descriptor.ficha(entidad),
    resumen: { ...resumen, alDia: resumen.totalCargados === tipos.length && resumen.totalVencidos === 0 },
    documentos: carpeta,
  };
}

/**
 * Historial de versiones de un tipo para un titular, de la más reciente a la
 * más vieja. esVigente es calculado: true solo en la más reciente.
 */
async function obtenerHistorial(titular, tipoDocumentoId) {
  const { descriptor, id } = await buscarTitular(titular);
  const tipo = await buscarTipoParaTitular(tipoDocumentoId, titular.categoria);

  const versiones = await prisma.documento.findMany({
    where: { [descriptor.campo]: id, tipoDocumentoId: tipo.id },
    orderBy: ORDEN_RECIENTE,
    include: { tipoDocumento: INCLUDE_TIPO, usuario: SELECT_USUARIO },
  });

  return versiones.map((doc, indice) => ({
    ...doc,
    esVigente: indice === 0,
    tieneArchivo: Boolean(doc.archivoPath),
    estadoVigencia: calcularEstadoVigencia(doc),
  }));
}

/**
 * URL firmada de 5 minutos para ver o descargar el PDF de una versión. Se pide
 * al momento de usarla: así no vence con la página abierta y no se generan N
 * URLs por cada carpeta que se carga.
 */
async function obtenerUrlArchivo(documentoId) {
  const docId = parsearId(documentoId, 'El identificador del documento no es válido.');
  const doc = await prisma.documento.findUnique({ where: { id: docId } });
  if (!doc) throw errorHttp(404, 'Documento no encontrado.');
  if (!doc.archivoPath) throw errorHttp(404, 'El documento no tiene un archivo adjunto.');

  const url = await storageService.generarSignedUrl(doc.archivoPath, SEGUNDOS_URL_ARCHIVO);
  if (!url) throw errorHttp(502, 'No se pudo generar el enlace al archivo. Intentá de nuevo en unos segundos.');
  return { url };
}

// --- Registro ---------------------------------------------------------------

// null si no vino; una fecha (posiblemente inválida: isNaN(getTime())) si vino.
function parsearFecha(valor) {
  if (!valor) return null;
  const texto = String(valor);
  return new Date(texto.length === 10 ? `${texto}T12:00:00Z` : texto);
}

// Borra del Storage solo los paths que ninguna fila sigue usando. Se llama
// DESPUÉS de confirmar la transacción: un rollback no puede dejar filas
// apuntando a archivos ya borrados.
async function eliminarArchivosHuerfanos(paths) {
  for (const archivoPath of paths) {
    await storageService.eliminarArchivo(archivoPath).catch((err) => {
      console.warn(`No se pudo eliminar el archivo en Storage (${archivoPath}):`, err.message);
    });
  }
}

// Paths de los documentos eliminados que ya no usa ninguna fila. Renovar sin
// PDF nuevo reutiliza el archivoPath anterior, así que varias versiones
// pueden compartir el mismo archivo. Corre dentro de la transacción, ya con
// las filas borradas.
async function pathsSinUso(tx, eliminados) {
  const paths = [...new Set(eliminados.map((d) => d.archivoPath).filter(Boolean))];
  const huerfanos = [];
  for (const archivoPath of paths) {
    const restantes = await tx.documento.count({ where: { archivoPath } });
    if (restantes === 0) huerfanos.push(archivoPath);
  }
  return huerfanos;
}

/**
 * Registra una versión nueva de un documento (alta o renovación). Máximo 2
 * versiones viejas + la vigente: la creación y la purga van en una sola
 * transacción.
 */
async function registrarDocumento(titular, datos, file, usuarioId) {
  const { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones } = datos;
  const { descriptor, entidad, id } = await buscarTitular(titular);
  descriptor.validarParaRegistro(entidad);

  // Se juntan todos los errores de campo para mostrarlos de una vez.
  const errores = {};

  let tipo = null;
  if (tipoDocumentoId === undefined || tipoDocumentoId === null || tipoDocumentoId === '') {
    errores.tipoDocumentoId = 'El tipo de documento es obligatorio.';
  } else {
    try {
      tipo = await buscarTipoParaTitular(tipoDocumentoId, titular.categoria);
    } catch (err) {
      if (!err.status) throw err;
      errores.tipoDocumentoId = err.message;
    }
  }

  const parsedEmision = parsearFecha(fechaEmision);
  const parsedVencimiento = parsearFecha(fechaVencimiento);
  if (parsedEmision && isNaN(parsedEmision.getTime())) {
    errores.fechaEmision = 'La fecha de emisión ingresada no es válida.';
  }
  if (parsedVencimiento && isNaN(parsedVencimiento.getTime())) {
    errores.fechaVencimiento = 'La fecha de vencimiento ingresada no es válida.';
  } else if (parsedEmision && parsedVencimiento && !errores.fechaEmision && parsedVencimiento < parsedEmision) {
    errores.fechaVencimiento = 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.';
  }

  let docPrevio = null;
  if (tipo) {
    docPrevio = await prisma.documento.findFirst({
      where: { [descriptor.campo]: id, tipoDocumentoId: tipo.id },
      orderBy: ORDEN_RECIENTE,
    });
    if (tipo.requiereArchivo && !file && !docPrevio?.archivoPath) {
      errores.archivo = 'Este tipo de documento requiere adjuntar un archivo PDF.';
    }
    if (tipo.requiereVencimiento && !fechaVencimiento) {
      errores.fechaVencimiento = 'La fecha de vencimiento es obligatoria para este tipo de documento.';
    }
  }

  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  let archivoPath = null;
  let nombreArchivo = null;
  let archivoSubido = false;

  if (file) {
    const extension = path.extname(file.originalname) || '.pdf';
    nombreArchivo = sanearNombreArchivo(file.originalname);
    // El sufijo aleatorio evita que dos cargas en el mismo milisegundo pisen el mismo archivo.
    const sufijo = crypto.randomBytes(4).toString('hex');
    archivoPath = `${descriptor.carpetaStorage}/${id}/${tipo.descripcion}_${Date.now()}_${sufijo}${extension}`;
    await storageService.subirArchivo(file.buffer, archivoPath, file.mimetype || 'application/pdf');
    archivoSubido = true;
  } else if (docPrevio?.archivoPath) {
    // Renovación sin PDF nuevo: comparte el archivo de la versión anterior.
    archivoPath = docPrevio.archivoPath;
    nombreArchivo = docPrevio.nombreArchivo;
  }

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.documento.create({
        data: {
          tipoDocumentoId: tipo.id,
          [descriptor.campo]: id,
          archivoPath,
          nombreArchivo,
          fechaEmision: parsedEmision,
          fechaVencimiento: parsedVencimiento,
          observaciones: observaciones?.trim() || null,
          usuarioId,
        },
        include: { tipoDocumento: INCLUDE_TIPO, usuario: SELECT_USUARIO },
      });

      const versiones = await tx.documento.findMany({
        where: { [descriptor.campo]: id, tipoDocumentoId: tipo.id },
        orderBy: ORDEN_RECIENTE,
      });
      const sobrantes = versiones.slice(1 + MAX_HISTORICOS);

      let huerfanos = [];
      if (sobrantes.length > 0) {
        await tx.documento.deleteMany({ where: { id: { in: sobrantes.map((d) => d.id) } } });
        huerfanos = await pathsSinUso(tx, sobrantes);
      }
      return { nuevo, huerfanos };
    });
  } catch (err) {
    // El PDF nuevo ya está en Storage pero ninguna fila lo referencia.
    if (archivoSubido) await eliminarArchivosHuerfanos([archivoPath]);
    throw err;
  }

  await eliminarArchivosHuerfanos(resultado.huerfanos);

  return {
    ...resultado.nuevo,
    esVigente: true,
    tieneArchivo: Boolean(resultado.nuevo.archivoPath),
    estadoVigencia: calcularEstadoVigencia(resultado.nuevo),
  };
}

/**
 * Elimina una versión (y su archivo, si ninguna otra versión lo usa). Si era
 * la vigente, la anterior pasa a serlo sola.
 */
async function eliminarDocumento(titular, documentoId) {
  const { descriptor, id } = await buscarTitular(titular);
  const docId = parsearId(documentoId, 'El identificador del documento no es válido.');

  const doc = await prisma.documento.findFirst({
    where: { id: docId, [descriptor.campo]: id },
  });
  if (!doc) throw errorHttp(404, 'Documento no encontrado.');

  const huerfanos = await prisma.$transaction(async (tx) => {
    await tx.documento.delete({ where: { id: doc.id } });
    return pathsSinUso(tx, [doc]);
  });
  await eliminarArchivosHuerfanos(huerfanos);

  return { ok: true, mensaje: 'Documento eliminado correctamente.' };
}

// --- Estado de flota / choferes ---------------------------------------------

const DOCUMENTOS_VIGENTES = {
  distinct: ['tipoDocumentoId'],
  orderBy: ORDEN_RECIENTE,
  select: {
    id: true,
    tipoDocumentoId: true,
    fechaVencimiento: true,
    tipoDocumento: { select: { descripcion: true, diasAviso: true } },
  },
};

const LISTADOS = {
  VEHICULO: {
    listar: () =>
      prisma.vehiculo.findMany({
        where: { estadoVehiculo: { descripcion: { not: 'DADO_DE_BAJA' } } },
        include: { tipoVehiculo: true, estadoVehiculo: true, documentos: DOCUMENTOS_VIGENTES },
        orderBy: { numeroInterno: 'asc' },
      }),
    serializar: (v) => ({
      id: v.id,
      dominio: v.dominio,
      numeroInterno: v.numeroInterno,
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      asientos: v.asientos,
      kilometraje: v.kilometraje,
      tipoVehiculo: v.tipoVehiculo,
      estadoVehiculo: v.estadoVehiculo,
    }),
  },
  CHOFER: {
    listar: () =>
      prisma.usuario.findMany({
        where: {
          estadoUsuario: { descripcion: 'ACTIVO' },
          OR: [{ perfil: { descripcion: 'CHOFER' } }, { habilitadoParaConducir: true }],
        },
        include: { perfil: true, estadoUsuario: true, documentos: DOCUMENTOS_VIGENTES },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      }),
    serializar: (c) => ({
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      dni: c.dni,
      email: c.email,
      telefono: c.telefono,
      nombreUsuario: c.nombreUsuario,
      perfil: c.perfil,
      estadoUsuario: c.estadoUsuario,
      habilitadoParaConducir: c.habilitadoParaConducir,
    }),
  },
};

/**
 * Estado de documentación de todos los titulares de una categoría (flota de
 * vehículos activos o choferes activos). Por titular: estadoDocumentacion
 * (VENCIDA | POR_VENCER | INCOMPLETA | AL_DIA), documentoUrgente, faltantes y
 * proximoVencimiento (ver resumirDocumentacion), más los totales.
 */
async function obtenerEstado(categoria) {
  descriptorDe(categoria);
  const listado = LISTADOS[categoria];
  const tipos = await prisma.tipoDocumento.findMany({
    where: { categoriaDocumento: { descripcion: categoria } },
    orderBy: { id: 'asc' },
  });
  const titulares = await listado.listar();
  const ahora = new Date();

  return titulares.map((titular) => ({
    ...listado.serializar(titular),
    ...resumirDocumentacion(tipos, titular.documentos, ahora),
  }));
}

// --- Alertas ----------------------------------------------------------------

const ALERTAS = {
  VEHICULO: {
    campo: 'vehiculoId',
    where: { vehiculoId: { not: null }, vehiculo: { estadoVehiculo: { descripcion: { not: 'DADO_DE_BAJA' } } } },
    include: { vehiculo: { select: { id: true, dominio: true, numeroInterno: true, marca: true, modelo: true } } },
    titular: (doc) => ({ vehiculo: doc.vehiculo }),
  },
  CHOFER: {
    campo: 'choferId',
    where: { choferId: { not: null }, chofer: { estadoUsuario: { descripcion: 'ACTIVO' } } },
    include: { chofer: { select: { id: true, nombre: true, apellido: true, nombreUsuario: true } } },
    titular: (doc) => ({ usuario: doc.chofer }),
  },
};

async function alertasDe(categoria, ahora) {
  const alerta = ALERTAS[categoria];
  // Se toma la versión vigente de cada titular y tipo y recién después se
  // filtra por vencimiento: una versión vieja próxima a vencer no es alerta si
  // ya hay una más nueva.
  const vigentes = await prisma.documento.findMany({
    where: alerta.where,
    distinct: [alerta.campo, 'tipoDocumentoId'],
    orderBy: ORDEN_RECIENTE,
    include: { tipoDocumento: true, ...alerta.include },
  });

  return vigentes
    .map((doc) => ({ doc, estado: calcularEstadoVigencia(doc, ahora) }))
    .filter(({ estado }) => estado === 'VENCIDO' || estado === 'POR_VENCER')
    .map(({ doc, estado }) => ({
      id: doc.id,
      tipo: doc.tipoDocumento.descripcion,
      fechaVencimiento: doc.fechaVencimiento,
      observaciones: doc.observaciones,
      ...alerta.titular(doc),
      estado,
      diasRestantes: diasHastaVencimiento(doc.fechaVencimiento, ahora),
      categoria,
    }));
}

async function obtenerAlertasVencimiento() {
  const ahora = new Date();
  const [vehiculos, choferes] = await Promise.all([alertasDe('VEHICULO', ahora), alertasDe('CHOFER', ahora)]);

  const todos = [...vehiculos, ...choferes].sort(
    (a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento)
  );

  return {
    vencidos: todos.filter((d) => d.estado === 'VENCIDO').length,
    proximosAVencer: todos.filter((d) => d.estado === 'POR_VENCER').length,
    totalAlertas: todos.length,
    documentos: todos,
  };
}

module.exports = {
  ValidacionError,
  calcularEstadoVigencia,
  diasHastaVencimiento,
  listarTipos,
  obtenerCarpeta,
  obtenerHistorial,
  obtenerUrlArchivo,
  registrarDocumento,
  eliminarDocumento,
  obtenerEstado,
  obtenerAlertasVencimiento,
};
