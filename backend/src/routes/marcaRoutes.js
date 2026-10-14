const { Router } = require('express');
const marcaController = require('../controllers/marcaController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Mismos perfiles que /clientes. Los modelos cuelgan de la marca para que
// SelectorBuscarOCrear funcione sin cambios con
// endpoint={`/marcas/${marcaId}/modelos`} (GET ?busqueda= y POST { nombre }).
router.get('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), marcaController.listar);
router.post('/', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), marcaController.crear);
router.get('/:marcaId/modelos', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), marcaController.listarModelos);
router.post('/:marcaId/modelos', autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'), marcaController.crearModelo);

module.exports = router;
