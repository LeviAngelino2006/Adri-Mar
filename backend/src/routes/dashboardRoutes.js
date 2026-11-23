const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Indicadores del Dashboard: gestión (completo) y Personal de Taller (flota y service).
router.get(
  '/indicadores',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  dashboardController.obtenerIndicadores
);

module.exports = router;
