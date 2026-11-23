const { Router } = require('express');
const viajeController = require('../controllers/viajeController');
const estimacionRecorridoController = require('../controllers/estimacionRecorridoController');
const { autenticar, autorizar, exigirAccesoAViajes } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), viajeController.crear);
// Personal de Taller entra por el permiso de rol pero el service lo acota: sin
// habilitación para conducir es un 403 y con habilitación ve solo sus viajes.
router.get(
  '/',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  exigirAccesoAViajes,
  viajeController.listar
);
// Opciones de los filtros de chofer y vehículo del listado: lista a TODOS los
// choferes con viajes, así que es solo de gestores (quien ve solo los propios no
// tiene filtros que armar). Declarada antes que cualquier /:id para que
// "opciones-filtros" no se tome como un id.
router.get(
  '/opciones-filtros',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  viajeController.opcionesFiltros
);
// Sin autorizar(...) de rol a propósito: cualquier usuario autenticado puede
// consultar SUS PROPIOS viajes como chofer (ver nota de diseño de SCRUM-30),
// salvo Personal de Taller sin habilitación para conducir (exigirAccesoAViajes).
router.get('/mis-viajes', autenticar, exigirAccesoAViajes, viajeController.misViajes);
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
router.patch('/:id/comenzar', autenticar, exigirAccesoAViajes, viajeController.comenzar);
router.patch('/:id/finalizar', autenticar, exigirAccesoAViajes, viajeController.finalizar);
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
// Km estimados de un recorrido con la Routes API de Google (ayuda para completar el
// campo del formulario). Mismos perfiles que crear un viaje. No choca con /:id:
// ese solo existe para PUT.
router.post(
  '/estimar-km',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  estimacionRecorridoController.estimarKm
);

module.exports = router;
