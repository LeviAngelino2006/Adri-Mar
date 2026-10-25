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

  const datos = usuarioDeSesion(usuario);
  const token = generarToken(datos);

  return { token, usuario: datos };
}

// Lo que el front guarda del usuario logueado (sidebar, menú y rutas). Lo
// devuelven el login y /auth/me, con la misma forma.
// personaId es obligatorio en Usuario: la persona siempre viene.
function usuarioDeSesion(usuario) {
  return {
    id: usuario.id,
    personaId: usuario.personaId,
    nombre: usuario.persona.nombre,
    apellido: usuario.persona.apellido,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.persona.perfil.descripcion,
    habilitadoParaConducir: usuario.persona.habilitadoParaConducir,
  };
}

// El usuario de la sesión actual, leído de la base: el front lo pide al cargar
// la app y cuando el token renovado trae otro perfil o habilitación. Que la
// cuenta y la persona estén activas ya lo verificó `autenticar`.
async function usuarioActual(id) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    include: { persona: { include: { perfil: true } } },
  });
  return usuario ? usuarioDeSesion(usuario) : null;
}

module.exports = { login, usuarioActual, CredencialesInvalidasError };
