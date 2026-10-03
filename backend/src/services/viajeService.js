const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');

const ESTADO_VEHICULO_HABILITADO = 'OPERATIVO';
const ESTADOS_VIAJE_VALIDOS = ['PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Gestores: pueden Comenzar/Finalizar cualquier viaje. El chofer asignado
// también puede, sobre SU PROPIO viaje, sin importar su perfil (cualquier
// usuario habilitado para conducir puede ser chofer, SCRUM-27) — por eso no
// alcanza con el `autorizar(...)` de rol que usan el resto de las rutas de
// gestión; este chequeo necesita el viaje cargado (conocer el choferId), así
// que vive acá en el service en vez de a nivel de ruta. Editar/Cancelar NO
// usan este helper: siguen siendo exclusivos de gestor.
const PERFILES_GESTORES_VIAJE = ['ADMINISTRADOR', 'ENCARGADO'];

function puedeOperarViaje(usuarioSolicitante, viaje) {
  return PERFILES_GESTORES_VIAJE.includes(usuarioSolicitante.perfil) || viaje.choferId === usuarioSolicitante.id;
}

class PermisoDenegadoError extends Error {}

// Se dispara al intentar Comenzar un viaje cuando el vehículo o el chofer ya
// tienen otro viaje En viaje en curso. El chequeo de acá adentro es best
// effort para dar un mensaje claro en el camino feliz; la garantía dura
// contra la carrera entre dos requests simultáneos es el índice único
// parcial de la base (Paso 1) — si esta validación pasa pero el INSERT/UPDATE
// igual choca contra ese índice, se captura el código 23505 (P2002 en
// Prisma) y se relanza como este mismo error, nunca como un error crudo de
// Postgres.
class ViajeEnCursoError extends Error {}

// Adri-mar opera únicamente en Córdoba, Argentina, que no tiene horario de
// verano (UTC-3 todo el año). Por eso el offset se puede fijar así, sin
// necesidad de una librería de zonas horarias.
const CORDOBA_UTC_OFFSET = '-03:00';
const TIENE_OFFSET_REGEX = /(Z|[+-]\d{2}:\d{2})$/;

// Interpreta un string de fecha/hora SIN offset (como el que manda un
// <input type="datetime-local">, p. ej. "2026-12-16T23:30") como hora de
// Córdoba, en vez de dejar que Node lo interprete según la zona horaria del
// proceso del servidor (que puede no coincidir con Córdoba según dónde se
// despliegue el backend). Si el valor ya trae offset explícito (u "Z"), se
// respeta tal cual.
function aFechaCordoba(valor) {
  if (!valor) return null;

  if (TIENE_OFFSET_REGEX.test(valor)) {
    return new Date(valor);
  }

  const conSegundos = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor) ? `${valor}:00` : valor;
  return new Date(`${conSegundos}${CORDOBA_UTC_OFFSET}`);
}

// "Ahora" ya es un instante absoluto (Date es UTC puro internamente), así que
// no necesita ningún ajuste de zona horaria para compararse contra
// fechaInicio/fechaFin — esos valores ya quedaron guardados como instantes
// absolutos vía aFechaCordoba() al crear/editar el viaje. Se nombra aparte
// (en vez de usar `new Date()` suelto en cada lugar) para dejar explícito que
// esta comparación usa el mismo criterio de "hora de Córdoba" que el resto
// del archivo, no el reloj de quien esté mirando la pantalla (mismo bug que
// se corrigió en SCRUM-29).
function ahoraCordoba() {
  return new Date();
}

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function validarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const errores = {};

  const choferIdNumero = Number(choferId);
  if (choferId === undefined || choferId === null || choferId === '') {
    errores.choferId = 'El chofer es obligatorio';
  } else if (!Number.isInteger(choferIdNumero) || choferIdNumero <= 0) {
    errores.choferId = 'El chofer elegido no es válido';
  }

  const vehiculoIdNumero = Number(vehiculoId);
  if (vehiculoId === undefined || vehiculoId === null || vehiculoId === '') {
    errores.vehiculoId = 'El vehículo es obligatorio';
  } else if (!Number.isInteger(vehiculoIdNumero) || vehiculoIdNumero <= 0) {
    errores.vehiculoId = 'El vehículo elegido no es válido';
  }

  const fechaInicioDate = fechaInicio ? aFechaCordoba(fechaInicio) : null;
  if (!fechaInicio || Number.isNaN(fechaInicioDate.getTime())) {
    errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
  }

  const fechaFinDate = fechaFin ? aFechaCordoba(fechaFin) : null;
  if (!fechaFin || Number.isNaN(fechaFinDate.getTime())) {
    errores.fechaFin = 'La fecha y hora de fin es obligatoria';
  }

  if (fechaInicioDate && fechaFinDate && !Number.isNaN(fechaInicioDate.getTime()) && !Number.isNaN(fechaFinDate.getTime())) {
    if (fechaFinDate <= fechaInicioDate) {
      errores.fechaFin = 'La fecha y hora de fin debe ser posterior al inicio';
    }
  }

  const kilometrosEstimadosNumero = Number(kilometrosEstimados);
  if (kilometrosEstimados === undefined || kilometrosEstimados === null || kilometrosEstimados === '') {
    errores.kilometrosEstimados = 'Los kilómetros estimados son obligatorios';
  } else if (!Number.isInteger(kilometrosEstimadosNumero) || kilometrosEstimadosNumero <= 0) {
    errores.kilometrosEstimados = 'Los kilómetros estimados deben ser un número mayor a 0';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    choferId: choferIdNumero,
    vehiculoId: vehiculoIdNumero,
    fechaInicio: fechaInicioDate,
    fechaFin: fechaFinDate,
    kilometrosEstimados: kilometrosEstimadosNumero,
  };
}

async function obtenerEstadoViajePorDescripcion(descripcion) {
  const estado = await prisma.estadoViaje.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de viaje "${descripcion}" no configurado`);
  }
  return estado;
}

async function validarChofer(choferId) {
  const chofer = await prisma.usuario.findUnique({
    where: { id: choferId },
    include: { estadoUsuario: true },
  });

  if (!chofer) {
    throw new ValidacionError({ choferId: 'El chofer elegido no existe' });
  }
  if (chofer.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new ValidacionError({ choferId: 'El chofer elegido está inactivo' });
  }
  if (!chofer.habilitadoParaConducir) {
    throw new ValidacionError({ choferId: 'El chofer elegido no está habilitado para conducir' });
  }

  return chofer;
}

async function validarVehiculo(vehiculoId) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: vehiculoId },
    include: { estadoVehiculo: true },
  });

  if (!vehiculo) {
    throw new ValidacionError({ vehiculoId: 'El vehículo elegido no existe' });
  }
  if (vehiculo.estadoVehiculo.descripcion !== ESTADO_VEHICULO_HABILITADO) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo elegido no está disponible (debe estar Operativo)',
    });
  }

  return vehiculo;
}

async function existeSolapamiento({ campo, id, fechaInicio, fechaFin, excluirViajeId }) {
  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const conflicto = await prisma.viaje.findFirst({
    where: {
      [campo]: id,
      estadoViajeId: estadoProgramado.id,
      fechaInicio: { lt: fechaFin },
      fechaFin: { gt: fechaInicio },
      ...(excluirViajeId ? { id: { not: excluirViajeId } } : {}),
    },
  });

  return Boolean(conflicto);
}

// Validaciones comunes al alta y a la edición: datos bien formados, chofer y
// vehículo habilitados, y sin solapamiento. En la edición hay que excluir el
// propio viaje de la búsqueda de solapamiento (si no, siempre "chocaría"
// contra su propio horario original).
async function validarYArmarDatos(
  { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
  { excluirViajeId } = {}
) {
  const datos = validarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados });

  await validarChofer(datos.choferId);
  await validarVehiculo(datos.vehiculoId);

  // TODO: validar umbral de mantenimiento preventivo cuando exista la tabla de planes (SCRUM-34)

  const choferSolapado = await existeSolapamiento({
    campo: 'choferId',
    id: datos.choferId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    excluirViajeId,
  });
  if (choferSolapado) {
    throw new ValidacionError({
      choferId: 'El chofer ya tiene un viaje programado que se superpone con este horario',
    });
  }

  const vehiculoSolapado = await existeSolapamiento({
    campo: 'vehiculoId',
    id: datos.vehiculoId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    excluirViajeId,
  });
  if (vehiculoSolapado) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo ya tiene un viaje programado que se superpone con este horario',
    });
  }

  return datos;
}

// kmRealizados ya no sale de columnas propias del viaje (odometroInicial/
// odometroFinal quedaron deprecadas en el Paso 1): se busca la lectura
// INICIO_VIAJE y la FIN_VIAJE asociadas a este viaje y se resuelve cada una
// con obtenerLecturaVigente, por si alguna fue corregida después (todavía no
// hay forma de corregir desde HTTP, pero la función ya existe y el cálculo
// tiene que estar bien desde ya). Si falta cualquiera de las dos, null.
async function serializarViaje(viaje) {
  const [lecturaInicio, lecturaFin] = await Promise.all([
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'INICIO_VIAJE' } },
    }),
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'FIN_VIAJE' } },
    }),
  ]);

  let kmRealizados = null;
  if (lecturaInicio && lecturaFin) {
    const [vigenteInicio, vigenteFin] = await Promise.all([
      lecturaOdometroService.obtenerLecturaVigente(lecturaInicio.id),
      lecturaOdometroService.obtenerLecturaVigente(lecturaFin.id),
    ]);
    kmRealizados = vigenteFin.valorKm - vigenteInicio.valorKm;
  }

  const estado = viaje.estadoViaje.descripcion;
  const ahora = ahoraCordoba();
  // Indicadores derivados, no un estado nuevo: "vencido" (Programado que
  // nunca se comenzó) y "excedido" (En viaje que no se finalizó a tiempo) son
  // mutuamente excluyentes por construcción (dependen de estados distintos) y
  // van en false para Finalizado/Cancelado.
  const vencido = estado === 'PROGRAMADO' && viaje.fechaInicio < ahora;
  const excedido = estado === 'EN_VIAJE' && viaje.fechaFin < ahora;

  return {
    id: viaje.id,
    choferId: viaje.choferId,
    chofer: viaje.chofer
      ? {
          id: viaje.chofer.id,
          nombre: viaje.chofer.nombre,
          apellido: viaje.chofer.apellido,
        }
      : undefined,
    vehiculoId: viaje.vehiculoId,
    vehiculo: viaje.vehiculo
      ? {
          id: viaje.vehiculo.id,
          dominio: viaje.vehiculo.dominio,
          numeroInterno: viaje.vehiculo.numeroInterno,
          marca: viaje.vehiculo.marca,
          modelo: viaje.vehiculo.modelo,
          kilometraje: viaje.vehiculo.kilometraje,
        }
      : undefined,
    fechaInicio: viaje.fechaInicio,
    fechaFin: viaje.fechaFin,
    kilometrosEstimados: viaje.kilometrosEstimados,
    horaInicioReal: viaje.horaInicioReal,
    horaFinReal: viaje.horaFinReal,
    kmRealizados,
    estado,
    vencido,
    excedido,
    creadoEn: viaje.creadoEn,
  };
}

async function crearViaje({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const datos = await validarYArmarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados });

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const viaje = await prisma.viaje.create({
    data: {
      choferId: datos.choferId,
      vehiculoId: datos.vehiculoId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      kilometrosEstimados: datos.kilometrosEstimados,
      estadoViajeId: estadoProgramado.id,
    },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return await serializarViaje(viaje);
}

class NoEncontradoError extends Error {}

// Estado distinto de PROGRAMADO: no se puede ni editar ni cancelar (salvo el
// caso de "ya cancelado", que tiene su propio error más específico abajo).
class EstadoNoEditableError extends Error {
  constructor(estadoActual) {
    super(`El viaje está en estado ${estadoActual}`);
    this.estadoActual = estadoActual;
  }
}

class YaCanceladoError extends Error {}

async function obtenerViaje(id) {
  const viaje = await prisma.viaje.findUnique({
    where: { id: Number(id) },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });
  if (!viaje) {
    throw new NoEncontradoError();
  }
  return viaje;
}

async function actualizarViaje(id, { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const datos = await validarYArmarDatos(
    { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
    { excluirViajeId: actual.id }
  );

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: {
      choferId: datos.choferId,
      vehiculoId: datos.vehiculoId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      kilometrosEstimados: datos.kilometrosEstimados,
    },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return await serializarViaje(viaje);
}

async function cancelarViaje(id) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion === 'CANCELADO') {
    throw new YaCanceladoError();
  }
  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const estadoCancelado = await obtenerEstadoViajePorDescripcion('CANCELADO');

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: { estadoViajeId: estadoCancelado.id },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return await serializarViaje(viaje);
}

// Si crearLectura (dentro de la transacción) rechaza el valor, llega acá como
// lecturaOdometroService.ValidacionError — se relanza como
// viajeService.ValidacionError para que el controller tenga un solo tipo de
// error de validación que reconocer, sin tener que importar el service de
// lecturas solo para ese instanceof.
function relanzarComoValidacionDeViaje(err) {
  if (err instanceof lecturaOdometroService.ValidacionError) {
    throw new ValidacionError(err.errores);
  }
  throw err;
}

async function comenzarViaje(id, { odometroInicial }, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (!puedeOperarViaje(usuarioSolicitante, actual)) {
    throw new PermisoDenegadoError();
  }
  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  // Revalida habilitación de chofer/vehículo con las mismas funciones que ya
  // usa el alta (validarChofer/validarVehiculo más arriba en este archivo) —
  // nada nuevo, solo se reusan tal cual, sin duplicar sus reglas.
  await validarChofer(actual.choferId);
  await validarVehiculo(actual.vehiculoId);

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');
  const estadoEnViaje = await obtenerEstadoViajePorDescripcion('EN_VIAJE');

  // Chequeo explícito para un mensaje claro en el camino feliz. La garantía
  // dura contra la carrera entre dos requests simultáneos para el MISMO
  // vehículo/chofer en DOS VIAJES DISTINTOS es el índice único parcial de la
  // base (ver catch de P2002 más abajo). Para la carrera de dos requests
  // sobre el MISMO viaje (dos comenzar simultáneos), la garantía dura es el
  // updateMany condicional de más abajo.
  const vehiculoEnViaje = await prisma.viaje.findFirst({
    where: { vehiculoId: actual.vehiculoId, estadoViajeId: estadoEnViaje.id },
  });
  if (vehiculoEnViaje) {
    throw new ViajeEnCursoError('El vehículo ya tiene otro viaje En viaje en curso');
  }
  const choferEnViaje = await prisma.viaje.findFirst({
    where: { choferId: actual.choferId, estadoViajeId: estadoEnViaje.id },
  });
  if (choferEnViaje) {
    throw new ViajeEnCursoError('El chofer ya tiene otro viaje En viaje en curso');
  }

  try {
    await prisma.$transaction(async (tx) => {
      // updateMany condicional contra el estado de origen esperado, en vez de
      // un update ciego: si dos requests llegan a comenzar ESTE MISMO viaje a
      // la vez, el chequeo de arriba (`actual.estadoViaje.descripcion`) pudo
      // haber leído PROGRAMADO en ambas, antes de que ninguna escribiera
      // todavía. Este WHERE con el estado de origen es la garantía dura: la
      // segunda transacción en llegar ya no va a encontrar el viaje en
      // PROGRAMADO (la primera ya lo cambió) y count da 0.
      const actualizados = await tx.viaje.updateMany({
        where: { id: actual.id, estadoViajeId: estadoProgramado.id },
        data: { estadoViajeId: estadoEnViaje.id, horaInicioReal: new Date() },
      });
      if (actualizados.count === 0) {
        const viajeActual = await tx.viaje.findUnique({
          where: { id: actual.id },
          include: { estadoViaje: true },
        });
        throw new EstadoNoEditableError(viajeActual.estadoViaje.descripcion);
      }

      // { cliente: tx }: crearLectura NO debe abrir su propia transacción acá
      // (abriría una segunda, con el `prisma` global, y quedaría esperando el
      // lock de fila que esta misma transacción ya tiene tomado — el
      // auto-deadlock documentado en el Paso 3).
      await lecturaOdometroService.crearLectura(
        {
          vehiculoId: actual.vehiculoId,
          valorKm: odometroInicial,
          origen: 'INICIO_VIAJE',
          viajeId: actual.id,
          usuarioId: usuarioSolicitante.id,
        },
        { cliente: tx }
      );
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ViajeEnCursoError('El vehículo o el chofer ya tienen otro viaje En viaje en curso');
    }
    relanzarComoValidacionDeViaje(err);
  }

  const viajeFinal = await obtenerViaje(actual.id);
  return await serializarViaje(viajeFinal);
}

// PASO 6 — la equivalencia documentada acá se rompió, y esta función ya
// valida explícitamente contra la lectura INICIO_VIAJE vigente de este
// viaje, además de lo que ya valida crearLectura. El motivo concreto:
// crearLectura determina "la última lectura del vehículo" con un
// findFirst(orderBy fechaHora desc) crudo sobre TODA la tabla, no contra
// vehiculo.kilometraje (el caché, que sí se mantiene de forma confiable).
// Una corrección (Paso 6) siempre se inserta con fechaHora = now(), que es
// mayor a la fechaHora de CUALQUIER lectura previa — incluida la propia
// INICIO_VIAJE de un viaje que sigue EN_VIAJE. Si un Administrador corrige
// una lectura VIEJA del vehículo (no la INICIO_VIAJE de este viaje, sino una
// anterior, p.ej. el ALTA_VEHICULO) con un valor menor al de la propia
// INICIO_VIAJE, esa corrección pasa a ser, por fechaHora cruda, "la lectura
// más reciente" — aunque el caché (vehiculo.kilometraje) no cambió, porque
// esa lectura corregida SÍ tenía una posterior (la INICIO_VIAJE) y por regla
// de corregirLectura el caché no se toca en ese caso. Resultado: crearLectura
// validaría el odómetro final contra ese valor viejo y más chico, no contra
// el valor real de inicio de este viaje — dejando pasar un odómetro final
// menor al de inicio. Por eso se agrega acá el chequeo explícito contra
// obtenerLecturaVigente(lecturaInicio), que sí resuelve correctamente el
// valor vigente de ESTE viaje puntual sin importar qué más se haya corregido
// en el medio.
async function finalizarViaje(id, { odometroFinal }, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (!puedeOperarViaje(usuarioSolicitante, actual)) {
    throw new PermisoDenegadoError();
  }
  if (actual.estadoViaje.descripcion !== 'EN_VIAJE') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const lecturaInicio = await prisma.lecturaOdometro.findFirst({
    where: { viajeId: actual.id, origen: { descripcion: 'INICIO_VIAJE' } },
  });
  if (lecturaInicio) {
    const vigenteInicio = await lecturaOdometroService.obtenerLecturaVigente(lecturaInicio.id);
    const odometroFinalNumero = Number(odometroFinal);
    if (Number.isInteger(odometroFinalNumero) && odometroFinalNumero < vigenteInicio.valorKm) {
      throw new ValidacionError({
        odometroFinal: `El odómetro final no puede ser menor a la lectura de inicio de este viaje (${vigenteInicio.valorKm} km)`,
      });
    }
  }

  const estadoEnViajeOrigen = await obtenerEstadoViajePorDescripcion('EN_VIAJE');
  const estadoFinalizado = await obtenerEstadoViajePorDescripcion('FINALIZADO');

  try {
    await prisma.$transaction(async (tx) => {
      // Mismo patrón que comenzarViaje: updateMany condicional contra el
      // estado de origen esperado (EN_VIAJE), para que dos finalizar
      // simultáneos sobre el MISMO viaje no generen dos lecturas FIN_VIAJE —
      // el segundo en llegar encuentra count=0 y aborta sin crear nada.
      const actualizados = await tx.viaje.updateMany({
        where: { id: actual.id, estadoViajeId: estadoEnViajeOrigen.id },
        data: { estadoViajeId: estadoFinalizado.id, horaFinReal: new Date() },
      });
      if (actualizados.count === 0) {
        const viajeActual = await tx.viaje.findUnique({
          where: { id: actual.id },
          include: { estadoViaje: true },
        });
        throw new EstadoNoEditableError(viajeActual.estadoViaje.descripcion);
      }

      await lecturaOdometroService.crearLectura(
        {
          vehiculoId: actual.vehiculoId,
          valorKm: odometroFinal,
          origen: 'FIN_VIAJE',
          viajeId: actual.id,
          usuarioId: usuarioSolicitante.id,
        },
        { cliente: tx }
      );
    });
  } catch (err) {
    relanzarComoValidacionDeViaje(err);
  }

  const viajeFinal = await obtenerViaje(actual.id);
  return await serializarViaje(viajeFinal);
}

function parsearFechaDesde(valor) {
  if (!valor) return null;
  // Si viene solo la fecha (sin hora), el inicio del día se calcula en hora
  // de Córdoba, no UTC (new Date("2026-12-16") da medianoche UTC, que son
  // las 21:00 del día anterior en Córdoba).
  const valorConHora = SOLO_FECHA_REGEX.test(valor) ? `${valor}T00:00:00.000` : valor;
  const fecha = aFechaCordoba(valorConHora);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function parsearFechaHasta(valor) {
  if (!valor) return null;
  // Si viene solo la fecha (sin hora), tomamos el final de ese día en hora
  // de Córdoba, para que el rango incluya todos los viajes que empiezan ese
  // día calendario en Córdoba (no el día calendario en UTC).
  const valorConHora = SOLO_FECHA_REGEX.test(valor) ? `${valor}T23:59:59.999` : valor;
  const fecha = aFechaCordoba(valorConHora);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

async function listarViajes({ estado, choferId, vehiculoId, fechaDesde, fechaHasta } = {}) {
  const where = {};

  if (estado && ESTADOS_VIAJE_VALIDOS.includes(estado)) {
    where.estadoViaje = { descripcion: estado };
  }

  const choferIdNumero = Number(choferId);
  if (choferId && Number.isInteger(choferIdNumero) && choferIdNumero > 0) {
    where.choferId = choferIdNumero;
  }

  const vehiculoIdNumero = Number(vehiculoId);
  if (vehiculoId && Number.isInteger(vehiculoIdNumero) && vehiculoIdNumero > 0) {
    where.vehiculoId = vehiculoIdNumero;
  }

  const fechaDesdeDate = parsearFechaDesde(fechaDesde);
  const fechaHastaDate = parsearFechaHasta(fechaHasta);

  if (fechaDesdeDate || fechaHastaDate) {
    where.fechaInicio = {
      ...(fechaDesdeDate ? { gte: fechaDesdeDate } : {}),
      ...(fechaHastaDate ? { lte: fechaHastaDate } : {}),
    };
  }

  const viajes = await prisma.viaje.findMany({
    where,
    include: { chofer: true, vehiculo: true, estadoViaje: true },
    orderBy: { fechaInicio: 'desc' },
  });

  return Promise.all(viajes.map(serializarViaje));
}

module.exports = {
  crearViaje,
  listarViajes,
  actualizarViaje,
  cancelarViaje,
  comenzarViaje,
  finalizarViaje,
  puedeOperarViaje,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  YaCanceladoError,
  PermisoDenegadoError,
  ViajeEnCursoError,
  ESTADOS_VIAJE_VALIDOS,
};
