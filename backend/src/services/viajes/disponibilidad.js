// Disponibilidad informativa de choferes y vehículos para una ventana de tiempo.
const prisma = require('../prismaClient');
const documentoService = require('../documentoService');
const { campoAusente } = require('../../utils/recorridoViaje');
// Fechas sin offset = hora de Córdoba (UTC-3 todo el año): ver utils/fechaCordoba.
const { aFechaCordoba } = require('../../utils/fechaCordoba');
const { ValidacionError } = require('./errores');
const {
  aFechaCordobaOInstancia,
  obtenerEstadoViajePorDescripcion,
  PROBLEMA_CHOFER,
  problemaDeChofer,
  problemaDeVehiculo,
  buscarSolapamiento,
  validarFormatoListaIds,
} = require('./validaciones');
const { obtenerViaje } = require('./consultas');

// --- Disponibilidad ---------------------------------------------------------
//
// Informa, para una ventana de tiempo, si cada chofer/vehículo está disponible
// y por qué no. Es informativa: nunca bloquea un guardado (al confirmar, la
// validación que cuenta sigue siendo validarDisponibilidadOperativa). Reusa las
// mismas piezas que esa validación — problemaDeChofer/problemaDeVehiculo para
// la habilitación y buscarSolapamiento para el horario — así que las reglas
// no se duplican.

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;
const FORMATO_HORA_CORDOBA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Sin fechaFin (todavía no se sabe cuándo termina) se chequea contra el día
// completo de fechaInicio, de 00:00 a 24:00 hora de Córdoba.
function rangoDelDiaCordoba(fecha) {
  const diaCordoba = new Date(fecha.getTime() - CORDOBA_OFFSET_MS).toISOString().slice(0, 10);
  const inicio = aFechaCordoba(`${diaCordoba}T00:00`);
  return { inicio, fin: new Date(inicio.getTime() + MS_POR_DIA) };
}

function motivoDeChofer(chofer) {
  const problema = problemaDeChofer(chofer);
  if (problema === PROBLEMA_CHOFER.INACTIVO) return 'Dado de baja';
  if (problema === PROBLEMA_CHOFER.NO_HABILITADO) return 'No habilitado para conducir';
  return null;
}

function motivoDeVehiculo(vehiculo) {
  const problema = problemaDeVehiculo(vehiculo);
  if (!problema) return null;
  if (problema === 'EN_TALLER') return 'Vehículo en taller';
  if (problema === 'DADO_DE_BAJA') return 'Vehículo dado de baja';
  return 'Vehículo no operativo';
}

async function calcularDisponibilidad({ fechaInicio, fechaFin, choferIds, vehiculoIds, excluirViajeId }) {
  const ventana = fechaFin ? { inicio: fechaInicio, fin: fechaFin } : rangoDelDiaCordoba(fechaInicio);
  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const [personas, vehiculos, docsChoferes, docsVehiculos] = await Promise.all([
    choferIds.length > 0
      ? prisma.persona.findMany({ where: { id: { in: choferIds } } })
      : [],
    vehiculoIds.length > 0
      ? prisma.vehiculo.findMany({ where: { id: { in: vehiculoIds } }, include: { estadoVehiculo: true } })
      : [],
    choferIds.length > 0
      ? documentoService.evaluarDocumentacionTitulares({
          categoria: 'CHOFER',
          ids: choferIds,
          fechaInicio: ventana.inicio,
          fechaFin: ventana.fin,
        })
      : {},
    vehiculoIds.length > 0
      ? documentoService.evaluarDocumentacionTitulares({
          categoria: 'VEHICULO',
          ids: vehiculoIds,
          fechaInicio: ventana.inicio,
          fechaFin: ventana.fin,
        })
      : {},
  ]);

  async function evaluar({ id, entidad, campo, motivoDeHabilitacion, estadoDoc }) {
    if (!entidad) return { id, disponible: false, motivo: 'No encontrado' };

    const motivoHabilitacion = motivoDeHabilitacion(entidad);
    if (motivoHabilitacion) return { id, disponible: false, motivo: motivoHabilitacion };

    if (estadoDoc?.tieneVencidos) {
      return { id, disponible: false, motivo: estadoDoc.motivo };
    }

    const conflicto = await buscarSolapamiento({
      campo,
      id,
      fechaInicio: ventana.inicio,
      fechaFin: ventana.fin,
      excluirViajeId,
      estadoProgramadoId: estadoProgramado.id,
    });
    if (conflicto) {
      const horario = `${FORMATO_HORA_CORDOBA.format(conflicto.fechaInicio)}–${FORMATO_HORA_CORDOBA.format(conflicto.fechaFin)}`;
      return { id, disponible: false, motivo: `Se superpone con otro viaje programado (${horario})` };
    }

    return { id, disponible: true, motivo: null };
  }

  const personasPorId = new Map(personas.map((u) => [u.id, u]));
  const vehiculosPorId = new Map(vehiculos.map((v) => [v.id, v]));

  const [choferes, resultadoVehiculos] = await Promise.all([
    Promise.all(
      choferIds.map((id) =>
        evaluar({
          id,
          entidad: personasPorId.get(id),
          campo: 'choferId',
          motivoDeHabilitacion: motivoDeChofer,
          estadoDoc: docsChoferes[id],
        })
      )
    ),
    Promise.all(
      vehiculoIds.map((id) =>
        evaluar({
          id,
          entidad: vehiculosPorId.get(id),
          campo: 'vehiculoId',
          motivoDeHabilitacion: motivoDeVehiculo,
          estadoDoc: docsVehiculos[id],
        })
      )
    ),
  ]);

  return { choferes, vehiculos: resultadoVehiculos };
}

function sinRepetidos(ids) {
  return [...new Set(ids)];
}

// Disponibilidad de los candidatos de un viaje existente, con sus propias
// fechas (y excluyéndolo a él mismo del solapamiento). Con `todos` evalúa
// además a todos los choferes activos y habilitados y a todos los vehículos no
// dados de baja (los de taller aparecen, con su motivo), para el "Elegir
// otro…" del modal de confirmar.
async function disponibilidadDeViaje(id, { todos = false } = {}) {
  const actual = await obtenerViaje(id);

  if (!actual.fechaInicio) {
    throw new ValidacionError({ fechaInicio: 'El viaje no tiene fecha de inicio' });
  }

  let choferIds = actual.choferesCandidatos.map((c) => c.personaId);
  let vehiculoIds = actual.vehiculosCandidatos.map((c) => c.vehiculoId);

  if (todos) {
    const [personas, vehiculos] = await Promise.all([
      prisma.persona.findMany({
        where: { habilitadoParaConducir: true, activo: true },
        select: { id: true },
      }),
      prisma.vehiculo.findMany({
        where: { estadoVehiculo: { descripcion: { not: 'DADO_DE_BAJA' } } },
        select: { id: true },
      }),
    ]);
    choferIds = sinRepetidos([...choferIds, ...personas.map((u) => u.id)]);
    vehiculoIds = sinRepetidos([...vehiculoIds, ...vehiculos.map((v) => v.id)]);
  }

  return calcularDisponibilidad({
    fechaInicio: actual.fechaInicio,
    fechaFin: actual.fechaFin,
    choferIds,
    vehiculoIds,
    excluirViajeId: actual.id,
  });
}

// Equivalente para el alta, cuando el viaje todavía no existe: recibe las
// fechas y los ids directamente. Valida solo la forma — un id que no exista
// vuelve como no disponible ("No encontrado") en vez de cortar la consulta.
async function disponibilidadParaAlta({ fechaInicio, fechaFin, choferIds, vehiculoIds } = {}) {
  const errores = {};

  let inicio = null;
  if (campoAusente(fechaInicio)) {
    errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
  } else {
    inicio = aFechaCordobaOInstancia(fechaInicio);
    if (!inicio || Number.isNaN(inicio.getTime())) {
      inicio = null;
      errores.fechaInicio = 'La fecha y hora de inicio no es válida';
    }
  }

  let fin = null;
  if (!campoAusente(fechaFin)) {
    fin = aFechaCordobaOInstancia(fechaFin);
    if (!fin || Number.isNaN(fin.getTime())) {
      fin = null;
      errores.fechaFin = 'La fecha y hora de fin no es válida';
    } else if (inicio && fin <= inicio) {
      errores.fechaFin = 'La fecha y hora de fin debe ser posterior al inicio';
    }
  }

  const choferes = validarFormatoListaIds(choferIds, 'choferIds');
  const vehiculos = validarFormatoListaIds(vehiculoIds, 'vehiculoIds');
  Object.assign(errores, choferes.errores, vehiculos.errores);

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return calcularDisponibilidad({
    fechaInicio: inicio,
    fechaFin: fin,
    choferIds: choferes.ids,
    vehiculoIds: vehiculos.ids,
  });
}

module.exports = {
  rangoDelDiaCordoba,
  disponibilidadDeViaje,
  disponibilidadParaAlta,
};
