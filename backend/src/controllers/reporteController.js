const reporteService = require('../services/reporteService');

async function kmPorVehiculo(req, res, next) {
  try {
    const reporte = await reporteService.obtenerReporteKmPorVehiculo({
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    return res.json(reporte);
  } catch (err) {
    if (err instanceof reporteService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    return next(err);
  }
}

module.exports = { kmPorVehiculo };
