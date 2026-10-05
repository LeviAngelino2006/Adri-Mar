const viajeService = require('../services/viajeService');

const ETIQUETA_ESTADO = {
  PROGRAMADO: 'Programado',
  EN_VIAJE: 'En viaje',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

async function crear(req, res) {
  const { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados, origenId, destinoId } = req.body;

  try {
    const viaje = await viajeService.crearViaje({
      choferId,
      vehiculoId,
      fechaInicio,
      fechaFin,
      kilometrosEstimados,
      origenId,
      destinoId,
    });
    return res.status(201).json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { estado, choferId, vehiculoId, fechaDesde, fechaHasta } = req.query;
  const viajes = await viajeService.listarViajes({ estado, choferId, vehiculoId, fechaDesde, fechaHasta });
  return res.json({ viajes });
}

// Viajes del usuario autenticado como chofer. El choferId SIEMPRE sale del
// JWT (req.usuario.id), nunca de la query string: un usuario no puede pedir
// los viajes de otro cambiando un parámetro.
async function misViajes(req, res) {
  const { estado, fechaDesde, fechaHasta } = req.query;
  const viajes = await viajeService.listarViajes({
    estado,
    choferId: req.usuario.id,
    fechaDesde,
    fechaHasta,
  });
  return res.json({ viajes });
}

async function actualizar(req, res) {
  const { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados, origenId, destinoId } = req.body;

  try {
    const viaje = await viajeService.actualizarViaje(req.params.id, {
      choferId,
      vehiculoId,
      fechaInicio,
      fechaFin,
      kilometrosEstimados,
      origenId,
      destinoId,
    });
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.EstadoNoEditableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({
        error: `No se puede modificar un viaje en estado ${etiqueta}. Solo se pueden modificar viajes Programados.`,
      });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function cancelar(req, res) {
  try {
    const viaje = await viajeService.cancelarViaje(req.params.id);
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.YaCanceladoError) {
      return res.status(409).json({ error: 'El viaje ya está cancelado' });
    }
    if (err instanceof viajeService.EstadoNoEditableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({ error: `No se puede cancelar un viaje en estado ${etiqueta}` });
    }
    throw err;
  }
}

async function comenzar(req, res) {
  const { odometroInicial } = req.body;

  try {
    const viaje = await viajeService.comenzarViaje(req.params.id, { odometroInicial }, req.usuario);
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para comenzar este viaje' });
    }
    if (err instanceof viajeService.EstadoNoEditableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({
        error: `No se puede comenzar un viaje en estado ${etiqueta}. Solo se pueden comenzar viajes Programados.`,
      });
    }
    if (err instanceof viajeService.ViajeEnCursoError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function finalizar(req, res) {
  const { odometroFinal } = req.body;

  try {
    const viaje = await viajeService.finalizarViaje(req.params.id, { odometroFinal }, req.usuario);
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para finalizar este viaje' });
    }
    if (err instanceof viajeService.EstadoNoEditableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({
        error: `No se puede finalizar un viaje en estado ${etiqueta}. Solo se pueden finalizar viajes En viaje.`,
      });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { crear, listar, misViajes, actualizar, cancelar, comenzar, finalizar };
