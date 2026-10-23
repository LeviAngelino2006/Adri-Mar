const personaService = require('../services/personaService');

async function crear(req, res) {
  const { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir } = req.body;

  try {
    const persona = await personaService.crearPersona(
      { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir },
      { perfilSolicitante: req.usuario.perfil }
    );
    return res.status(201).json({ persona });
  } catch (err) {
    if (err instanceof personaService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para asignar el perfil Administrador' });
    }
    if (err instanceof personaService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { busqueda, sinUsuario, activo, habilitadoParaConducir } = req.query;

  try {
    const personas = await personaService.listarPersonas(
      { busqueda, sinUsuario, activo, habilitadoParaConducir },
      { perfilSolicitante: req.usuario.perfil }
    );
    return res.json({ personas });
  } catch (err) {
    throw err;
  }
}

async function obtener(req, res) {
  try {
    const persona = await personaService.obtenerPersona(req.params.id, {
      perfilSolicitante: req.usuario.perfil,
    });
    return res.json({ persona });
  } catch (err) {
    if (err instanceof personaService.NoEncontradoError) {
      return res.status(404).json({ error: 'Persona no encontrada' });
    }
    if (err instanceof personaService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para consultar esta persona' });
    }
    throw err;
  }
}

async function actualizar(req, res) {
  const { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir } = req.body;

  try {
    const persona = await personaService.actualizarPersona(
      req.params.id,
      { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir },
      { perfilSolicitante: req.usuario.perfil }
    );
    return res.json({ persona });
  } catch (err) {
    if (err instanceof personaService.NoEncontradoError) {
      return res.status(404).json({ error: 'Persona no encontrada' });
    }
    if (err instanceof personaService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para modificar esta persona' });
    }
    if (err instanceof personaService.ChoferEnViajeError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof personaService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function darDeBaja(req, res) {
  try {
    const persona = await personaService.darDeBajaPersona(req.params.id, {
      perfilSolicitante: req.usuario.perfil,
    });
    return res.json({ persona });
  } catch (err) {
    if (err instanceof personaService.NoEncontradoError) {
      return res.status(404).json({ error: 'Persona no encontrada' });
    }
    if (err instanceof personaService.PermisoDenegadoError) {
      return res.status(403).json({ error: 'No tiene permisos para dar de baja a esta persona' });
    }
    if (err instanceof personaService.YaInactivaError) {
      return res.status(409).json({ error: 'La persona ya está inactiva' });
    }
    if (err instanceof personaService.ChoferEnViajeError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

async function listarDisponiblesParaConducir(req, res) {
  const personas = await personaService.listarDisponiblesParaConducir();
  return res.json({ personas });
}

module.exports = {
  crear,
  listar,
  obtener,
  actualizar,
  darDeBaja,
  listarDisponiblesParaConducir,
};
