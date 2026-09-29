const usuarioService = require('../services/usuarioService');

async function crear(req, res) {
  const { nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono } = req.body;

  try {
    const usuario = await usuarioService.crearUsuario({
      nombre,
      apellido,
      nombreUsuario,
      contrasena,
      perfil,
      dni,
      email,
      telefono,
    });
    return res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { busqueda } = req.query;
  const usuarios = await usuarioService.listarUsuarios({ busqueda });
  return res.json({ usuarios });
}

module.exports = { crear, listar };
