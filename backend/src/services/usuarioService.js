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

const DNI_REGEX = /^\d{7,8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarDatos({ nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono }, { requireContrasena = true } = {}) {
  const errores = {};

  if (!nombre) errores.nombre = 'El nombre es obligatorio';
  if (!apellido) errores.apellido = 'El apellido es obligatorio';
  if (!nombreUsuario) errores.nombreUsuario = 'El nombre de usuario es obligatorio';

  if (requireContrasena) {
    if (!contrasena) {
      errores.contrasena = 'La contraseña es obligatoria';
    } else if (contrasena.length < 8) {
      errores.contrasena = 'La contraseña debe tener al menos 8 caracteres';
    }
  }

  if (!perfil) {
    errores.perfil = 'El perfil es obligatorio';
  } else if (!PERFILES_VALIDOS.includes(perfil)) {
    errores.perfil = 'El perfil elegido no es válido';
  }

  const dniNormalizado = (dni || '').trim();
  if (!dniNormalizado) {
    errores.dni = 'El DNI es obligatorio';
  } else if (!DNI_REGEX.test(dniNormalizado)) {
    errores.dni = 'El DNI debe tener 7 u 8 dígitos';
  }

  const emailNormalizado = (email || '').trim().toLowerCase();
  if (!emailNormalizado) {
    errores.email = 'El email es obligatorio';
  } else if (!EMAIL_REGEX.test(emailNormalizado)) {
    errores.email = 'El email no tiene un formato válido';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    dni: dniNormalizado,
    email: emailNormalizado,
    telefono: (telefono || '').trim() || null,
  };
}

const MENSAJES_DUPLICADO = [
  ['dni', { dni: 'Ese DNI ya está registrado' }],
  ['email', { email: 'Ese email ya está registrado' }],
  ['nombre_usuario', { nombreUsuario: 'Ese nombre de usuario ya existe' }],
];

function errorDuplicado(err) {
  // Según el motor, Prisma entrega target como array de columnas o como
  // string con el nombre del índice, así que buscamos por coincidencia de
  // texto en lugar de indexar target[0].
  const target = err.meta?.target;
  const targetStr = Array.isArray(target) ? target.join(',') : String(target || '');
  const match = MENSAJES_DUPLICADO.find(([campo]) => targetStr.includes(campo));
  return match ? match[1] : { general: 'Ese registro ya existe' };
}

async function crearUsuario({ nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono }) {
  const datosContacto = validarDatos({ nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono });

  const existente = await prisma.usuario.findUnique({ where: { nombreUsuario } });
  if (existente) {
    throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: { nombre, apellido, nombreUsuario, contrasenaHash, perfil, ...datosContacto },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.perfil,
    dni: usuario.dni,
    email: usuario.email,
    telefono: usuario.telefono,
    activo: usuario.activo,
  };
}

class NoEncontradoError extends Error {}

async function obtenerUsuario(id) {
  const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
  if (!usuario) {
    throw new NoEncontradoError();
  }
  return usuario;
}

async function actualizarUsuario(id, { nombre, apellido, nombreUsuario, perfil, dni, email, telefono }) {
  const actual = await obtenerUsuario(id);

  const datosContacto = validarDatos(
    { nombre, apellido, nombreUsuario, perfil, dni, email, telefono },
    { requireContrasena: false }
  );

  let usuario;
  try {
    usuario = await prisma.usuario.update({
      where: { id: actual.id },
      data: { nombre, apellido, nombreUsuario, perfil, ...datosContacto },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.perfil,
    dni: usuario.dni,
    email: usuario.email,
    telefono: usuario.telefono,
    activo: usuario.activo,
  };
}

class YaInactivoError extends Error {}

async function darDeBajaUsuario(id) {
  const actual = await obtenerUsuario(id);

  if (!actual.activo) {
    throw new YaInactivoError();
  }

  return prisma.usuario.update({
    where: { id: actual.id },
    data: { activo: false },
  });
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
      dni: true,
      email: true,
      telefono: true,
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

module.exports = {
  crearUsuario,
  listarUsuarios,
  actualizarUsuario,
  darDeBajaUsuario,
  ValidacionError,
  NoEncontradoError,
  YaInactivoError,
  PERFILES_VALIDOS,
};
