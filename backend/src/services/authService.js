const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const { generarToken } = require('./tokenService');

class CredencialesInvalidasError extends Error {}

async function login(nombreUsuario, contrasena) {
  const usuario = await prisma.usuario.findUnique({
    where: { nombreUsuario },
    include: {
      estadoUsuario: true,
      persona: { include: { perfil: true } },
    },
  });

  if (!usuario || usuario.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new CredencialesInvalidasError();
  }

  if (!usuario.persona.activo) {
    throw new CredencialesInvalidasError();
  }

  const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasenaHash);

  if (!contrasenaValida) {
    throw new CredencialesInvalidasError();
  }

  // personaId es obligatorio en Usuario: la persona siempre viene.
  const perfil = usuario.persona.perfil.descripcion;
  const habilitadoParaConducir = usuario.persona.habilitadoParaConducir;
  const personaId = usuario.personaId;

  const token = generarToken({
    id: usuario.id,
    personaId,
    nombreUsuario: usuario.nombreUsuario,
    perfil,
    habilitadoParaConducir,
  });

  return {
    token,
    usuario: {
      id: usuario.id,
      personaId,
      nombre: usuario.persona.nombre,
      apellido: usuario.persona.apellido,
      nombreUsuario: usuario.nombreUsuario,
      perfil,
      habilitadoParaConducir,
    },
  };
}

module.exports = { login, CredencialesInvalidasError };
