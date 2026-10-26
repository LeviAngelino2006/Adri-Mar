const { Router } = require('express');
const authController = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');
const { limiteLogin } = require('../middlewares/limiteLogin');

const router = Router();

router.post('/login', limiteLogin.middleware, authController.login);
router.get('/me', autenticar, authController.me);

module.exports = router;
