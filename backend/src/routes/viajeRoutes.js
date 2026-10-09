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
// Puramente administrativo/financiero: a diferencia de comenzar/finalizar, acá
// NO hay bypass de "dueño del viaje" — el chofer nunca puede tocar esto, sin
// importar si es su propio viaje. Funciona en cualquier estado del viaje a
// propósito (no hay autorizar() adicional por estado, como si tiene PUT /:id
// con PROGRAMADO).
router.patch(
  '/:id/datos-administrativos',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.actualizarDatosAdministrativos
);
// Decisión de planificación, no operativa: sin bypass de dueño, exclusivo de
// gestor, igual que PUT /:id (a diferencia de comenzar/finalizar).
router.patch(
  '/:id/confirmar',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.confirmar
);
// Disponibilidad de choferes y vehículos (informativa, nunca bloquea). Solo
// gestores: es información de planificación. POST /disponibilidad es para el
// alta (el viaje todavía no existe) y GET /:id/disponibilidad para uno que ya
// existe; no chocan con /:id porque ese solo existe para PUT.
router.post(
  '/disponibilidad',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.disponibilidad
);
router.get(
  '/:id/disponibilidad',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.disponibilidadDeViaje
);

module.exports = router;
