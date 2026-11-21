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
router.get('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), usuarioController.obtener);
router.put('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), usuarioController.actualizar);
// Restablecer la contraseña de otra cuenta (queda provisoria). La propia se
// cambia con PUT /auth/contrasena, que pide la actual.
router.patch(
  '/:id/contrasena',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  usuarioController.restablecerContrasena
);
router.patch(
  '/:id/baja',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  usuarioController.darDeBaja
);
router.patch(
  '/:id/reactivar',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  usuarioController.reactivar
);

module.exports = router;
