const mantenimientoService = require('../services/mantenimientoService');
const responsableService = require('../services/responsableService');

// Errores del service → respuesta HTTP, con el mismo formato que el resto de
// la API: 400 { errores } por campo y 404 { error }.
function responderError(err, res, next) {
  if (err instanceof mantenimientoService.ValidacionError || err instanceof responsableService.ValidacionError) {
    return res.status(400).json({ errores: err.errores });
  }
  if (err instanceof mantenimientoService.NoEncontradoError) {
    return res.status(404).json({ error: err.message });
  }
  return next(err);
}

async function listarTiposArreglo(req, res, next) {
  try {
    const tiposArreglo = await mantenimientoService.listarTiposArreglo();
    return res.json({ tiposArreglo });
  } catch (err) {
    return responderError(err, res, next);
  }
}

// Catálogo de responsables de arreglos (lo usa SelectorBuscarOCrear).
async function listarResponsables(req, res, next) {
  try {
    const responsables = await responsableService.buscar(req.query.busqueda);
    return res.json({ responsables });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function crearResponsable(req, res, next) {
  try {
    const responsable = await responsableService.buscarOCrear({ nombre: req.body?.nombre });
    return res.status(200).json({ responsable });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function listarEstadoService(req, res, next) {
  try {
    const vehiculos = await mantenimientoService.listarEstadoService();
    return res.json({ vehiculos });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function asignarPlan(req, res, next) {
  try {
    const { vehiculoId, kmUltimoService } = req.body || {};
    const estado = await mantenimientoService.asignarPlanAVehiculo({ vehiculoId, kmUltimoService });
    return res.status(201).json({ estado });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function registrarService(req, res, next) {
  try {
    const registro = await mantenimientoService.registrarService(req.body || {}, req.usuario?.id);
    return res.status(201).json({ registro });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function registrarArreglo(req, res, next) {
  try {
    const registro = await mantenimientoService.registrarArreglo(req.body || {}, req.usuario?.id);
    return res.status(201).json({ registro });
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function listarHistorial(req, res, next) {
  try {
    const historial = await mantenimientoService.listarHistorial(req.query);
    return res.json(historial);
  } catch (err) {
    return responderError(err, res, next);
  }
}

async function evaluarAdvertenciaViaje(req, res, next) {
  try {
    const { vehiculoId, kilometrosEstimados } = req.query;
    const advertencia = await mantenimientoService.evaluarAdvertenciaViaje({ vehiculoId, kilometrosEstimados });
    return res.json({ advertencia });
  } catch (err) {
    return responderError(err, res, next);
  }
}

module.exports = {
  listarTiposArreglo,
  listarResponsables,
  crearResponsable,
  listarEstadoService,
  asignarPlan,
  registrarService,
  registrarArreglo,
  listarHistorial,
  evaluarAdvertenciaViaje,
};
