const { Router } = require('express');
const ubicacionController = require('../controllers/ubicacionController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Todo con los mismos perfiles que crear una ubicación.
const puedeGestionar = [autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO')];

router.get('/', ...puedeGestionar, ubicacionController.listar);
router.post('/', ...puedeGestionar, ubicacionController.crear);
// Candidatos de OpenRouteService para ubicar un lugar nuevo en el mapa. La key
// de ORS queda en el backend; el front solo ve { etiqueta, latitud, longitud }.
router.get('/buscar-en-mapa', ...puedeGestionar, ubicacionController.buscarEnMapa);
// Completar (o corregir) el punto de una ubicación existente.
router.put('/:id/coordenadas', ...puedeGestionar, ubicacionController.actualizarCoordenadas);

module.exports = router;
