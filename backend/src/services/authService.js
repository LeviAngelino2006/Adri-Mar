const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const { generarToken } = require('./tokenService');
const { validarContrasena, SALT_ROUNDS, ValidacionError } = require('./usuarioService');

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
    // Con true, el front lleva a "Cambiar contraseña" y no deja ir a otro lado.
    debeCambiarContrasena: Boolean(usuario.debeCambiarContrasena),
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

// Cambiar la propia contraseña (H11), para todos los perfiles: pide la actual y
// la nueva, con las mismas reglas que el alta. Deja la contraseña como definitiva
// (debeCambiarContrasena=false). `intentoFallido` del error marca que la actual
// no era la correcta: lo cuenta el límite de intentos de la ruta.
async function cambiarContrasenaPropia(usuarioId, { contrasenaActual, contrasenaNueva }) {
  const errores = {};
  if (typeof contrasenaActual !== 'string' || contrasenaActual === '') {
    errores.contrasenaActual = 'Ingresá tu contraseña actual';
  }
  if (contrasenaNueva === undefined || contrasenaNueva === '') {
    errores.contrasenaNueva = 'La contraseña nueva es obligatoria';
  } else {
    const error = validarContrasena(contrasenaNueva);
    if (error) errores.contrasenaNueva = error;
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { persona: { include: { perfil: true } } },
  });
  // autenticar ya verificó que la cuenta existe y está activa.
  if (!usuario) throw new Error(`La cuenta ${usuarioId} de la sesión no existe`);

  let intentoFallido = false;
  if (!errores.contrasenaActual) {
    intentoFallido = !(await bcrypt.compare(contrasenaActual, usuario.contrasenaHash));
    if (intentoFallido) {
      errores.contrasenaActual = 'La contraseña actual no es correcta';
    } else if (!errores.contrasenaNueva && contrasenaNueva === contrasenaActual) {
      errores.contrasenaNueva = 'Tiene que ser distinta de la actual';
    }
  }
  if (Object.keys(errores).length > 0) {
    const err = new ValidacionError(errores);
    err.intentoFallido = intentoFallido;
    throw err;
  }

  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { contrasenaHash: await bcrypt.hash(contrasenaNueva, SALT_ROUNDS), debeCambiarContrasena: false },
    include: { persona: { include: { perfil: true } } },
  });
  return usuarioDeSesion(actualizado);
}

module.exports = { login, usuarioActual, cambiarContrasenaPropia, CredencialesInvalidasError, ValidacionError };
