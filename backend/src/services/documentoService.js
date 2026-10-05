const path = require('path');
const prisma = require('./prismaClient');
const storageService = require('./storageService');

function calcularEstadoVigencia(doc) {
  if (!doc) return 'PENDIENTE';
  if (!doc.fechaVencimiento) return 'VIGENTE';

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vencimiento = new Date(doc.fechaVencimiento);
  vencimiento.setHours(0, 0, 0, 0);

  const diffTime = vencimiento.getTime() - hoy.getTime();
  const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return 'VENCIDO';
  }
  if (diffDias <= 30) {
    return 'POR_VENCER';
  }
  return 'VIGENTE';
}

/**
 * Obtiene el catálogo de tipos de documentos disponibles.
 * @param {string} aplicaA - 'VEHICULO' o 'CHOFER'
 */
async function listarTipos(aplicaA = 'VEHICULO') {
  return prisma.tipoDocumento.findMany({
    where: { aplicaA },
    orderBy: { orden: 'asc' },
  });
}

/**
 * Obtiene la carpeta de documentación completa de un vehículo.
 * Retorna todos los tipos reglamentarios con su estado (cargado o pendiente)
 * y genera Signed URLs temporales para los documentos cargados con PDF.
 */
async function obtenerDocumentacionVehiculo(vehiculoId) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: parseInt(vehiculoId, 10) },
    include: {
      tipoVehiculo: true,
      estadoVehiculo: true,
    },
  });

  if (!vehiculo) {
    const error = new Error('Vehículo no encontrado');
    error.status = 404;
    throw error;
  }

  const tipos = await prisma.tipoDocumento.findMany({
    where: { aplicaA: 'VEHICULO' },
    orderBy: { orden: 'asc' },
  });

  const documentosVigentes = await prisma.documentoVehiculo.findMany({
    where: {
      vehiculoId: vehiculo.id,
      esVigente: true,
    },
    include: {
      tipoDocumento: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
        },
      },
    },
  });

  const carpeta = await Promise.all(
    tipos.map(async (tipo) => {
      const doc = documentosVigentes.find((d) => d.tipoDocumentoId === tipo.id) || null;

      let signedUrl = null;
      if (doc && doc.archivoPath) {
        signedUrl = await storageService.generarSignedUrl(doc.archivoPath, 3600);
      }

      const estadoVigencia = calcularEstadoVigencia(doc);

      return {
        tipo,
        cargado: !!doc,
        documento: doc
          ? {
              ...doc,
              signedUrl,
              estadoVigencia,
            }
          : null,
      };
    })
  );

  const totalRequeridos = tipos.length;
  const totalCargados = carpeta.filter((item) => item.cargado).length;
  const totalVencidos = carpeta.filter(
    (item) => item.cargado && item.documento.estadoVigencia === 'VENCIDO'
  ).length;
  const totalPorVencer = carpeta.filter(
    (item) => item.cargado && item.documento.estadoVigencia === 'POR_VENCER'
  ).length;

  return {
    vehiculo,
    resumen: {
      totalRequeridos,
      totalCargados,
      totalVencidos,
      totalPorVencer,
      alDia: totalCargados === totalRequeridos && totalVencidos === 0,
    },
    documentos: carpeta,
  };
}

/**
 * Consulta el historial de renovaciones de un tipo de documento para un vehículo.
 */
async function obtenerHistorialDocumento(vehiculoId, tipoDocumentoId) {
  const vId = parseInt(vehiculoId, 10);
  const tId = parseInt(tipoDocumentoId, 10);

  const historial = await prisma.documentoVehiculo.findMany({
    where: {
      vehiculoId: vId,
      tipoDocumentoId: tId,
    },
    orderBy: { creadoEn: 'desc' },
    include: {
      tipoDocumento: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
        },
      },
    },
  });

  return Promise.all(
    historial.map(async (doc) => {
      let signedUrl = null;
      if (doc.archivoPath) {
        signedUrl = await storageService.generarSignedUrl(doc.archivoPath, 3600);
      }
      return {
        ...doc,
        signedUrl,
        estadoVigencia: calcularEstadoVigencia(doc),
      };
    })
  );
}

/**
 * Registra o renueva un documento para un vehículo.
 * Si ya existía un documento vigente para ese tipo, lo pasa a esVigente = false.
 */
async function registrarDocumentoVehiculo({
  vehiculoId,
  tipoDocumentoId,
  fechaEmision,
  fechaVencimiento,
  observaciones,
  file,
  usuarioId,
}) {
  const vId = parseInt(vehiculoId, 10);
  const tId = parseInt(tipoDocumentoId, 10);

  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: vId },
    include: { estadoVehiculo: true },
  });

  if (!vehiculo) {
    const error = new Error('El vehículo especificado no existe.');
    error.status = 404;
    throw error;
  }

  const tipoDocumento = await prisma.tipoDocumento.findUnique({
    where: { id: tId },
  });

  if (!tipoDocumento || tipoDocumento.aplicaA !== 'VEHICULO') {
    const error = new Error('El tipo de documento es inválido o no aplica a vehículos.');
    error.status = 400;
    throw error;
  }

  // Validación: requiere archivo
  if (tipoDocumento.requiereArchivo && !file) {
    const error = new Error(
      `El tipo de documento '${tipoDocumento.descripcion}' requiere adjuntar un archivo en formato PDF.`
    );
    error.status = 400;
    throw error;
  }

  // Validación: requiere vencimiento
  if (tipoDocumento.requiereVencimiento && !fechaVencimiento) {
    const error = new Error(
      `La fecha de vencimiento es obligatoria para '${tipoDocumento.descripcion}'.`
    );
    error.status = 400;
    throw error;
  }

  let parsedEmision = null;
  if (fechaEmision) {
    parsedEmision = new Date(fechaEmision.length === 10 ? `${fechaEmision}T12:00:00Z` : fechaEmision);
    if (isNaN(parsedEmision.getTime())) {
      const error = new Error('La fecha de emisión ingresada no es válida.');
      error.status = 400;
      throw error;
    }
  }

  let parsedVencimiento = null;
  if (fechaVencimiento) {
    parsedVencimiento = new Date(
      fechaVencimiento.length === 10 ? `${fechaVencimiento}T12:00:00Z` : fechaVencimiento
    );
    if (isNaN(parsedVencimiento.getTime())) {
      const error = new Error('La fecha de vencimiento ingresada no es válida.');
      error.status = 400;
      throw error;
    }

    if (parsedEmision && parsedVencimiento < parsedEmision) {
      const error = new Error('La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
      error.status = 400;
      throw error;
    }
  }

  let storagePath = null;
  let nombreOriginal = null;

  if (file) {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.pdf';
    nombreOriginal = file.originalname;
    storagePath = `vehiculos/${vId}/${tipoDocumento.codigo}_${timestamp}${ext}`;

    await storageService.subirArchivo(file.buffer, storagePath, file.mimetype || 'application/pdf');
  }

  // Versionado: Marcar cualquier documento previo vigente de este tipo como no vigente
  await prisma.documentoVehiculo.updateMany({
    where: {
      vehiculoId: vId,
      tipoDocumentoId: tId,
      esVigente: true,
    },
    data: {
      esVigente: false,
    },
  });

  const nuevoDocumento = await prisma.documentoVehiculo.create({
    data: {
      vehiculoId: vId,
      tipoDocumentoId: tId,
      archivoPath: storagePath,
      nombreOriginal,
      fechaEmision: parsedEmision,
      fechaVencimiento: parsedVencimiento,
      observaciones: observaciones?.trim() || null,
      esVigente: true,
      usuarioId,
    },
    include: {
      tipoDocumento: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
        },
      },
    },
  });

  let signedUrl = null;
  if (nuevoDocumento.archivoPath) {
    signedUrl = await storageService.generarSignedUrl(nuevoDocumento.archivoPath, 3600);
  }

  return {
    ...nuevoDocumento,
    signedUrl,
    estadoVigencia: calcularEstadoVigencia(nuevoDocumento),
  };
}

/**
 * Elimina un documento específico y su archivo asociado en Supabase Storage.
 * Si era el vigente, restaura la vigencia de la versión previa si existe.
 */
async function eliminarDocumentoVehiculo(vehiculoId, documentoId) {
  const vId = parseInt(vehiculoId, 10);
  const docId = parseInt(documentoId, 10);

  const doc = await prisma.documentoVehiculo.findFirst({
    where: {
      id: docId,
      vehiculoId: vId,
    },
  });

  if (!doc) {
    const error = new Error('Documento no encontrado.');
    error.status = 404;
    throw error;
  }

  if (doc.archivoPath) {
    await storageService.eliminarArchivo(doc.archivoPath);
  }

  await prisma.documentoVehiculo.delete({
    where: { id: docId },
  });

  if (doc.esVigente) {
    const versionAnterior = await prisma.documentoVehiculo.findFirst({
      where: {
        vehiculoId: vId,
        tipoDocumentoId: doc.tipoDocumentoId,
      },
      orderBy: { creadoEn: 'desc' },
    });

    if (versionAnterior) {
      await prisma.documentoVehiculo.update({
        where: { id: versionAnterior.id },
        data: { esVigente: true },
      });
    }
  }

  return { mensaje: 'Documento eliminado correctamente.' };
}

module.exports = {
  listarTipos,
  obtenerDocumentacionVehiculo,
  obtenerHistorialDocumento,
  registrarDocumentoVehiculo,
  eliminarDocumentoVehiculo,
};
