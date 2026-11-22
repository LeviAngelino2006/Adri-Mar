const { Router } = require('express');
const reporteController = require('../controllers/reporteController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.get(
  '/km-por-vehiculo',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  reporteController.kmPorVehiculo
);

module.exports = router;
