const { Router } = require('express');
const vehiculoController = require('../controllers/vehiculoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  vehiculoController.crear
);
router.get(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  vehiculoController.listar
);
router.get(
  '/:id',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  vehiculoController.obtener
);
router.put(
  '/:id',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  vehiculoController.actualizar
);
router.patch(
  '/:id/baja',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  vehiculoController.darDeBaja
);

module.exports = router;
