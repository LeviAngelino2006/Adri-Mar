const usuarioService = require('../services/usuarioService');

async function crear(req, res) {
  const { nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono, habilitadoParaConducir } =
    req.body;

  try {
    const usuario = await usuarioService.crearUsuario(
      { nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono, habilitadoParaConducir },
      { perfilSolicitante: req.usuario.perfil }
    );
    return res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para asignar el perfil Administrador' });
    }
    if (err instanceof usuarioService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { busqueda } = req.query;
  const usuarios = await usuarioService.listarUsuarios(
    { busqueda },
    { perfilSolicitante: req.usuario.perfil }
  );
  return res.json({ usuarios });
}

async function actualizar(req, res) {
  const { nombre, apellido, nombreUsuario, perfil, dni, email, telefono, habilitadoParaConducir } = req.body;

  try {
    const usuario = await usuarioService.actualizarUsuario(
      req.params.id,
      { nombre, apellido, nombreUsuario, perfil, dni, email, telefono, habilitadoParaConducir },
      { perfilSolicitante: req.usuario.perfil }
    );
    return res.json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.NoEncontradoError) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (err instanceof usuarioService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para modificar este usuario' });
    }
    if (err instanceof usuarioService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function darDeBaja(req, res) {
  try {
    const usuario = await usuarioService.darDeBajaUsuario(req.params.id, {
      perfilSolicitante: req.usuario.perfil,
    });
    return res.json({ usuario });
  } catch (err) {
    if (err instanceof usuarioService.NoEncontradoError) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (err instanceof usuarioService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para dar de baja a este usuario' });
    }
    if (err instanceof usuarioService.YaInactivoError) {
      return res.status(409).json({ error: 'El usuario ya está inactivo' });
    }
    throw err;
  }
}

async function listarDisponiblesParaConducir(req, res) {
  const usuarios = await usuarioService.listarDisponiblesParaConducir();
  return res.json({ usuarios });
}

module.exports = { crear, listar, actualizar, darDeBaja, listarDisponiblesParaConducir };
