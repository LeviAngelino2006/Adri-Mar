const { Router } = require('express');
const ubicacionController = require('../controllers/ubicacionController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.get('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), ubicacionController.listar);
router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), ubicacionController.crear);

module.exports = router;
