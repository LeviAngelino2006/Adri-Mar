const authService = require('../services/authService');

async function login(req, res) {
  const { nombreUsuario, contrasena } = req.body;

  if (!nombreUsuario || !contrasena) {
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

module.exports = { login, me };
