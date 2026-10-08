const viajeService = require('../services/viajeService');

const ETIQUETA_ESTADO = {
  A_CONFIRMAR: 'A confirmar',
  PROGRAMADO: 'Programado',
  EN_VIAJE: 'En viaje',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

async function crear(req, res) {
  const {
    choferId,
    vehiculoId,
    fechaInicio,
    fechaFin,
    kilometrosEstimados,
    cantidadPasajeros,
    choferesCandidatos,
    vehiculosCandidatos,
    clienteId,
    origenId,
    destinoId,
    datosAdministrativos,
  } = req.body;

  try {
    const viaje = await viajeService.crearViaje(
      {
        choferId,
        vehiculoId,
        fechaInicio,
        fechaFin,
        kilometrosEstimados,
        cantidadPasajeros,
        choferesCandidatos,
        vehiculosCandidatos,
        clienteId,
        origenId,
        destinoId,
        datosAdministrativos,
      },
      req.usuario
    );
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
  const viajes = await viajeService.listarViajes(
    { estado, choferId, vehiculoId, fechaDesde, fechaHasta },
    req.usuario
  );
  return res.json({ viajes });
}

// Viajes del usuario autenticado como chofer. El choferId SIEMPRE sale del
// JWT (req.usuario.id), nunca de la query string: un usuario no puede pedir
// los viajes de otro cambiando un parámetro. excluirAConfirmar: true siempre
// — A_CONFIRMAR es una etapa de planificación que el chofer no tiene por qué
// ver todavía, ni siquiera si pide ?estado=A_CONFIRMAR explícito.
async function misViajes(req, res) {
  const { estado, fechaDesde, fechaHasta } = req.query;
  const viajes = await viajeService.listarViajes(
    {
      estado,
      choferId: req.usuario.id,
      fechaDesde,
      fechaHasta,
      excluirAConfirmar: true,
    },
    req.usuario
  );
  return res.json({ viajes });
}

async function actualizar(req, res) {
  const {
    choferId,
    vehiculoId,
    fechaInicio,
    fechaFin,
    kilometrosEstimados,
    cantidadPasajeros,
    choferesCandidatos,
    vehiculosCandidatos,
    clienteId,
    origenId,
    destinoId,
  } = req.body;

  try {
    const viaje = await viajeService.actualizarViaje(
      req.params.id,
      {
        choferId,
        vehiculoId,
        fechaInicio,
        fechaFin,
        kilometrosEstimados,
        cantidadPasajeros,
        choferesCandidatos,
        vehiculosCandidatos,
        clienteId,
        origenId,
        destinoId,
      },
      req.usuario
    );
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.EstadoNoEditableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({
        error: `No se puede modificar un viaje en estado ${etiqueta}. Solo se pueden modificar viajes A confirmar o Programados.`,
      });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function confirmar(req, res) {
  try {
    const viaje = await viajeService.confirmarViaje(req.params.id, req.body, req.usuario);
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.EstadoNoConfirmableError) {
      const etiqueta = ETIQUETA_ESTADO[err.estadoActual] || err.estadoActual;
      return res.status(409).json({
        error: `No se puede confirmar un viaje en estado ${etiqueta}. Solo se pueden confirmar viajes A confirmar.`,
      });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

// A diferencia de `actualizar` (que desestructura campo por campo), acá se
// pasa req.body TAL CUAL al service: esta acción es una actualización
// parcial donde "la clave no vino" y "la clave vino en undefined" tienen que
// seguir siendo distinguibles. Desestructurar y reconstruir el objeto (como
// hace `actualizar`) perdería esa distinción, porque `{ precio } = req.body`
// seguido de `{ precio }` deja la clave "precio" presente (con valor
// undefined) aunque el campo nunca haya venido en el body.
async function actualizarDatosAdministrativos(req, res) {
  try {
    const viaje = await viajeService.actualizarDatosAdministrativos(req.params.id, req.body, req.usuario);
    return res.json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

// Disponibilidad de los candidatos de un viaje existente (y, con ?todos=true, de
// todos los choferes y vehículos). Informativa: nunca bloquea nada.
async function disponibilidadDeViaje(req, res) {
  try {
    const disponibilidad = await viajeService.disponibilidadDeViaje(req.params.id, {
      todos: req.query.todos === 'true',
    });
    return res.json(disponibilidad);
  } catch (err) {
    if (err instanceof viajeService.NoEncontradoError) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

// Lo mismo para el alta, cuando el viaje todavía no existe: se consulta con las
// fechas y los ids que el formulario tiene en pantalla.
async function disponibilidad(req, res) {
  const { fechaInicio, fechaFin, choferIds, vehiculoIds } = req.body;

  try {
    const resultado = await viajeService.disponibilidadParaAlta({ fechaInicio, fechaFin, choferIds, vehiculoIds });
    return res.json(resultado);
  } catch (err) {
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listarEstadosPago(req, res) {
  const estadosPago = await viajeService.listarEstadosPago();
  return res.json({ estadosPago });
}

async function listarMetodosPago(req, res) {
  const metodosPago = await viajeService.listarMetodosPago();
  return res.json({ metodosPago });
}

async function cancelar(req, res) {
  try {
    const viaje = await viajeService.cancelarViaje(req.params.id, req.usuario);
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
  const { odometroFinal, observacion } = req.body;

  try {
    const viaje = await viajeService.finalizarViaje(req.params.id, { odometroFinal, observacion }, req.usuario);
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

module.exports = {
  crear,
  listar,
  misViajes,
  actualizar,
  actualizarDatosAdministrativos,
  confirmar,
  disponibilidadDeViaje,
  disponibilidad,
  listarEstadosPago,
  listarMetodosPago,
  cancelar,
  comenzar,
  finalizar,
};
