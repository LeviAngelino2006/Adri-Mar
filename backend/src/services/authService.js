const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const { generarToken } = require('./tokenService');

class CredencialesInvalidasError extends Error {}

async function login(nombreUsuario, contrasena) {
  const usuario = await prisma.usuario.findUnique({
    where: { nombreUsuario },
    include: { perfil: true, estadoUsuario: true },
  });

  if (!usuario || usuario.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new CredencialesInvalidasError();
  }

  const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasenaHash);

  if (!contrasenaValida) {
    throw new CredencialesInvalidasError();
  }

  const perfil = usuario.perfil.descripcion;
  const token = generarToken({ id: usuario.id, nombreUsuario: usuario.nombreUsuario, perfil });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreUsuario: usuario.nombreUsuario,
      perfil,
    },
  };
}

module.exports = { login, CredencialesInvalidasError };
