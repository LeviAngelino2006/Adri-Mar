const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const { generarToken } = require('./tokenService');

class CredencialesInvalidasError extends Error {}

async function login(nombreUsuario, contrasena) {
  const usuario = await prisma.usuario.findUnique({ where: { nombreUsuario } });

  if (!usuario || !usuario.activo) {
    throw new CredencialesInvalidasError();
  }

  const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasenaHash);

  if (!contrasenaValida) {
    throw new CredencialesInvalidasError();
  }

  const token = generarToken(usuario);

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreUsuario: usuario.nombreUsuario,
      perfil: usuario.perfil,
    },
  };
}

module.exports = { login, CredencialesInvalidasError };
