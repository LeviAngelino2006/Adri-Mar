const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');

const SALT_ROUNDS = 10;
const PERFILES_VALIDOS = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class PermisoDenegadoError extends Error {}

async function obtenerPerfilPorDescripcion(descripcion) {
  const perfil = await prisma.perfil.findUnique({ where: { descripcion } });
  if (!perfil) {
    throw new ValidacionError({ perfil: 'El perfil elegido no es válido' });
  }
  return perfil;
}

async function obtenerEstadoUsuarioPorDescripcion(descripcion) {
  const estado = await prisma.estadoUsuario.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de usuario "${descripcion}" no configurado`);
  }
  return estado;
}

function serializarUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.perfil.descripcion,
    dni: usuario.dni,
    email: usuario.email,
    telefono: usuario.telefono,
    activo: usuario.estadoUsuario.descripcion === 'ACTIVO',
    habilitadoParaConducir: usuario.habilitadoParaConducir,
  };
}

function calcularHabilitadoParaConducir(habilitadoParaConducir, perfil) {
  if (typeof habilitadoParaConducir === 'boolean') {
    return habilitadoParaConducir;
  }
  return perfil === 'CHOFER';
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

async function crearUsuario(
  { nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono, habilitadoParaConducir },
  { perfilSolicitante } = {}
) {
  const datosContacto = validarDatos({ nombre, apellido, nombreUsuario, contrasena, perfil, dni, email, telefono });

  if (perfilSolicitante === 'ENCARGADO' && perfil === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }

  const perfilRow = await obtenerPerfilPorDescripcion(perfil);
  const estadoActivo = await obtenerEstadoUsuarioPorDescripcion('ACTIVO');

  const existente = await prisma.usuario.findUnique({ where: { nombreUsuario } });
  if (existente) {
    throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
        nombre,
        apellido,
        nombreUsuario,
        contrasenaHash,
        perfilId: perfilRow.id,
        estadoUsuarioId: estadoActivo.id,
        habilitadoParaConducir: calcularHabilitadoParaConducir(habilitadoParaConducir, perfil),
        ...datosContacto,
      },
      include: { perfil: true, estadoUsuario: true },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }

  return serializarUsuario(usuario);
}

class NoEncontradoError extends Error {}

async function obtenerUsuario(id) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: Number(id) },
    include: { perfil: true, estadoUsuario: true },
  });
  if (!usuario) {
    throw new NoEncontradoError();
  }
  return usuario;
}

async function actualizarUsuario(
  id,
  { nombre, apellido, nombreUsuario, perfil, dni, email, telefono, habilitadoParaConducir },
  { perfilSolicitante } = {}
) {
  const actual = await obtenerUsuario(id);

  if (perfilSolicitante === 'ENCARGADO') {
    if (actual.perfil.descripcion === 'ADMINISTRADOR') {
      throw new PermisoDenegadoError();
    }
    if (perfil === 'ADMINISTRADOR') {
      throw new PermisoDenegadoError();
    }
  }

  const datosContacto = validarDatos(
    { nombre, apellido, nombreUsuario, perfil, dni, email, telefono },
    { requireContrasena: false }
  );

  const perfilRow = await obtenerPerfilPorDescripcion(perfil);

  let usuario;
  try {
    usuario = await prisma.usuario.update({
      where: { id: actual.id },
      data: {
        nombre,
        apellido,
        nombreUsuario,
        perfilId: perfilRow.id,
        habilitadoParaConducir:
          typeof habilitadoParaConducir === 'boolean' ? habilitadoParaConducir : undefined,
        ...datosContacto,
      },
      include: { perfil: true, estadoUsuario: true },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }

  return serializarUsuario(usuario);
}

class YaInactivoError extends Error {}

async function darDeBajaUsuario(id, { perfilSolicitante } = {}) {
  const actual = await obtenerUsuario(id);

  if (perfilSolicitante === 'ENCARGADO' && actual.perfil.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }

  if (actual.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new YaInactivoError();
  }

  const estadoInactivo = await obtenerEstadoUsuarioPorDescripcion('INACTIVO');

  const usuario = await prisma.usuario.update({
    where: { id: actual.id },
    data: { estadoUsuarioId: estadoInactivo.id },
    include: { perfil: true, estadoUsuario: true },
  });

  return serializarUsuario(usuario);
}

const ORDEN_PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];

async function listarUsuarios({ busqueda } = {}, { perfilSolicitante } = {}) {
  const where = {};

  if (busqueda) {
    where.OR = [
      { nombre: { contains: busqueda, mode: 'insensitive' } },
      { apellido: { contains: busqueda, mode: 'insensitive' } },
      { nombreUsuario: { contains: busqueda, mode: 'insensitive' } },
    ];
  }

  if (perfilSolicitante === 'ENCARGADO') {
    where.perfil = { descripcion: { not: 'ADMINISTRADOR' } };
  }

  const usuarios = await prisma.usuario.findMany({
    where,
    include: { perfil: true, estadoUsuario: true },
  });

  return usuarios
    .map((u) => ({ ...serializarUsuario(u), creadoEn: u.creadoEn }))
    .sort((a, b) => {
      const ordenPerfil = ORDEN_PERFILES.indexOf(a.perfil) - ORDEN_PERFILES.indexOf(b.perfil);
      if (ordenPerfil !== 0) return ordenPerfil;
      return a.nombre.localeCompare(b.nombre);
    });
}

async function listarDisponiblesParaConducir() {
  const usuarios = await prisma.usuario.findMany({
    where: {
      habilitadoParaConducir: true,
      estadoUsuario: { descripcion: 'ACTIVO' },
    },
    include: { perfil: true, estadoUsuario: true },
    orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
  });

  return usuarios.map(serializarUsuario);
}

module.exports = {
  crearUsuario,
  listarUsuarios,
  actualizarUsuario,
  darDeBajaUsuario,
  listarDisponiblesParaConducir,
  ValidacionError,
  NoEncontradoError,
  YaInactivoError,
  PermisoDenegadoError,
  PERFILES_VALIDOS,
};
