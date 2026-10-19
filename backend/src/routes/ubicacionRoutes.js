const { Router } = require('express');
const ubicacionController = require('../controllers/ubicacionController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Todo con los mismos perfiles que crear una ubicación.
const puedeGestionar = [autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO')];

// Buscador de ubicaciones FRECUENTES.
router.get('/', ...puedeGestionar, ubicacionController.listar);
router.post('/', ...puedeGestionar, ubicacionController.crear);
// Google Maps (Places API). La key queda en el backend; sin ella responden 503
// y el resto sigue funcionando.
router.get('/sugerencias-google', ...puedeGestionar, ubicacionController.sugerenciasGoogle);
router.post('/desde-google', ...puedeGestionar, ubicacionController.crearDesdeGoogle);
// Ubicar con Google una existente que no está en el mapa.
router.put('/:id/ubicar-desde-google', ...puedeGestionar, ubicacionController.ubicarDesdeGoogle);

module.exports = router;
