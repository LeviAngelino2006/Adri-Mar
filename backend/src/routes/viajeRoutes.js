const { Router } = require('express');
const viajeController = require('../controllers/viajeController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), viajeController.crear);

module.exports = router;
