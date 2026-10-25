const authService = require('../services/authService');

async function login(req, res) {
  // Sin cuerpo JSON, Express 5 deja req.body en undefined.
  const { nombreUsuario, contrasena } = req.body ?? {};

  if (!nombreUsuario || !contrasena || typeof nombreUsuario !== 'string' || typeof contrasena !== 'string') {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const resultado = await authService.login(nombreUsuario, contrasena);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof authService.CredencialesInvalidasError) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    throw err;
  }
}

async function me(req, res) {
  const usuario = await authService.usuarioActual(req.usuario.id);
  res.json({ usuario });
}

async function cambiarContrasena(req, res) {
  const { contrasenaActual, contrasenaNueva } = req.body ?? {};
  try {
    const usuario = await authService.cambiarContrasenaPropia(req.usuario.id, { contrasenaActual, contrasenaNueva });
    return res.json({ usuario });
  } catch (err) {
    if (err instanceof authService.ValidacionError) {
      // Para el límite de intentos (limiteCambioContrasena).
      if (err.intentoFallido) res.locals.contrasenaActualIncorrecta = true;
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { login, me, cambiarContrasena };
