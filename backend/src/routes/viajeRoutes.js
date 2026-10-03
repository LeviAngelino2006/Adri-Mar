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
// Sin autorizar(...) a propósito: cualquier usuario autenticado puede
// consultar SUS PROPIOS viajes como chofer, sin importar su perfil (ver
// nota de diseño de SCRUM-30 en el reporte).
router.get('/mis-viajes', autenticar, viajeController.misViajes);
router.put('/:id', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), viajeController.actualizar);
router.patch(
  '/:id/cancelar',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.cancelar
);
// Sin autorizar(...) de rol a propósito: puede comenzar/finalizar el chofer
// asignado a ESE viaje (cualquiera sea su perfil) o Administrador/Encargado
// sobre cualquier viaje — ese chequeo depende del viaje cargado (conocer el
// choferId), así que vive en viajeService.puedeOperarViaje, no acá.
router.patch('/:id/comenzar', autenticar, viajeController.comenzar);
router.patch('/:id/finalizar', autenticar, viajeController.finalizar);

module.exports = router;
