const mantenimientoService = require('../services/mantenimientoService');

async function listarPlantillas(req, res, next) {
  try {
    const plantillas = await mantenimientoService.listarPlantillas();
    return res.json({ plantillas });
  } catch (err) {
    next(err);
  }
}

async function asignarPlan(req, res, next) {
  try {
    const { vehiculoId, kmUltimoService, plantillaMantenimientoId } = req.body || {};
    const plan = await mantenimientoService.asignarPlanAVehiculo({
      vehiculoId,
      kmUltimoService,
      plantillaMantenimientoId,
    });
    return res.status(201).json({ plan });
  } catch (err) {
    if (err instanceof mantenimientoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    next(err);
  }
}

async function listarPlanesYAlertas(req, res, next) {
  try {
    const soloAlertas = req.query.soloAlertas === 'true';
    const busqueda = req.query.busqueda || '';
    const planes = await mantenimientoService.listarPlanesYAlertas({ soloAlertas, busqueda });
    return res.json({ planes });
  } catch (err) {
    next(err);
  }
}

async function registrarMantenimiento(req, res, next) {
  try {
    const mantenimiento = await mantenimientoService.registrarMantenimiento(req.body || {}, req.usuario?.id);
    return res.status(201).json({ mantenimiento });
  } catch (err) {
    if (err instanceof mantenimientoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    next(err);
  }
}

async function obtenerHistorialVehiculo(req, res, next) {
  try {
    const { vehiculoId } = req.params;
    const { categoria } = req.query;
    const data = await mantenimientoService.obtenerHistorialVehiculo(vehiculoId, { categoria });
    return res.json(data);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

async function evaluarAdvertenciaViaje(req, res, next) {
  try {
    const { vehiculoId, kilometrosEstimados } = req.query;
    const advertencia = await mantenimientoService.evaluarAdvertenciaViaje({
      vehiculoId,
      kilometrosEstimados,
    });
    return res.json({ advertencia });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarPlantillas,
  asignarPlan,
  listarPlanesYAlertas,
  registrarMantenimiento,
  obtenerHistorialVehiculo,
  evaluarAdvertenciaViaje,
};
