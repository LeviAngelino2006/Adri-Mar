const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');

const SALT_ROUNDS = 10;
const PERFILES_VALIDOS = [
  'ADMINISTRADOR',
  'PERSONAL_TALLER',
  'LOGISTICA',
  'GERENCIA_GENERAL',
  'CHOFER',
];

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function validarDatos({ nombre, apellido, nombreUsuario, contrasena, perfil }) {
  const errores = {};

  if (!nombre) errores.nombre = 'El nombre es obligatorio';
  if (!apellido) errores.apellido = 'El apellido es obligatorio';
  if (!nombreUsuario) errores.nombreUsuario = 'El nombre de usuario es obligatorio';

  if (!contrasena) {
    errores.contrasena = 'La contraseña es obligatoria';
  } else if (contrasena.length < 8) {
    errores.contrasena = 'La contraseña debe tener al menos 8 caracteres';
  }

  if (!perfil) {
    errores.perfil = 'El perfil es obligatorio';
  } else if (!PERFILES_VALIDOS.includes(perfil)) {
    errores.perfil = 'El perfil elegido no es válido';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }
}

async function crearUsuario({ nombre, apellido, nombreUsuario, contrasena, perfil }) {
  validarDatos({ nombre, apellido, nombreUsuario, contrasena, perfil });

  const existente = await prisma.usuario.findUnique({ where: { nombreUsuario } });
  if (existente) {
    throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: { nombre, apellido, nombreUsuario, contrasenaHash, perfil },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
    }
    throw err;
  }

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.perfil,
    activo: usuario.activo,
  };
}

const ORDEN_PERFILES = [
  'ADMINISTRADOR',
  'GERENCIA_GENERAL',
  'LOGISTICA',
  'PERSONAL_TALLER',
  'CHOFER',
];

async function listarUsuarios({ busqueda } = {}) {
  const where = {};

  if (busqueda) {
    where.OR = [
      { nombre: { contains: busqueda } },
      { apellido: { contains: busqueda } },
      { nombreUsuario: { contains: busqueda } },
    ];
  }

  const usuarios = await prisma.usuario.findMany({
    where,
    select: {
      id: true,
      nombre: true,
      apellido: true,
      nombreUsuario: true,
      perfil: true,
      activo: true,
      creadoEn: true,
    },
  });

  return usuarios.sort((a, b) => {
    const ordenPerfil = ORDEN_PERFILES.indexOf(a.perfil) - ORDEN_PERFILES.indexOf(b.perfil);
    if (ordenPerfil !== 0) return ordenPerfil;
    return a.nombre.localeCompare(b.nombre);
  });
}

module.exports = { crearUsuario, listarUsuarios, ValidacionError, PERFILES_VALIDOS };
