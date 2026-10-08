const prisma = require('./prismaClient');

const DIAS_UMBRAL_PROXIMO_VENCIMIENTO = 30;

function calcularEstadoDocumento(fechaVencimiento) {
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

  const documentosVehiculos = await prisma.documentoVehiculo.findMany({
    where: {
      fechaVencimiento: {
        lte: fechaLimite,
      },
    },
    include: {
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
    orderBy: {
      fechaVencimiento: 'asc',
    },
  });

  const documentosUsuarios = await prisma.documentoUsuario.findMany({
    where: {
      fechaVencimiento: {
        lte: fechaLimite,
      },
    },
    include: {
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          nombreUsuario: true,
        },
      },
    },
    orderBy: {
      fechaVencimiento: 'asc',
    },
  });

  const vehiculosConEstado = documentosVehiculos.map((doc) => {
    const { estado, diasRestantes } = calcularEstadoDocumento(doc.fechaVencimiento);
    return {
      ...doc,
      estado,
      diasRestantes,
      categoria: 'VEHICULO',
    };
  });

  const usuariosConEstado = documentosUsuarios.map((doc) => {
    const { estado, diasRestantes } = calcularEstadoDocumento(doc.fechaVencimiento);
    return {
      ...doc,
      estado,
      diasRestantes,
      categoria: 'USUARIO',
    };
  });

  const todos = [...vehiculosConEstado, ...usuariosConEstado].sort(
    (a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento)
  );

  const resumen = {
    vencidos: todos.filter((d) => d.estado === 'VENCIDO').length,
    proximosAVencer: todos.filter((d) => d.estado === 'PROXIMO_A_VENCER').length,
    totalAlertas: todos.length,
    documentos: todos,
  };

  return resumen;
}

async function crearDocumentoVehiculo({ vehiculoId, tipo, numeroComprobante, fechaVencimiento, observaciones }) {
  const doc = await prisma.documentoVehiculo.create({
    data: {
      vehiculoId: Number(vehiculoId),
      tipo,
      numeroComprobante,
      fechaVencimiento: new Date(fechaVencimiento),
      observaciones,
    },
  });
  return { ...doc, ...calcularEstadoDocumento(doc.fechaVencimiento) };
}

async function crearDocumentoUsuario({ usuarioId, tipo, numeroComprobante, fechaVencimiento, observaciones }) {
  const doc = await prisma.documentoUsuario.create({
    data: {
      usuarioId: Number(usuarioId),
      tipo,
      numeroComprobante,
      fechaVencimiento: new Date(fechaVencimiento),
      observaciones,
    },
  });
  return { ...doc, ...calcularEstadoDocumento(doc.fechaVencimiento) };
}

module.exports = {
  calcularEstadoDocumento,
  obtenerAlertasVencimiento,
  crearDocumentoVehiculo,
  crearDocumentoUsuario,
};
