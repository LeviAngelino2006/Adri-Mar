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

async function actualizar(req, res) {
  const { nombre, apellido, nombreUsuario, perfil, dni, email, telefono } = req.body;

  try {
    const usuario = await usuarioService.actualizarUsuario(req.params.id, {
      nombre,
      apellido,
      nombreUsuario,
      perfil,
      dni,
      email,
      telefono,
    });
    return res.json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.NoEncontradoError) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (err instanceof usuarioService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function darDeBaja(req, res) {
  try {
    const usuario = await usuarioService.darDeBajaUsuario(req.params.id);
    return res.json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.NoEncontradoError) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (err instanceof usuarioService.YaInactivoError) {
      return res.status(409).json({ error: 'El usuario ya está inactivo' });
    }
    throw err;
  }
}

module.exports = { crear, listar, actualizar, darDeBaja };
