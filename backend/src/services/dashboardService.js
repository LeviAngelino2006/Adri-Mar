const prisma = require('./prismaClient');
const { CORDOBA_UTC_OFFSET, diaCordobaISO } = require('../utils/fechaCordoba');
const { calcularEstadoService } = require('../utils/estadoService');
const { INCLUDE_MODELO_Y_MARCA, nombresMarcaModelo } = require('../utils/marcaModeloVehiculo');
const { semanaActualCordoba, resolverLecturasVigentesPorViaje } = require('./reporteService');

const PERFILES_GESTORES = ['ADMINISTRADOR', 'ENCARGADO'];
const PERIODOS_VALIDOS = new Set(['mes', 'semana']);
const ESTADO_DADO_DE_BAJA = 'DADO_DE_BAJA';

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

// Del día 01 al último día del mes calendario actual en hora de Córdoba (UTC-3).
function mesActualCordoba(ahora = new Date()) {
  const hoyISO = diaCordobaISO(ahora);
  const [anio, mes] = hoyISO.split('-').map(Number);
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}

function resolverPeriodo(periodo, ahora = new Date()) {
  const texto =
    periodo === undefined || periodo === null
      ? 'mes'
      : typeof periodo === 'string'
        ? periodo.trim()
        : null;

  if (texto === '') {
    return { tipo: 'mes', ...mesActualCordoba(ahora) };
  }
  if (!texto || !PERIODOS_VALIDOS.has(texto)) {
    throw new ValidacionError({ periodo: 'El período debe ser "semana" o "mes"' });
  }
  if (texto === 'semana') {
    return { tipo: 'semana', ...semanaActualCordoba(ahora) };
  }
  return { tipo: 'mes', ...mesActualCordoba(ahora) };
}

function resumirFlotaYMantenimiento(vehiculos) {
  let operativos = 0;
  let enTaller = 0;
  let vencidos = 0;
  let proximos = 0;
  let alDia = 0;
  let sinPlan = 0;
  const alertas = [];

  for (const v of vehiculos) {
    const estadoVehiculo = v.estadoVehiculo?.descripcion ?? null;
    if (estadoVehiculo === 'EN_TALLER') enTaller += 1;
    else operativos += 1;

    const plan = v.planMantenimiento?.activo ? v.planMantenimiento : null;
    if (!plan) {
      sinPlan += 1;
      continue;
    }

    const calc = calcularEstadoService({
      kilometraje: v.kilometraje,
      kmUltimoService: plan.kmUltimoService,
      intervaloKm: plan.plantillaMantenimiento.intervaloKm,
      porcentajeAviso: plan.plantillaMantenimiento.porcentajeAviso,
    });

    if (calc.estado === 'VENCIDO') vencidos += 1;
    else if (calc.estado === 'PROXIMO') proximos += 1;
    else alDia += 1;

    if (calc.estado === 'VENCIDO' || calc.estado === 'PROXIMO') {
      const { marca, modelo } = nombresMarcaModelo(v);
      alertas.push({
        vehiculo: {
          id: v.id,
          numeroInterno: v.numeroInterno,
          dominio: v.dominio,
          marca,
          modelo,
          kilometraje: v.kilometraje,
          estado: estadoVehiculo,
          tipoVehiculoId: v.tipoVehiculoId,
          tipoVehiculo: v.tipoVehiculo?.descripcion ?? null,
        },
        estado: calc.estado,
        kmDesdeService: calc.kmDesdeService,
        kmProximoService: calc.kmProximoService,
        kmRestantes: calc.kmRestantes,
        kmExcedidos: calc.kmExcedidos,
        porcentajeConsumido: calc.porcentajeConsumido,
      });
    }
  }

  alertas.sort(
    (a, b) =>
      (a.estado === 'VENCIDO' ? 0 : 1) - (b.estado === 'VENCIDO' ? 0 : 1) ||
      (b.porcentajeConsumido ?? 0) - (a.porcentajeConsumido ?? 0) ||
      String(a.vehiculo.numeroInterno).localeCompare(String(b.vehiculo.numeroInterno), 'es', { numeric: true })
  );

  return {
    flota: {
      totalActivos: vehiculos.length,
      operativos,
      enTaller,
    },
    mantenimiento: {
      vencidos,
      proximos,
      alDia,
      sinPlan,
      alertas,
    },
  };
}

async function obtenerIndicadores({ periodo, perfilSolicitante, ahora = new Date() } = {}) {
  const rango = resolverPeriodo(periodo, ahora);
  const esGestor = PERFILES_GESTORES.includes(perfilSolicitante);

  const inicioRango = new Date(`${rango.desde}T00:00:00.000${CORDOBA_UTC_OFFSET}`);
  const finRango = new Date(`${rango.hasta}T23:59:59.999${CORDOBA_UTC_OFFSET}`);

  const consultas = [
    prisma.vehiculo.findMany({
      where: { estadoVehiculo: { descripcion: { not: ESTADO_DADO_DE_BAJA } } },
      include: {
        ...INCLUDE_MODELO_Y_MARCA,
        estadoVehiculo: true,
        tipoVehiculo: { include: { plantilla: true } },
        planMantenimiento: { include: { plantillaMantenimiento: true } },
      },
    }),
  ];

  if (esGestor) {
    consultas.push(
      prisma.viaje.findMany({
        where: {
          estadoViaje: { descripcion: 'FINALIZADO' },
          fechaInicio: { gte: inicioRango, lte: finRango },
        },
        select: { id: true },
      }),
      prisma.viaje.count({ where: { estadoViaje: { descripcion: 'EN_VIAJE' } } }),
      prisma.viaje.count({ where: { estadoViaje: { descripcion: 'PROGRAMADO' } } }),
      prisma.viaje.count({ where: { estadoViaje: { descripcion: 'A_CONFIRMAR' } } })
    );
  }

  const [vehiculos, viajesFinalizados = [], enViajeAhora = 0, programadosProximos = 0, porConfirmarPendientes = 0] =
    await Promise.all(consultas);

  const { flota, mantenimiento } = resumirFlotaYMantenimiento(vehiculos);

  if (!esGestor) {
    return {
      periodo: rango,
      flota,
      mantenimiento,
    };
  }

  const lecturas =
    viajesFinalizados.length > 0
      ? await prisma.lecturaOdometro.findMany({
          where: { viajeId: { in: viajesFinalizados.map((v) => v.id) } },
          include: { origen: true },
          orderBy: { creadoEn: 'asc' },
        })
      : [];

  const lecturasPorViaje = resolverLecturasVigentesPorViaje(lecturas);

  let totalRecorridos = 0;
  let viajesConOdometro = 0;
  let viajesSinOdometro = 0;

  for (const viaje of viajesFinalizados) {
    const medicion = lecturasPorViaje.get(viaje.id);
    const kmRealizados = medicion ? medicion.kmRealizados : null;
    if (kmRealizados != null) {
      totalRecorridos += kmRealizados;
      viajesConOdometro += 1;
    } else {
      viajesSinOdometro += 1;
    }
  }

  const promedioPorViaje = viajesConOdometro > 0 ? Math.round(totalRecorridos / viajesConOdometro) : null;

  return {
    periodo: rango,
    flota,
    mantenimiento,
    km: {
      totalRecorridos,
      promedioPorViaje,
      viajesConOdometro,
      viajesSinOdometro,
    },
    viajes: {
      finalizadosPeriodo: viajesFinalizados.length,
      enViajeAhora,
      programadosProximos,
      porConfirmarPendientes,
    },
  };
}

module.exports = {
  obtenerIndicadores,
  mesActualCordoba,
  ValidacionError,
};
