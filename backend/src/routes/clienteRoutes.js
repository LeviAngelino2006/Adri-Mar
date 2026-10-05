const { Router } = require('express');
const clienteController = require('../controllers/clienteController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

router.get('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), clienteController.listar);
router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), clienteController.crear);

module.exports = router;
