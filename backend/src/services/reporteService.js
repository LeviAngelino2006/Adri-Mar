const prisma = require('./prismaClient');
const { CORDOBA_UTC_OFFSET, SOLO_DIA_REGEX, diaCordobaISO } = require('../utils/fechaCordoba');
const { INCLUDE_MODELO_Y_MARCA, nombresMarcaModelo } = require('../utils/marcaModeloVehiculo');
const { resolverVigentesPorViaje } = require('./lecturaOdometroService');

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 366;

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function esFechaCalendarioValida(texto) {
  if (!SOLO_DIA_REGEX.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

function parsearDiaUTC(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function sumarDiasISO(texto, dias) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function lunesDeSemanaISO(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  return sumarDiasISO(texto, offsetLunes);
}

function determinarGranularidad(desde, hasta) {
  const diasInclusivos = Math.round((parsearDiaUTC(hasta) - parsearDiaUTC(desde)) / MS_POR_DIA) + 1;
  if (diasInclusivos <= 45) return 'dia';
  if (diasInclusivos <= 180) return 'semana';
  return 'mes';
}

function construirSerieTemporal(periodo, viajes, lecturasPorViaje, porVehiculo) {
  const granularidadTemporal = determinarGranularidad(periodo.desde, periodo.hasta);
  const buckets = new Map();

  if (granularidadTemporal === 'dia') {
    for (let d = periodo.desde; d <= periodo.hasta; d = sumarDiasISO(d, 1)) {
      buckets.set(d, { clave: d, desde: d, hasta: d, kmRecorridos: 0, cantidadViajes: 0 });
    }
  } else if (granularidadTemporal === 'semana') {
    for (let lunes = lunesDeSemanaISO(periodo.desde); lunes <= periodo.hasta; lunes = sumarDiasISO(lunes, 7)) {
      const domingo = sumarDiasISO(lunes, 6);
      const desde = lunes < periodo.desde ? periodo.desde : lunes;
      const hasta = domingo > periodo.hasta ? periodo.hasta : domingo;
      buckets.set(lunes, { clave: lunes, desde, hasta, kmRecorridos: 0, cantidadViajes: 0 });
    }
  } else {
    let [anio, mes] = periodo.desde.slice(0, 7).split('-').map(Number);
    const finMesKey = periodo.hasta.slice(0, 7);
    while (true) {
      const clave = `${anio}-${String(mes).padStart(2, '0')}`;
      if (clave > finMesKey) break;
      const primerDia = `${clave}-01`;
      const ultimoDia = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
      const desde = primerDia < periodo.desde ? periodo.desde : primerDia;
      const hasta = ultimoDia > periodo.hasta ? periodo.hasta : ultimoDia;
      buckets.set(clave, { clave, desde, hasta, kmRecorridos: 0, cantidadViajes: 0 });
      mes += 1;
      if (mes > 12) {
        mes = 1;
        anio += 1;
      }
    }
  }

  for (const viaje of viajes) {
    if (!porVehiculo.has(viaje.vehiculoId) || !viaje.fechaInicio) continue;
    const diaViaje = diaCordobaISO(viaje.fechaInicio);
    const clave =
      granularidadTemporal === 'dia'
        ? diaViaje
        : granularidadTemporal === 'semana'
          ? lunesDeSemanaISO(diaViaje)
          : diaViaje.slice(0, 7);
    const bucket = buckets.get(clave);
    if (!bucket) continue;
    const medicion = lecturasPorViaje.get(viaje.id);
    bucket.cantidadViajes += 1;
    bucket.kmRecorridos += medicion?.kmRealizados ?? 0;
  }

  return { granularidadTemporal, serieTemporal: [...buckets.values()] };
}

function construirResumenPorTipo(porVehiculo) {
  const porTipo = new Map();

  for (const acc of porVehiculo.values()) {
    const id = acc.vehiculo.tipoVehiculoId;
    let grupo = porTipo.get(id);
    if (!grupo) {
      grupo = {
        tipoVehiculoId: id,
        tipoVehiculo: acc.vehiculo.tipoVehiculo,
        kmRecorridos: 0,
        cantidadViajes: 0,
        viajesConOdometro: 0,
        vehiculosConViajes: 0,
        vehiculosActivos: 0,
      };
      porTipo.set(id, grupo);
    }
    if (acc.vehiculo.estado !== 'DADO_DE_BAJA') {
      grupo.vehiculosActivos += 1;
    }
    if (acc.cantidadViajes > 0) {
      grupo.vehiculosConViajes += 1;
    }
    grupo.kmRecorridos += acc.kmRecorridos;
    grupo.cantidadViajes += acc.cantidadViajes;
    grupo.viajesConOdometro += acc.viajesConOdometro;
  }

  return [...porTipo.values()]
    .filter((g) => g.vehiculosActivos > 0 || g.cantidadViajes > 0)
    .map((g) => ({
      tipoVehiculoId: g.tipoVehiculoId,
      tipoVehiculo: g.tipoVehiculo,
      kmRecorridos: g.kmRecorridos,
      cantidadViajes: g.cantidadViajes,
      vehiculosConViajes: g.vehiculosConViajes,
      vehiculosActivos: g.vehiculosActivos,
      promedioKmPorViaje: g.viajesConOdometro > 0 ? Math.round(g.kmRecorridos / g.viajesConOdometro) : null,
    }))
    .sort(
      (a, b) =>
        b.kmRecorridos - a.kmRecorridos ||
        b.cantidadViajes - a.cantidadViajes ||
        String(a.tipoVehiculo).localeCompare(String(b.tipoVehiculo), 'es')
    );
}

// Lunes a domingo de la semana calendario actual en hora de Córdoba (UTC-3).
function semanaActualCordoba(ahora = new Date()) {
  const hoyISO = diaCordobaISO(ahora);
  const [anio, mes, dia] = hoyISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const diaSemana = fecha.getUTCDay(); // 0 = domingo, 1 = lunes ... 6 = sábado
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(Date.UTC(anio, mes - 1, dia + offsetLunes));
  const domingo = new Date(Date.UTC(anio, mes - 1, dia + offsetLunes + 6));
  return {
    desde: lunes.toISOString().slice(0, 10),
    hasta: domingo.toISOString().slice(0, 10),
  };
}

function validarYResolverPeriodo({ desde, hasta }, ahora = new Date()) {
  const errores = {};

  if (desde !== undefined && desde !== null && typeof desde !== 'string') {
    errores.desde = 'La fecha de inicio no es válida';
  }
  if (hasta !== undefined && hasta !== null && typeof hasta !== 'string') {
    errores.hasta = 'La fecha de fin no es válida';
  }
  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  const desdeTexto = typeof desde === 'string' ? desde.trim() : '';
  const hastaTexto = typeof hasta === 'string' ? hasta.trim() : '';

  if (!desdeTexto && !hastaTexto) {
    return semanaActualCordoba(ahora);
  }

  if (!desdeTexto) {
    errores.desde = 'Indicá la fecha de inicio';
  } else if (!esFechaCalendarioValida(desdeTexto)) {
    errores.desde = 'La fecha de inicio no es válida';
  }

  if (!hastaTexto) {
    errores.hasta = 'Indicá la fecha de fin';
  } else if (!esFechaCalendarioValida(hastaTexto)) {
    errores.hasta = 'La fecha de fin no es válida';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  if (desdeTexto > hastaTexto) {
    throw new ValidacionError({ hasta: 'La fecha hasta no puede ser anterior a desde' });
  }

  const diasInclusivos = Math.round((parsearDiaUTC(hastaTexto) - parsearDiaUTC(desdeTexto)) / MS_POR_DIA) + 1;
  if (diasInclusivos > MAX_DIAS_PERIODO) {
    throw new ValidacionError({ hasta: `El período no puede superar los ${MAX_DIAS_PERIODO} días` });
  }

  return { desde: desdeTexto, hasta: hastaTexto };
}

// Odómetro inicial, final y km realizados de cada viaje, a partir de sus
// lecturas vigentes (lecturaOdometroService.resolverVigentesPorViaje).
function medicionesPorViaje(lecturas) {
  const resultado = new Map();
  for (const [viajeId, { vigenteInicio, vigenteFin }] of resolverVigentesPorViaje(lecturas)) {
    const odometroInicial = vigenteInicio ? vigenteInicio.valorKm : null;
    const odometroFinal = vigenteFin ? vigenteFin.valorKm : null;
    const kmRealizados = vigenteInicio && vigenteFin ? vigenteFin.valorKm - vigenteInicio.valorKm : null;
    resultado.set(viajeId, { odometroInicial, odometroFinal, kmRealizados });
  }
  return resultado;
}

function redondearUnDecimal(valor) {
  return Math.round(valor * 10) / 10;
}

function calcularDesvio(realesComparables, estimadosComparables) {
  if (estimadosComparables <= 0) {
    return { desvioKm: null, desvioPorcentaje: null };
  }
  const desvioKm = realesComparables - estimadosComparables;
  const desvioPorcentaje = redondearUnDecimal((desvioKm / estimadosComparables) * 100);
  return { desvioKm, desvioPorcentaje };
}

function crearAcumuladorVehiculo(vehiculo) {
  const { marca, modelo } = nombresMarcaModelo(vehiculo);
  return {
    vehiculo: {
      id: vehiculo.id,
      numeroInterno: vehiculo.numeroInterno,
      dominio: vehiculo.dominio,
      marca,
      modelo,
      tipoVehiculoId: vehiculo.tipoVehiculoId,
      tipoVehiculo: vehiculo.tipoVehiculo?.descripcion ?? 'Vehículo',
      estado: vehiculo.estadoVehiculo?.descripcion ?? 'OPERATIVO',
      kilometraje: vehiculo.kilometraje,
    },
    kmRecorridos: 0,
    cantidadViajes: 0,
    viajesConOdometro: 0,
    viajesSinOdometro: 0,
    kmRealesComparables: 0,
    kmEstimadosComparables: 0,
    viajes: [],
  };
}

async function obtenerReporteKmPorVehiculo({ desde, hasta, ahora = new Date() } = {}) {
  const periodo = validarYResolverPeriodo({ desde, hasta }, ahora);
  const inicioRango = new Date(`${periodo.desde}T00:00:00.000${CORDOBA_UTC_OFFSET}`);
  const finRango = new Date(`${periodo.hasta}T23:59:59.999${CORDOBA_UTC_OFFSET}`);

  const [vehiculos, viajes] = await Promise.all([
    prisma.vehiculo.findMany({
      include: {
        ...INCLUDE_MODELO_Y_MARCA,
        estadoVehiculo: true,
        tipoVehiculo: true,
      },
    }),
    prisma.viaje.findMany({
      where: {
        estadoViaje: { descripcion: 'FINALIZADO' },
        vehiculoId: { not: null },
        fechaInicio: { gte: inicioRango, lte: finRango },
      },
      include: {
        chofer: true,
        cliente: true,
        origen: true,
        destino: true,
      },
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
    }),
  ]);

  const lecturas =
    viajes.length > 0
      ? await prisma.lecturaOdometro.findMany({
          where: { viajeId: { in: viajes.map((v) => v.id) } },
          include: { origen: true },
        })
      : [];

  const lecturasPorViaje = medicionesPorViaje(lecturas);

  const porVehiculo = new Map();
  let vehiculosActivos = 0;

  for (const v of vehiculos) {
    const acc = crearAcumuladorVehiculo(v);
    porVehiculo.set(v.id, acc);
    if (acc.vehiculo.estado !== 'DADO_DE_BAJA') {
      vehiculosActivos += 1;
    }
  }

  let totalKmRecorridos = 0;
  let totalViajes = 0;
  let totalViajesConOdometro = 0;
  let totalViajesSinOdometro = 0;
  let totalKmRealesComparables = 0;
  let totalKmEstimadosComparables = 0;

  for (const viaje of viajes) {
    const acc = porVehiculo.get(viaje.vehiculoId);
    if (!acc) continue;

    const medicion = lecturasPorViaje.get(viaje.id);
    const kmRealizados = medicion ? medicion.kmRealizados : null;
    const kmEstimados = viaje.kilometrosEstimados ?? null;

    acc.cantidadViajes += 1;
    totalViajes += 1;

    if (kmRealizados != null) {
      acc.kmRecorridos += kmRealizados;
      acc.viajesConOdometro += 1;
      totalKmRecorridos += kmRealizados;
      totalViajesConOdometro += 1;

      if (kmEstimados != null && kmEstimados > 0) {
        acc.kmRealesComparables += kmRealizados;
        acc.kmEstimadosComparables += kmEstimados;
        totalKmRealesComparables += kmRealizados;
        totalKmEstimadosComparables += kmEstimados;
      }
    } else {
      acc.viajesSinOdometro += 1;
      totalViajesSinOdometro += 1;
    }

    acc.viajes.push({
      id: viaje.id,
      fechaInicio: viaje.fechaInicio,
      origen: viaje.origen?.nombre ?? null,
      destino: viaje.destino?.nombre ?? null,
      cliente: viaje.cliente?.nombre ?? null,
      chofer: viaje.chofer ? `${viaje.chofer.nombre} ${viaje.chofer.apellido}` : null,
      kmRealizados,
      kilometrosEstimados: kmEstimados,
    });
  }

  const vehiculosIncluidos = [];
  let vehiculosConViajes = 0;

  for (const acc of porVehiculo.values()) {
    // Los dados de baja solo aparecen si registraron viajes en el período consultado.
    if (acc.vehiculo.estado === 'DADO_DE_BAJA' && acc.cantidadViajes === 0) {
      continue;
    }
    if (acc.cantidadViajes > 0) {
      vehiculosConViajes += 1;
    }

    const promedioKmPorViaje = acc.viajesConOdometro > 0 ? Math.round(acc.kmRecorridos / acc.viajesConOdometro) : null;
    const porcentajeKmTotal =
      totalKmRecorridos > 0 ? redondearUnDecimal((acc.kmRecorridos / totalKmRecorridos) * 100) : 0;
    const { desvioKm, desvioPorcentaje } = calcularDesvio(acc.kmRealesComparables, acc.kmEstimadosComparables);

    vehiculosIncluidos.push({
      vehiculo: acc.vehiculo,
      kmRecorridos: acc.kmRecorridos,
      kmEstimadosComparables: acc.kmEstimadosComparables,
      cantidadViajes: acc.cantidadViajes,
      viajesSinOdometro: acc.viajesSinOdometro,
      promedioKmPorViaje,
      porcentajeKmTotal,
      desvioKm,
      desvioPorcentaje,
      viajes: acc.viajes,
    });
  }

  vehiculosIncluidos.sort(
    (a, b) =>
      b.kmRecorridos - a.kmRecorridos ||
      b.cantidadViajes - a.cantidadViajes ||
      String(a.vehiculo.numeroInterno).localeCompare(String(b.vehiculo.numeroInterno), 'es', { numeric: true })
  );

  const desvioTotal = calcularDesvio(totalKmRealesComparables, totalKmEstimadosComparables);
  const promedioTotal =
    totalViajesConOdometro > 0 ? Math.round(totalKmRecorridos / totalViajesConOdometro) : null;
  const { granularidadTemporal, serieTemporal } = construirSerieTemporal(periodo, viajes, lecturasPorViaje, porVehiculo);
  const porTipoVehiculo = construirResumenPorTipo(porVehiculo);

  return {
    periodo,
    totales: {
      kmRecorridos: totalKmRecorridos,
      kmEstimadosComparables: totalKmEstimadosComparables,
      kmRealesComparables: totalKmRealesComparables,
      desvioKm: desvioTotal.desvioKm,
      desvioPorcentaje: desvioTotal.desvioPorcentaje,
      cantidadViajes: totalViajes,
      viajesSinOdometro: totalViajesSinOdometro,
      promedioKmPorViaje: promedioTotal,
      vehiculosConViajes,
      vehiculosActivos,
    },
    granularidadTemporal,
    serieTemporal,
    porTipoVehiculo,
    vehiculos: vehiculosIncluidos,
  };
}

module.exports = {
  obtenerReporteKmPorVehiculo,
  semanaActualCordoba,
  ValidacionError,
};
