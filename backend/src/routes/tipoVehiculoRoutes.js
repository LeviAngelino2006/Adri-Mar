const { Router } = require('express');
const vehiculoController = require('../controllers/vehiculoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.get(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'PERSONAL_TALLER'),
  vehiculoController.listarTipos
);

module.exports = router;
