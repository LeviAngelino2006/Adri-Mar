const { Router } = require('express');
const documentoController = require('../controllers/documentoController');
const { autenticar, autorizar } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const router = Router();

// Alertas globales de vencimiento
router.get(
  '/alertas',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerAlertas
);

// Catálogo de tipos de documento
router.get(
  '/tipos',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.listarTipos
);

// Resumen de estado de documentación de toda la flota
router.get(
  '/estado-flota',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerEstadoFlota
);

// Consulta de carpeta documental de un vehículo
router.get(
  '/vehiculos/:vehiculoId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerPorVehiculo
);

// Historial de versiones de un documento
router.get(
  '/vehiculos/:vehiculoId/tipos/:tipoDocumentoId/historial',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerHistorial
);

// Registro / actualización de documento
router.post(
  '/vehiculos/:vehiculoId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  documentoController.registrarDocumentoVehiculo
);

// Eliminación de documento
router.delete(
  '/vehiculos/:vehiculoId/:documentoId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  documentoController.eliminarDocumentoVehiculo
);

// RUTAS PARA DOCUMENTACIÓN DE CHOFERES
router.get(
  '/estado-choferes',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerEstadoChoferes
);

router.get(
  '/choferes/:choferId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerPorChofer
);

router.get(
  '/choferes/:choferId/tipos/:tipoDocumentoId/historial',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  documentoController.obtenerHistorialChofer
);

router.post(
  '/choferes/:choferId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  documentoController.registrarDocumentoChofer
);

router.delete(
  '/choferes/:choferId/:documentoId',
  autenticar,
  autorizar('ADMINISTRADOR', 'ENCARGADO'),
  documentoController.eliminarDocumentoChofer
);

module.exports = router;
