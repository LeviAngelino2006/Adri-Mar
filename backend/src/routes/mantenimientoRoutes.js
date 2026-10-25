const { Router } = require('express');
const mantenimientoController = require('../controllers/mantenimientoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Mantenimiento: gestión y taller. El CHOFER no ve nada del módulo.
router.use(autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'));

// Catálogo de tipos de arreglo activos, en orden.
router.get('/tipos-arreglo', mantenimientoController.listarTiposArreglo);

// Catálogo "buscar o crear" de quién hizo un arreglo (GET ?busqueda= y POST { nombre }).
router.get('/responsables', mantenimientoController.listarResponsables);
router.post('/responsables', mantenimientoController.crearResponsable);

// Estado del service de cada vehículo no dado de baja (SIN_PLAN si no tiene).
router.get('/planes', mantenimientoController.listarEstadoService);
router.post('/planes', mantenimientoController.asignarPlan);

// Registro de un service (reinicia el conteo) o de un arreglo (no lo toca).
router.post('/services', mantenimientoController.registrarService);
router.post('/arreglos', mantenimientoController.registrarArreglo);

// Services y arreglos de toda la flota, con filtros y paginado.
router.get('/historial', mantenimientoController.listarHistorial);

// ¿El viaje hace que el vehículo pase su service?
router.get('/evaluar-viaje', mantenimientoController.evaluarAdvertenciaViaje);

module.exports = router;
