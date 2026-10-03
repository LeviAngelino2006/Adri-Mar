const { Router } = require('express');
const lecturaOdometroController = require('../controllers/lecturaOdometroController');
const { autenticar, autorizar } = require('../middlewares/auth');

const router = Router();

// Exclusivo de Administrador: a diferencia de comenzar/finalizar viaje, acá
// no hay patrón de "dueño o gestor" — corregir el historial de odómetro de
// un vehículo no es una acción que le corresponda a un chofer.
router.patch('/:id/corregir', autenticar, autorizar('ADMINISTRADOR'), lecturaOdometroController.corregir);

module.exports = router;
