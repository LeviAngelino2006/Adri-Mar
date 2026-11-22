const dashboardService = require('../services/dashboardService');

async function obtenerIndicadores(req, res, next) {
  try {
    const indicadores = await dashboardService.obtenerIndicadores({
      periodo: req.query.periodo,
      perfilSolicitante: req.usuario.perfil,
    });
    return res.json(indicadores);
  } catch (err) {
    if (err instanceof dashboardService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    return next(err);
  }
}

module.exports = { obtenerIndicadores };
