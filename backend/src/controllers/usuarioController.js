const usuarioService = require('../services/usuarioService');

async function crear(req, res) {
  const { nombre, apellido, nombreUsuario, contrasena, perfil } = req.body;

  try {
    const usuario = await usuarioService.crearUsuario({
      nombre,
      apellido,
      nombreUsuario,
      contrasena,
      perfil,
    });
    return res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { crear };
