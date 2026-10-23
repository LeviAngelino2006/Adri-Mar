const prisma = require('./prismaClient');
const { INCLUDE_MODELO_Y_MARCA, nombresMarcaModelo } = require('../utils/marcaModeloVehiculo');

const CATEGORIAS_VALIDAS = [
  'SERVICE_PREVENTIVO',
  'CAMBIO_ACEITE',
  'CUBIERTAS',
  'FILTROS',
  'FRENOS',
  'ALINEACION_BALANCEO',
  'BATERIA',
  'MECANICA_GENERAL',
  'OTRO',
];

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function serializarPlan(plan) {
  if (!plan) return null;
  const kmVehiculo = plan.vehiculo ? plan.vehiculo.kilometraje : 0;
  const kmRestantes = plan.kmProximoService - kmVehiculo;
  const umbral = plan.umbralAlertaKm ?? 1000;

  let estadoMantenimiento = 'AL_DIA';
  if (kmRestantes <= 0) {
    estadoMantenimiento = 'VENCIDO';
  } else if (kmRestantes <= umbral) {
    estadoMantenimiento = 'PROXIMO';
  }

  let vehiculoSerializado = null;
  if (plan.vehiculo) {
    const { marcaNombre, modeloNombre } = nombresMarcaModelo(plan.vehiculo);
    vehiculoSerializado = {
      id: plan.vehiculo.id,
      dominio: plan.vehiculo.dominio,
      numeroInterno: plan.vehiculo.numeroInterno,
      marca: marcaNombre,
      modelo: modeloNombre,
      kilometraje: plan.vehiculo.kilometraje,
      tipoVehiculo: plan.vehiculo.tipoVehiculo?.descripcion || null,
      tipoVehiculoId: plan.vehiculo.tipoVehiculoId,
    };
  }

  return {
    id: plan.id,
    vehiculoId: plan.vehiculoId,
    vehiculo: vehiculoSerializado,
    plantillaMantenimientoId: plan.plantillaMantenimientoId,
    plantilla: plan.plantillaMantenimiento
      ? {
          id: plan.plantillaMantenimiento.id,
          nombre: plan.plantillaMantenimiento.nombre,
          intervaloKm: plan.plantillaMantenimiento.intervaloKm,
        }
      : null,
    kmUltimoService: plan.kmUltimoService,
    kmProximoService: plan.kmProximoService,
    umbralAlertaKm: plan.umbralAlertaKm,
    kmRestantes,
    kmExcedidos: kmRestantes < 0 ? Math.abs(kmRestantes) : 0,
    estadoMantenimiento,
    activo: plan.activo,
    creadoEn: plan.creadoEn,
    actualizadoEn: plan.actualizadoEn,
  };
}

function serializarMantenimiento(m) {
  if (!m) return null;
  return {
    id: m.id,
    vehiculoId: m.vehiculoId,
    planMantenimientoId: m.planMantenimientoId,
    esServicePreventivo: m.esServicePreventivo,
    categoria: m.categoria,
    fecha: m.fecha,
    kilometraje: m.kilometraje,
    descripcion: m.descripcion,
    repuestos: m.repuestos || null,
    tallerMecanico: m.tallerMecanico || null,
    costo: m.costo ? Number(m.costo) : null,
    observaciones: m.observaciones || null,
    usuarioId: m.usuarioId,
    usuario: m.usuario ? `${m.usuario.nombre} ${m.usuario.apellido}` : null,
    creadoEn: m.creadoEn,
  };
}

async function listarPlantillas() {
  const plantillas = await prisma.plantillaMantenimiento.findMany({
    include: { tipoVehiculo: true },
    orderBy: { tipoVehiculo: { orden: 'asc' } },
  });

  return plantillas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    intervaloKm: p.intervaloKm,
    tipoVehiculoId: p.tipoVehiculoId,
    tipoVehiculo: p.tipoVehiculo ? p.tipoVehiculo.descripcion : null,
  }));
}

async function asignarPlanAVehiculo({ vehiculoId, kmUltimoService, plantillaMantenimientoId }) {
  const errores = {};
  if (!vehiculoId) {
    errores.vehiculoId = 'El vehículo es obligatorio';
    throw new ValidacionError(errores);
  }

  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(vehiculoId) },
    include: { tipoVehiculo: true },
  });

  if (!vehiculo) {
    errores.vehiculoId = 'El vehículo no existe';
    throw new ValidacionError(errores);
  }

  let plantilla = null;
  if (plantillaMantenimientoId) {
    plantilla = await prisma.plantillaMantenimiento.findUnique({
      where: { id: Number(plantillaMantenimientoId) },
    });
  } else {
    plantilla = await prisma.plantillaMantenimiento.findUnique({
      where: { tipoVehiculoId: vehiculo.tipoVehiculoId },
    });
  }

  if (!plantilla) {
    errores.plantillaMantenimientoId = 'No se encontró la plantilla de mantenimiento para este tipo de vehículo';
    throw new ValidacionError(errores);
  }

  const baseKm =
    kmUltimoService !== undefined && kmUltimoService !== null && String(kmUltimoService).trim() !== ''
      ? parseInt(kmUltimoService, 10)
      : vehiculo.kilometraje;

  if (isNaN(baseKm) || baseKm < 0) {
    errores.kmUltimoService = 'El kilometraje del último service debe ser un número entero mayor o igual a 0';
    throw new ValidacionError(errores);
  }

  const kmProximo = baseKm + plantilla.intervaloKm;

  const planExistente = await prisma.planMantenimiento.findUnique({
    where: { vehiculoId: vehiculo.id },
  });

  let plan;
  if (planExistente) {
    plan = await prisma.planMantenimiento.update({
      where: { id: planExistente.id },
      data: {
        plantillaMantenimientoId: plantilla.id,
        kmUltimoService: baseKm,
        kmProximoService: kmProximo,
        activo: true,
      },
      include: {
        vehiculo: { include: { tipoVehiculo: true, ...INCLUDE_MODELO_Y_MARCA } },
        plantillaMantenimiento: true,
      },
    });
  } else {
    plan = await prisma.planMantenimiento.create({
      data: {
        vehiculoId: vehiculo.id,
        plantillaMantenimientoId: plantilla.id,
        kmUltimoService: baseKm,
        kmProximoService: kmProximo,
        activo: true,
      },
      include: {
        vehiculo: { include: { tipoVehiculo: true, ...INCLUDE_MODELO_Y_MARCA } },
        plantillaMantenimiento: true,
      },
    });
  }

  return serializarPlan(plan);
}

async function listarPlanesYAlertas({ soloAlertas = false, busqueda = '' } = {}) {
  const planes = await prisma.planMantenimiento.findMany({
    where: { activo: true },
    include: {
      vehiculo: { include: { tipoVehiculo: true, ...INCLUDE_MODELO_Y_MARCA } },
      plantillaMantenimiento: true,
    },
  });

  let serializados = planes.map(serializarPlan);

  if (busqueda && busqueda.trim()) {
    const q = busqueda.trim().toLowerCase();
    serializados = serializados.filter((p) => {
      const v = p.vehiculo;
      if (!v) return false;
      return (
        v.dominio.toLowerCase().includes(q) ||
        v.numeroInterno.toLowerCase().includes(q) ||
        (v.marca && v.marca.toLowerCase().includes(q)) ||
        (v.modelo && v.modelo.toLowerCase().includes(q))
      );
    });
  }

  if (soloAlertas) {
    serializados = serializados.filter(
      (p) => p.estadoMantenimiento === 'VENCIDO' || p.estadoMantenimiento === 'PROXIMO'
    );
  }

  // Ordenar por prioridad:
  // 1. VENCIDO (los más excedidos primero)
  // 2. PROXIMO (los que les faltan menos km primero)
  // 3. AL_DIA (por número interno o km restantes)
  serializados.sort((a, b) => {
    const prioridad = { VENCIDO: 1, PROXIMO: 2, AL_DIA: 3 };
    if (prioridad[a.estadoMantenimiento] !== prioridad[b.estadoMantenimiento]) {
      return prioridad[a.estadoMantenimiento] - prioridad[b.estadoMantenimiento];
    }
    return a.kmRestantes - b.kmRestantes;
  });

  return serializados;
}

async function registrarMantenimiento(datos, usuarioId) {
  const {
    vehiculoId,
    categoria,
    esServicePreventivo,
    fecha,
    kilometraje,
    descripcion,
    repuestos,
    tallerMecanico,
    costo,
    observaciones,
  } = datos;

  const errores = {};

  if (!vehiculoId) errores.vehiculoId = 'El vehículo es obligatorio';
  if (!categoria) {
    errores.categoria = 'La categoría es obligatoria';
  } else if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    errores.categoria = `Categoría no válida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}`;
  }

  const kmNum = parseInt(kilometraje, 10);
  if (isNaN(kmNum) || kmNum < 0) {
    errores.kilometraje = 'El kilometraje debe ser un entero mayor o igual a 0';
  }

  if (!descripcion || !descripcion.trim()) {
    errores.descripcion = 'La descripción de las tareas es obligatoria';
  }

  let fechaValida;
  if (!fecha) {
    fechaValida = new Date();
  } else {
    fechaValida = new Date(fecha);
    if (isNaN(fechaValida.getTime())) {
      errores.fecha = 'La fecha ingresada no es válida';
    }
  }

  let costoNum = null;
  if (costo !== undefined && costo !== null && String(costo).trim() !== '') {
    costoNum = parseFloat(costo);
    if (isNaN(costoNum) || costoNum < 0) {
      errores.costo = 'El costo debe ser un valor numérico positivo';
    }
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(vehiculoId) },
    include: {
      tipoVehiculo: true,
      planMantenimiento: { include: { plantillaMantenimiento: true } },
    },
  });

  if (!vehiculo) {
    errores.vehiculoId = 'El vehículo no existe';
    throw new ValidacionError(errores);
  }

  const esPreventivo = Boolean(esServicePreventivo || categoria === 'SERVICE_PREVENTIVO');

  // Si es preventivo y el vehículo no tiene plan todavía, buscar la plantilla y asignársela
  let planMantenimiento = vehiculo.planMantenimiento;
  if (esPreventivo && !planMantenimiento) {
    const plantilla = await prisma.plantillaMantenimiento.findUnique({
      where: { tipoVehiculoId: vehiculo.tipoVehiculoId },
    });
    if (plantilla) {
      planMantenimiento = await prisma.planMantenimiento.create({
        data: {
          vehiculoId: vehiculo.id,
          plantillaMantenimientoId: plantilla.id,
          kmUltimoService: kmNum,
          kmProximoService: kmNum + plantilla.intervaloKm,
          activo: true,
        },
        include: { plantillaMantenimiento: true },
      });
    }
  }

  // Ejecutar registro y posibles actualizaciones
  let mantenimientoCreado;
  await prisma.$transaction(async (tx) => {
    mantenimientoCreado = await tx.mantenimientoRealizado.create({
      data: {
        vehiculoId: vehiculo.id,
        planMantenimientoId: planMantenimiento ? planMantenimiento.id : null,
        esServicePreventivo: esPreventivo,
        categoria,
        fecha: fechaValida,
        kilometraje: kmNum,
        descripcion: descripcion.trim(),
        repuestos: repuestos ? repuestos.trim() : null,
        tallerMecanico: tallerMecanico ? tallerMecanico.trim() : null,
        costo: costoNum,
        observaciones: observaciones ? observaciones.trim() : null,
        usuarioId: Number(usuarioId),
      },
      include: { usuario: true },
    });

    // Si es service preventivo, actualiza el plan del vehículo
    if (esPreventivo && planMantenimiento) {
      const intervalo = planMantenimiento.plantillaMantenimiento.intervaloKm;
      await tx.planMantenimiento.update({
        where: { id: planMantenimiento.id },
        data: {
          kmUltimoService: kmNum,
          kmProximoService: kmNum + intervalo,
          activo: true,
        },
      });
    }

    // Si el odómetro ingresado es mayor al que tenía el vehículo, calibrar
    if (kmNum > vehiculo.kilometraje) {
      await tx.vehiculo.update({
        where: { id: vehiculo.id },
        data: { kilometraje: kmNum },
      });

      // Registrar lectura de odómetro si existe el origen MANTENIMIENTO
      const origen = await tx.origenLectura.findUnique({
        where: { descripcion: 'MANTENIMIENTO' },
      });
      if (origen) {
        await tx.lecturaOdometro.create({
          data: {
            vehiculoId: vehiculo.id,
            valorKm: kmNum,
            fechaHora: fechaValida,
            origenId: origen.id,
            usuarioId: Number(usuarioId),
            motivo: `Mantenimiento registrado: ${categoria}`,
          },
        });
      }
    }
  });

  return serializarMantenimiento(mantenimientoCreado);
}

async function obtenerHistorialVehiculo(vehiculoId, { categoria } = {}) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(vehiculoId) },
    include: {
      tipoVehiculo: true,
      ...INCLUDE_MODELO_Y_MARCA,
      planMantenimiento: { include: { plantillaMantenimiento: true } },
    },
  });

  if (!vehiculo) {
    const err = new Error('Vehículo no encontrado');
    err.status = 404;
    throw err;
  }

  const whereClause = { vehiculoId: vehiculo.id };
  if (categoria && categoria.trim()) {
    whereClause.categoria = categoria.trim();
  }

  const mantenimientos = await prisma.mantenimientoRealizado.findMany({
    where: whereClause,
    include: { usuario: true },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
  });

  const { marcaNombre, modeloNombre } = nombresMarcaModelo(vehiculo);

  return {
    vehiculo: {
      id: vehiculo.id,
      dominio: vehiculo.dominio,
      numeroInterno: vehiculo.numeroInterno,
      marca: marcaNombre,
      modelo: modeloNombre,
      kilometraje: vehiculo.kilometraje,
      tipoVehiculo: vehiculo.tipoVehiculo?.descripcion || null,
    },
    planMantenimiento: serializarPlan(
      vehiculo.planMantenimiento
        ? { ...vehiculo.planMantenimiento, vehiculo }
        : null
    ),
    historial: mantenimientos.map(serializarMantenimiento),
    totalIntervenciones: mantenimientos.length,
  };
}

async function evaluarAdvertenciaViaje({ vehiculoId, kilometrosEstimados }) {
  if (!vehiculoId) {
    return { tieneAdvertencia: false };
  }

  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: Number(vehiculoId) },
    include: {
      planMantenimiento: { include: { plantillaMantenimiento: true } },
    },
  });

  if (!vehiculo || !vehiculo.planMantenimiento || !vehiculo.planMantenimiento.activo) {
    return { tieneAdvertencia: false };
  }

  const plan = vehiculo.planMantenimiento;
  const kmEstimadosNum = parseInt(kilometrosEstimados, 10) || 0;
  const kmActual = vehiculo.kilometraje;
  const kmFinalEstimado = kmActual + kmEstimadosNum;
  const kmProximoService = plan.kmProximoService;
  const kmRestantes = kmProximoService - kmActual;

  const yaVencido = kmActual >= kmProximoService;
  const superaEnViaje = !yaVencido && kmFinalEstimado >= kmProximoService;

  if (!yaVencido && !superaEnViaje) {
    return {
      tieneAdvertencia: false,
      kmActual,
      kmEstimados: kmEstimadosNum,
      kmFinalEstimado,
      kmProximoService,
      kmRestantes,
    };
  }

  let mensaje = '';
  if (yaVencido) {
    const excedido = kmActual - kmProximoService;
    mensaje = `El vehículo ya superó su service preventivo programado (${kmActual} km vs. ${kmProximoService} km; excedido por ${excedido} km).`;
  } else {
    const kmParaVencer = kmProximoService - kmActual;
    mensaje = `Con este viaje de ${kmEstimadosNum} km, el vehículo alcanzará los ${kmFinalEstimado} km y superará su service preventivo (${kmProximoService} km; faltaban ${kmParaVencer} km).`;
  }

  return {
    tieneAdvertencia: true,
    yaVencido,
    superaEnViaje,
    kmActual,
    kmEstimados: kmEstimadosNum,
    kmFinalEstimado,
    kmProximoService,
    kmRestantes,
    mensaje,
  };
}

module.exports = {
  ValidacionError,
  CATEGORIAS_VALIDAS,
  serializarPlan,
  serializarMantenimiento,
  listarPlantillas,
  asignarPlanAVehiculo,
  listarPlanesYAlertas,
  registrarMantenimiento,
  obtenerHistorialVehiculo,
  evaluarAdvertenciaViaje,
};
