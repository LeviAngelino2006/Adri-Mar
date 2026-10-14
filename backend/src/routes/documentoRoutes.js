const { Router } = require('express');
const documentoController = require('../controllers/documentoController');
const { autenticar, autorizar } = require('../middlewares/auth');
const { recibirArchivo } = require('../middlewares/upload');

const router = Router();

// Todo el módulo es de Administrador y Encargado; Personal de Taller no entra.
// Eliminar una versión queda solo para Administrador.
const gestores = [autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO')];
const soloAdministrador = [autenticar, autorizar('ADMINISTRADOR')];

// Alertas globales de vencimiento
router.get('/alertas', ...gestores, documentoController.obtenerAlertas);

// Catálogo de tipos de documento (?categoria=VEHICULO|CHOFER)
router.get('/tipos', ...gestores, documentoController.listarTipos);

// Resumen de estado de documentación de toda la flota
router.get('/estado-flota', ...gestores, documentoController.obtenerEstadoFlota);

// Consulta de carpeta documental de un vehículo
router.get('/vehiculos/:vehiculoId', ...gestores, documentoController.obtenerPorVehiculo);

// Historial de versiones de un documento
router.get(
  '/vehiculos/:vehiculoId/tipos/:tipoDocumentoId/historial',
  ...gestores,
  documentoController.obtenerHistorial
);

// Registro / actualización de documento
router.post(
  '/vehiculos/:vehiculoId',
  ...gestores,
  recibirArchivo,
  documentoController.registrarDocumentoVehiculo
);

// Eliminación de documento
router.delete(
  '/vehiculos/:vehiculoId/:documentoId',
  ...soloAdministrador,
  documentoController.eliminarDocumentoVehiculo
);

// RUTAS PARA DOCUMENTACIÓN DE CHOFERES
router.get('/estado-choferes', ...gestores, documentoController.obtenerEstadoChoferes);

router.get('/choferes/:choferId', ...gestores, documentoController.obtenerPorChofer);

router.get(
  '/choferes/:choferId/tipos/:tipoDocumentoId/historial',
  ...gestores,
  documentoController.obtenerHistorialChofer
);

router.post(
  '/choferes/:choferId',
  ...gestores,
  recibirArchivo,
  documentoController.registrarDocumentoChofer
);

router.delete(
  '/choferes/:choferId/:documentoId',
  ...soloAdministrador,
  documentoController.eliminarDocumentoChofer
);

// URL firmada (5 minutos) del PDF de una versión. Se pide al tocar "Ver PDF" o
// "Descargar PDF", así no vence con la página abierta ni se genera una por
// documento al cargar cada carpeta.
router.get('/:documentoId/archivo', ...gestores, documentoController.obtenerArchivo);

module.exports = router;
