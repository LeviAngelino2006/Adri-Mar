const { Router } = require('express');
const presupuestoController = require('../controllers/presupuestoController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Solo gestores. No hay PUT ni DELETE a propósito: un presupuesto enviado no se
// edita ni se elimina; para cambiar algo se duplica (crea uno nuevo).
router.use(autenticar, autorizar('ADMINISTRADOR', 'ENCARGADO'));

router.post('/', presupuestoController.crear);
router.get('/', presupuestoController.listar);
// Firmas para el PDF (ver firmaPresupuestoService). Antes de /:id por claridad;
// igual no chocan, porque /:id es un solo segmento.
router.get('/assets/firma/:nombre', presupuestoController.firma);
router.get('/:id', presupuestoController.obtener);

module.exports = router;
