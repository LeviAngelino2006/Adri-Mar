const viajeService = require('../services/viajeService');

async function crear(req, res) {
  const { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados } = req.body;

  try {
    const viaje = await viajeService.crearViaje({
      choferId,
      vehiculoId,
      fechaInicio,
      fechaFin,
      kilometrosEstimados,
    });
    return res.status(201).json({ viaje });
  } catch (err) {
    if (err instanceof viajeService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { crear };
