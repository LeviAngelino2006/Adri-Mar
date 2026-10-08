const { Router } = require('express');
const documentoController = require('../controllers/documentoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.get(
  '/alertas',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerAlertas
);

router.post(
  '/vehiculos',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  documentoController.crearDocumentoVehiculo
);

router.post(
  '/usuarios',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  documentoController.crearDocumentoUsuario
);

module.exports = router;
