const { Router } = require('express');
const personaController = require('../controllers/personaController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), personaController.crear);
router.get('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), personaController.listar);
router.get(
  '/disponibles-chofer',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  personaController.listarDisponiblesParaConducir
);
router.get('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), personaController.obtener);
router.put('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), personaController.actualizar);
router.patch(
  '/:id/baja',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  personaController.darDeBaja
);
router.patch(
  '/:id/reactivar',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  personaController.reactivar
);

module.exports = router;
