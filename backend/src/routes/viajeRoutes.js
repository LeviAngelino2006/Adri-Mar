const { Router } = require('express');
const viajeController = require('../controllers/viajeController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), viajeController.crear);
router.get(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  viajeController.listar
);
router.put('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), viajeController.actualizar);
router.patch(
  '/:id/cancelar',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.cancelar
);

module.exports = router;
