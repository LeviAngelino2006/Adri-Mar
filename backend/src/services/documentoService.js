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
const DIAS_UMBRAL_POR_VENCER = 30;

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
function calcularEstadoVigencia(doc, ahora = new Date()) {
  if (!doc) return 'PENDIENTE';
  const dias = diasHastaVencimiento(doc.fechaVencimiento, ahora);
  if (dias === null) return 'VIGENTE';
  if (dias < 0) return 'VENCIDO';
  if (dias <= DIAS_UMBRAL_POR_VENCER) return 'POR_VENCER';
  return 'VIGENTE';
}

// --- Titulares --------------------------------------------------------------

const TITULARES = {
  VEHICULO: {
    campo: 'vehiculoId',
    carpetaStorage: 'vehiculos',
    noEncontrado: 'Vehículo no encontrado',
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

async function agregarSignedUrl(doc) {
  return doc.archivoPath ? storageService.generarSignedUrl(doc.archivoPath, 3600) : null;
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

function resumirCarpeta(carpeta, totalRequeridos) {
  const totalCargados = carpeta.filter((item) => item.cargado).length;
  const totalVencidos = carpeta.filter((item) => item.documento?.estadoVigencia === 'VENCIDO').length;
  const totalPorVencer = carpeta.filter((item) => item.documento?.estadoVigencia === 'POR_VENCER').length;
  return {
    totalRequeridos,
    totalCargados,
    totalVencidos,
    totalPorVencer,
    alDia: totalCargados === totalRequeridos && totalVencidos === 0,
  };
}

/**
 * Carpeta de documentación completa de un titular: todos los tipos de su
 * categoría con la versión vigente (o pendiente) y Signed URLs temporales.
 */
async function obtenerCarpeta(titular) {
  const { descriptor, entidad, id } = await buscarTitular(titular);

  const tipos = await listarTipos(titular.categoria);
  const vigentes = await prisma.documento.findMany({
    where: { [descriptor.campo]: id },
    distinct: ['tipoDocumentoId'],
    orderBy: ORDEN_RECIENTE,
    include: { tipoDocumento: INCLUDE_TIPO, usuario: SELECT_USUARIO },
  });

  const carpeta = await Promise.all(
    tipos.map(async (tipo) => {
      const doc = vigentes.find((d) => d.tipoDocumentoId === tipo.id) || null;
      if (!doc) return { tipo, cargado: false, documento: null };
      return {
        tipo,
        cargado: true,
        documento: {
          ...doc,
          esVigente: true,
          signedUrl: await agregarSignedUrl(doc),
          estadoVigencia: calcularEstadoVigencia(doc),
        },
      };
    })
  );

  return {
    ...descriptor.ficha(entidad),
    resumen: resumirCarpeta(carpeta, tipos.length),
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

  return Promise.all(
    versiones.map(async (doc, indice) => ({
      ...doc,
      esVigente: indice === 0,
      signedUrl: await agregarSignedUrl(doc),
      estadoVigencia: calcularEstadoVigencia(doc),
    }))
  );
}

// --- Registro ---------------------------------------------------------------

function parsearFecha(valor, mensaje) {
  if (!valor) return null;
  const fecha = new Date(valor.length === 10 ? `${valor}T12:00:00Z` : valor);
  if (isNaN(fecha.getTime())) throw errorHttp(400, mensaje);
  return fecha;
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
  const { descriptor, id } = await buscarTitular(titular);

  if (tipoDocumentoId === undefined || tipoDocumentoId === null || tipoDocumentoId === '') {
    throw errorHttp(400, 'El tipo de documento es obligatorio.');
  }
  const tipo = await buscarTipoParaTitular(tipoDocumentoId, titular.categoria);

  const docPrevio = await prisma.documento.findFirst({
    where: { [descriptor.campo]: id, tipoDocumentoId: tipo.id },
    orderBy: ORDEN_RECIENTE,
  });

  if (tipo.requiereArchivo && !file && !docPrevio?.archivoPath) {
    throw errorHttp(400, `El tipo de documento '${tipo.descripcion}' requiere adjuntar un archivo en formato PDF.`);
  }
  if (tipo.requiereVencimiento && !fechaVencimiento) {
    throw errorHttp(400, `La fecha de vencimiento es obligatoria para '${tipo.descripcion}'.`);
  }

  const parsedEmision = parsearFecha(fechaEmision, 'La fecha de emisión ingresada no es válida.');
  const parsedVencimiento = parsearFecha(fechaVencimiento, 'La fecha de vencimiento ingresada no es válida.');
  if (parsedEmision && parsedVencimiento && parsedVencimiento < parsedEmision) {
    throw errorHttp(400, 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
  }

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
    signedUrl: await agregarSignedUrl(resultado.nuevo),
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
  select: { id: true, tipoDocumentoId: true, fechaVencimiento: true },
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
 * Resumen de documentación de todos los titulares de una categoría (flota de
 * vehículos activos o choferes), para filtrar por vencidos o pendientes.
 */
async function obtenerEstado(categoria) {
  descriptorDe(categoria);
  const listado = LISTADOS[categoria];
  const totalRequeridos = await prisma.tipoDocumento.count({
    where: { categoriaDocumento: { descripcion: categoria } },
  });
  const titulares = await listado.listar();
  const ahora = new Date();

  return titulares.map((titular) => {
    const estados = titular.documentos.map((doc) => calcularEstadoVigencia(doc, ahora));
    const totalCargados = titular.documentos.length;
    const tienePendientes = totalCargados < totalRequeridos;
    const tieneVencidos = estados.includes('VENCIDO');

    return {
      ...listado.serializar(titular),
      totalCargados,
      totalRequeridos,
      tieneVencidos,
      tienePorVencer: estados.includes('POR_VENCER'),
      tienePendientes,
      alDia: !tienePendientes && !tieneVencidos,
    };
  });
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
    .map((doc) => ({ doc, diasRestantes: diasHastaVencimiento(doc.fechaVencimiento, ahora) }))
    .filter(({ diasRestantes }) => diasRestantes !== null && diasRestantes <= DIAS_UMBRAL_POR_VENCER)
    .map(({ doc, diasRestantes }) => ({
      id: doc.id,
      tipo: doc.tipoDocumento.descripcion,
      fechaVencimiento: doc.fechaVencimiento,
      observaciones: doc.observaciones,
      ...alerta.titular(doc),
      estado: calcularEstadoVigencia(doc, ahora),
      diasRestantes,
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
  calcularEstadoVigencia,
  diasHastaVencimiento,
  listarTipos,
  obtenerCarpeta,
  obtenerHistorial,
  registrarDocumento,
  eliminarDocumento,
  obtenerEstado,
  obtenerAlertasVencimiento,
};
