const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const { generarToken } = require('./tokenService');

class CredencialesInvalidasError extends Error {}

// Hash de una contraseña que nadie tiene. Si la cuenta no existe, está bloqueada
// o la persona se dio de baja, se compara contra este: la respuesta es la misma
// ("Usuario o contraseña incorrectos") y tarda lo mismo que con una cuenta real,
// así ni el mensaje ni el tiempo dicen qué nombres de usuario existen.
const HASH_DE_RELLENO = bcrypt.hashSync('contraseña-que-nadie-tiene', 10);

async function login(nombreUsuario, contrasena) {
  const usuario = await prisma.usuario.findUnique({
    where: { nombreUsuario },
    include: {
      estadoUsuario: true,
      persona: { include: { perfil: true } },
    },
  });

  const puedeIngresar = Boolean(usuario) && usuario.estadoUsuario.descripcion === 'ACTIVO' && usuario.persona.activo;
  const contrasenaValida = await bcrypt.compare(contrasena, puedeIngresar ? usuario.contrasenaHash : HASH_DE_RELLENO);

  if (!puedeIngresar || !contrasenaValida) {
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
