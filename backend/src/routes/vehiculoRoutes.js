const { Router } = require('express');
const vehiculoController = require('../controllers/vehiculoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR'), vehiculoController.crear);
router.get(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'PERSONAL_TALLER'),
  vehiculoController.listar
);

module.exports = router;
