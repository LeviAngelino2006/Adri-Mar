const { Router } = require('express');
const usuarioController = require('../controllers/usuarioController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), usuarioController.crear);
router.get('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), usuarioController.listar);
router.get(
  '/disponibles-chofer',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  usuarioController.listarDisponiblesParaConducir
);
router.put('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), usuarioController.actualizar);
router.patch(
  '/:id/baja',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  usuarioController.darDeBaja
);

module.exports = router;
