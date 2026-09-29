const { Router } = require('express');
const usuarioController = require('../controllers/usuarioController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.post('/', autenticar, autorizar('ADMINISTRADOR'), usuarioController.crear);
router.get('/', autenticar, autorizar('ADMINISTRADOR'), usuarioController.listar);

module.exports = router;
