const { Router } = require('express');
const mantenimientoController = require('../controllers/mantenimientoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

const ROLES_TALLER_Y_GESTION = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'];

router.get(
  '/plantillas',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.listarPlantillas
);

router.get(
  '/planes',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.listarPlanesYAlertas
);

router.post(
  '/planes',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.asignarPlan
);

router.post(
  '/realizados',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.registrarMantenimiento
);

router.get(
  '/vehiculos/:vehiculoId/historial',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.obtenerHistorialVehiculo
);

router.get(
  '/evaluar-viaje',
  autenticar,
  autorizar(...ROLES_TALLER_Y_GESTION),
  mantenimientoController.evaluarAdvertenciaViaje
);

module.exports = router;
