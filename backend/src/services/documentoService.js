const path = require('path');
const prisma = require('./prismaClient');
const storageService = require('./storageService');

function sanearNombreArchivo(nombreOriginal) {
  if (!nombreOriginal) return null;
  try {
    return Buffer.from(nombreOriginal, 'latin1').toString('utf8').normalize('NFC');
  } catch {
    return String(nombreOriginal).normalize('NFC');
  }
}

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
    nombreOriginal = sanearNombreArchivo(file.originalname);
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

  // Regla de negocio: El historial guarda como máximo los últimos 2 sin contar el actual.
  // Al superar el límite de 3 (2 viejos + 1 actual), se elimina el más viejo en Supabase y DB.
  await purgarHistorialExcedenteVehiculo(vId, tId);

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
 * Mantiene un máximo de 2 documentos históricos (además del vigente actual).
 * Si hay más de 2 históricos, elimina los más antiguos en Supabase Storage y DB.
 */
async function purgarHistorialExcedenteVehiculo(vehiculoId, tipoDocumentoId) {
  const vId = parseInt(vehiculoId, 10);
  const tId = parseInt(tipoDocumentoId, 10);

  const historicos = await prisma.documentoVehiculo.findMany({
    where: {
      vehiculoId: vId,
      tipoDocumentoId: tId,
      esVigente: false,
    },
    orderBy: {
      creadoEn: 'desc',
    },
  });

  if (historicos.length > 2) {
    const sobrantes = historicos.slice(2);
    for (const doc of sobrantes) {
      if (doc.archivoPath) {
        await storageService.eliminarArchivo(doc.archivoPath).catch(() => {});
      }
      await prisma.documentoVehiculo.delete({
        where: { id: doc.id },
      });
    }
  }
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

/**
 * Obtiene el resumen de documentación de toda la flota de vehículos activos.
 * Permite filtrar rápidamente por unidades con vencidos o con pendientes.
 */
async function obtenerEstadoFlota() {
  const tipos = await prisma.tipoDocumento.findMany({
    where: { aplicaA: 'VEHICULO' },
    select: { id: true, codigo: true, requiereVencimiento: true },
  });
  const totalRequeridos = tipos.length;

  const vehiculos = await prisma.vehiculo.findMany({
    where: {
      estadoVehiculo: {
        descripcion: { not: 'DADO_DE_BAJA' },
      },
    },
    include: {
      tipoVehiculo: true,
      estadoVehiculo: true,
      documentos: {
        where: { esVigente: true },
        select: {
          id: true,
          tipoDocumentoId: true,
          fechaVencimiento: true,
        },
      },
    },
    orderBy: { numeroInterno: 'asc' },
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return vehiculos.map((v) => {
    const totalCargados = v.documentos.length;
    const tienePendientes = totalCargados < totalRequeridos;

    let tieneVencidos = false;
    let tienePorVencer = false;

    for (const doc of v.documentos) {
      if (doc.fechaVencimiento) {
        const venc = new Date(doc.fechaVencimiento);
        venc.setHours(0, 0, 0, 0);
        const diffDias = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias < 0) {
          tieneVencidos = true;
        } else if (diffDias <= 30) {
          tienePorVencer = true;
        }
      }
    }

    const alDia = !tienePendientes && !tieneVencidos;

    return {
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
      totalCargados,
      totalRequeridos,
      tieneVencidos,
      tienePorVencer,
      tienePendientes,
      alDia,
    };
  });
}

/**
 * Obtiene la carpeta de documentación completa de un chofer.
 */
async function obtenerDocumentacionChofer(choferId) {
  const cId = parseInt(choferId, 10);
  const chofer = await prisma.usuario.findUnique({
    where: { id: cId },
    include: {
      perfil: true,
      estadoUsuario: true,
    },
  });

  if (!chofer) {
    const error = new Error('Chofer no encontrado');
    error.status = 404;
    throw error;
  }

  const tipos = await prisma.tipoDocumento.findMany({
    where: { aplicaA: 'CHOFER' },
    orderBy: { orden: 'asc' },
  });

  const docsCargados = await prisma.documentoChofer.findMany({
    where: {
      choferId: cId,
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

  const docsPorTipo = new Map();
  for (const doc of docsCargados) {
    docsPorTipo.set(doc.tipoDocumentoId, doc);
  }

  const carpeta = await Promise.all(
    tipos.map(async (tipo) => {
      const doc = docsPorTipo.get(tipo.id);
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
 * Consulta el historial de renovaciones de un tipo de documento para un chofer.
 */
async function obtenerHistorialDocumentoChofer(choferId, tipoDocumentoId) {
  const cId = parseInt(choferId, 10);
  const tId = parseInt(tipoDocumentoId, 10);

  const historial = await prisma.documentoChofer.findMany({
    where: {
      choferId: cId,
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
 * Registra o renueva un documento de un chofer.
 */
async function registrarDocumentoChofer(choferId, data, file, usuarioId) {
  const cId = parseInt(choferId, 10);
  const { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones } = data;
  const tId = parseInt(tipoDocumentoId, 10);

  if (isNaN(tId)) {
    const error = new Error('El tipo de documento es obligatorio.');
    error.status = 400;
    throw error;
  }

  const chofer = await prisma.usuario.findUnique({
    where: { id: cId },
  });
  if (!chofer) {
    const error = new Error('Chofer no encontrado');
    error.status = 404;
    throw error;
  }

  const tipoDocumento = await prisma.tipoDocumento.findUnique({
    where: { id: tId },
  });
  if (!tipoDocumento || tipoDocumento.aplicaA !== 'CHOFER') {
    const error = new Error('Tipo de documento no válido para choferes.');
    error.status = 400;
    throw error;
  }

  if (tipoDocumento.requiereArchivo && !file) {
    const error = new Error(
      `El tipo de documento '${tipoDocumento.descripcion}' requiere adjuntar un archivo en formato PDF.`
    );
    error.status = 400;
    throw error;
  }

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
  }

  if (parsedEmision && parsedVencimiento && parsedEmision > parsedVencimiento) {
    const error = new Error('La fecha de emisión no puede ser posterior a la fecha de vencimiento.');
    error.status = 400;
    throw error;
  }

  let storagePath = null;
  let nombreOriginal = null;

  if (file) {
    nombreOriginal = sanearNombreArchivo(file.originalname);
    const extension = path.extname(file.originalname) || '.pdf';
    const timestamp = Date.now();
    storagePath = `choferes/${cId}/${tipoDocumento.codigo}_${timestamp}${extension}`;

    await storageService.subirArchivo(file.buffer, storagePath, file.mimetype);
  }

  await prisma.documentoChofer.updateMany({
    where: {
      choferId: cId,
      tipoDocumentoId: tId,
      esVigente: true,
    },
    data: {
      esVigente: false,
    },
  });

  const nuevoDocumento = await prisma.documentoChofer.create({
    data: {
      choferId: cId,
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

  // Regla de negocio: El historial guarda como máximo los últimos 2 sin contar el actual.
  // Al superar el límite de 3 (2 viejos + 1 actual), se elimina el más viejo en Supabase y DB.
  await purgarHistorialExcedenteChofer(cId, tId);

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
 * Mantiene un máximo de 2 documentos históricos de chofer (además del vigente actual).
 * Si hay más de 2 históricos, elimina los más antiguos en Supabase Storage y DB.
 */
async function purgarHistorialExcedenteChofer(choferId, tipoDocumentoId) {
  const cId = parseInt(choferId, 10);
  const tId = parseInt(tipoDocumentoId, 10);

  const historicos = await prisma.documentoChofer.findMany({
    where: {
      choferId: cId,
      tipoDocumentoId: tId,
      esVigente: false,
    },
    orderBy: {
      creadoEn: 'desc',
    },
  });

  if (historicos.length > 2) {
    const sobrantes = historicos.slice(2);
    for (const doc of sobrantes) {
      if (doc.archivoPath) {
        await storageService.eliminarArchivo(doc.archivoPath).catch(() => {});
      }
      await prisma.documentoChofer.delete({
        where: { id: doc.id },
      });
    }
  }
}

/**
 * Elimina un documento del chofer.
 */
async function eliminarDocumentoChofer(choferId, documentoId) {
  const cId = parseInt(choferId, 10);
  const docId = parseInt(documentoId, 10);

  const doc = await prisma.documentoChofer.findUnique({
    where: { id: docId },
  });

  if (!doc || doc.choferId !== cId) {
    const error = new Error('Documento no encontrado para este chofer.');
    error.status = 404;
    throw error;
  }

  if (doc.archivoPath) {
    await storageService.eliminarArchivo(doc.archivoPath).catch((err) => {
      console.warn(`No se pudo eliminar el archivo físico en Storage (${doc.archivoPath}):`, err.message);
    });
  }

  await prisma.documentoChofer.delete({
    where: { id: docId },
  });

  if (doc.esVigente) {
    const ultimoAnterior = await prisma.documentoChofer.findFirst({
      where: {
        choferId: cId,
        tipoDocumentoId: doc.tipoDocumentoId,
      },
      orderBy: { creadoEn: 'desc' },
    });

    if (ultimoAnterior) {
      await prisma.documentoChofer.update({
        where: { id: ultimoAnterior.id },
        data: { esVigente: true },
      });
    }
  }

  return { ok: true, mensaje: 'Documento eliminado correctamente.' };
}

/**
 * Retorna el estado documental general de todos los choferes habilitados o con perfil CHOFER.
 */
async function obtenerEstadoChoferes() {
  const tipos = await prisma.tipoDocumento.findMany({
    where: { aplicaA: 'CHOFER' },
  });
  const totalRequeridos = tipos.length;

  const choferes = await prisma.usuario.findMany({
    where: {
      OR: [
        { perfil: { descripcion: 'CHOFER' } },
        { habilitadoParaConducir: true },
      ],
    },
    include: {
      perfil: true,
      estadoUsuario: true,
      documentosChofer: {
        where: { esVigente: true },
        select: {
          id: true,
          tipoDocumentoId: true,
          fechaVencimiento: true,
        },
      },
    },
    orderBy: [
      { apellido: 'asc' },
      { nombre: 'asc' },
    ],
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return choferes.map((c) => {
    const totalCargados = c.documentosChofer.length;
    const tienePendientes = totalCargados < totalRequeridos;

    let tieneVencidos = false;
    let tienePorVencer = false;

    for (const doc of c.documentosChofer) {
      if (doc.fechaVencimiento) {
        const venc = new Date(doc.fechaVencimiento);
        venc.setHours(0, 0, 0, 0);
        const diffDias = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias < 0) {
          tieneVencidos = true;
        } else if (diffDias <= 30) {
          tienePorVencer = true;
        }
      }
    }

    const alDia = !tienePendientes && !tieneVencidos;

    return {
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
      totalCargados,
      totalRequeridos,
      tieneVencidos,
      tienePorVencer,
      tienePendientes,
      alDia,
    };
  });
}

const DIAS_UMBRAL_PROXIMO_VENCIMIENTO = 30;

function calcularEstadoDocumento(fechaVencimiento) {
  if (!fechaVencimiento) return { estado: 'VIGENTE', diasRestantes: 999 };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaVenc = new Date(fechaVencimiento);
  fechaVenc.setHours(0, 0, 0, 0);

  const diffTiempo = fechaVenc - hoy;
  const diffDias = Math.ceil(diffTiempo / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { estado: 'VENCIDO', diasRestantes: diffDias };
  } else if (diffDias <= DIAS_UMBRAL_PROXIMO_VENCIMIENTO) {
    return { estado: 'PROXIMO_A_VENCER', diasRestantes: diffDias };
  } else {
    return { estado: 'VIGENTE', diasRestantes: diffDias };
  }
}

async function obtenerAlertasVencimiento() {
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + DIAS_UMBRAL_PROXIMO_VENCIMIENTO);

  const docsVehiculos = await prisma.documentoVehiculo.findMany({
    where: {
      esVigente: true,
      fechaVencimiento: {
        lte: fechaLimite,
      },
      // Solo vehículos que NO estén dados de baja
      vehiculo: {
        estadoVehiculo: {
          descripcion: { not: 'DADO_DE_BAJA' },
        },
      },
    },
    include: {
      tipoDocumento: true,
      vehiculo: {
        select: {
          id: true,
          dominio: true,
          numeroInterno: true,
          marca: true,
          modelo: true,
        },
      },
    },
    orderBy: { fechaVencimiento: 'asc' },
  });

  const docsChoferes = await prisma.documentoChofer.findMany({
    where: {
      esVigente: true,
      fechaVencimiento: {
        lte: fechaLimite,
      },
      // Solo choferes activos
      chofer: {
        estadoUsuario: {
          descripcion: 'ACTIVO',
        },
      },
    },
    include: {
      tipoDocumento: true,
      chofer: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          nombreUsuario: true,
        },
      },
    },
    orderBy: { fechaVencimiento: 'asc' },
  });

  const vehiculosConEstado = docsVehiculos.map((doc) => {
    const { estado, diasRestantes } = calcularEstadoDocumento(doc.fechaVencimiento);
    return {
      id: doc.id,
      tipo: doc.tipoDocumento.descripcion,
      codigoTipo: doc.tipoDocumento.codigo,
      fechaVencimiento: doc.fechaVencimiento,
      observaciones: doc.observaciones,
      vehiculo: doc.vehiculo,
      estado,
      diasRestantes,
      categoria: 'VEHICULO',
    };
  });

  const choferesConEstado = docsChoferes.map((doc) => {
    const { estado, diasRestantes } = calcularEstadoDocumento(doc.fechaVencimiento);
    return {
      id: doc.id,
      tipo: doc.tipoDocumento.descripcion,
      codigoTipo: doc.tipoDocumento.codigo,
      fechaVencimiento: doc.fechaVencimiento,
      observaciones: doc.observaciones,
      usuario: doc.chofer,
      estado,
      diasRestantes,
      categoria: 'USUARIO',
    };
  });

  const todos = [...vehiculosConEstado, ...choferesConEstado].sort(
    (a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento)
  );

  return {
    vencidos: todos.filter((d) => d.estado === 'VENCIDO').length,
    proximosAVencer: todos.filter((d) => d.estado === 'PROXIMO_A_VENCER').length,
    totalAlertas: todos.length,
    documentos: todos,
  };
}

module.exports = {
  calcularEstadoDocumento,
  obtenerAlertasVencimiento,
  listarTipos,
  obtenerDocumentacionVehiculo,
  obtenerHistorialDocumento,
  registrarDocumentoVehiculo,
  eliminarDocumentoVehiculo,
  obtenerEstadoFlota,
  obtenerDocumentacionChofer,
  obtenerHistorialDocumentoChofer,
  registrarDocumentoChofer,
  eliminarDocumentoChofer,
  obtenerEstadoChoferes,
  purgarHistorialExcedenteVehiculo,
  purgarHistorialExcedenteChofer,
};


