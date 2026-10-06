const { Router } = require('express');
const viajeController = require('../controllers/viajeController');
const { autenticar } = require('../middlewares/auth');

const router = Router();

// Solo lectura y sin restricción de rol más allá de estar autenticado: este
// catálogo únicamente alimenta un <select>.
router.get('/', autenticar, viajeController.listarEstadosPago);

module.exports = router;
