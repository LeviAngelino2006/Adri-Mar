const { Router } = require('express');
const authController = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');
const { limiteLogin, limiteCambioContrasena } = require('../middlewares/limiteLogin');

const router = Router();

router.post('/login', limiteLogin.middleware, authController.login);
// Estas dos son las únicas que puede usar una cuenta con contraseña provisoria
// (ver PERMITIDAS_CON_CONTRASENA_PROVISORIA en middlewares/auth.js).
router.get('/me', autenticar, authController.me);
// Perfil propio: todos los perfiles autenticados (bloqueada con contraseña provisoria).
router.get('/perfil', autenticar, authController.perfil);
// Cambiar la propia contraseña: todos los perfiles.
router.put('/contrasena', autenticar, limiteCambioContrasena.middleware, authController.cambiarContrasena);

module.exports = router;
