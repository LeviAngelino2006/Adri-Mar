const estimacionRecorridoService = require('../services/estimacionRecorridoService');

// Recibe solo ids de ubicaciones (nunca texto libre): los nombres salen de la
// base. Los errores de ORS llegan como EstimacionError con su status y un
// mensaje para mostrarle al usuario; nunca como un 500 genérico.
async function estimarKm(req, res) {
  const { origenId, paradaIds, destinoId } = req.body ?? {};

  try {
    const resultado = await estimacionRecorridoService.estimarKm({ origenId, paradaIds, destinoId });
    return res.json(resultado);
  } catch (err) {
    if (err instanceof estimacionRecorridoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    if (err instanceof estimacionRecorridoService.EstimacionError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    throw err;
  }
}

module.exports = { estimarKm };
