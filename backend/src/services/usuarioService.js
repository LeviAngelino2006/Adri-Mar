const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');
const personaService = require('./personaService');
const {
  UltimoAdministradorError,
  esAdministradorActivo,
  protegerUltimoAdministrador,
} = require('../utils/administradoresActivos');

const SALT_ROUNDS = 10;

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class PermisoDenegadoError extends Error {}
class NoEncontradoError extends Error {}
class YaInactivoError extends Error {}

class PersonaDadaDeBajaError extends Error {
  constructor() {
    super('Reactivá primero a la persona.');
  }
}

const BLOQUEAR_PROPIA_CUENTA = 'No podés bloquear tu propia cuenta';
const CREDENCIALES_DE_ENCARGADO = 'Solo un Administrador puede cambiar el usuario o la contraseña de un Encargado.';

const INCLUDE_USUARIO = {
  estadoUsuario: true,
  persona: { include: { perfil: true } },
};

// La persona de la cuenta con la forma que espera esAdministradorActivo
// (persona.usuario.estadoUsuario).
function personaConCuenta(usuario) {
  return { ...usuario.persona, usuario: { estadoUsuario: usuario.estadoUsuario } };
}

async function obtenerEstadoUsuarioPorDescripcion(descripcion) {
  const estado = await prisma.estadoUsuario.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de usuario "${descripcion}" no configurado`);
  }
  return estado;
}

// personaId es obligatorio en Usuario: la persona siempre viene.
function serializarUsuario(usuario) {
  const p = usuario.persona;
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    personaId: usuario.personaId,
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni,
    email: p.email,
    telefono: p.telefono,
    perfil: p.perfil.descripcion,
    habilitadoParaConducir: p.habilitadoParaConducir,
    activo: usuario.estadoUsuario?.descripcion === 'ACTIVO',
    creadoEn: usuario.creadoEn,
    persona: {
      id: p.id,
      nombre: p.nombre,
      apellido: p.apellido,
      dni: p.dni,
      email: p.email,
      telefono: p.telefono,
      perfil: p.perfil.descripcion,
      habilitadoParaConducir: p.habilitadoParaConducir,
      activo: p.activo,
    },
  };
}

function validarCredenciales({ nombreUsuario, contrasena }, { requireContrasena = true } = {}) {
  const errores = {};

  const nombreUsuarioNorm = (nombreUsuario || '').trim();
  if (!nombreUsuarioNorm) {
    errores.nombreUsuario = 'El nombre de usuario es obligatorio';
  }

  if (requireContrasena) {
    if (!contrasena) {
      errores.contrasena = 'La contraseña es obligatoria';
    } else if (contrasena.length < 8) {
      errores.contrasena = 'La contraseña debe tener al menos 8 caracteres';
    }
  } else if (contrasena && contrasena.length < 8) {
    errores.contrasena = 'La contraseña debe tener al menos 8 caracteres';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return { nombreUsuario: nombreUsuarioNorm };
}

async function obtenerUsuario(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new NoEncontradoError();
  }
  const usuario = await prisma.usuario.findUnique({
    where: { id: numero },
    include: INCLUDE_USUARIO,
  });
  if (!usuario) {
    throw new NoEncontradoError();
  }
  return usuario;
}

// La ficha de una cuenta (GET /usuarios/:id), con la misma regla que la ficha de
// una persona: un Encargado no ve la cuenta de un Administrador.
async function consultarUsuario(id, { perfilSolicitante } = {}) {
  const usuario = await obtenerUsuario(id);
  if (perfilSolicitante === 'ENCARGADO' && usuario.persona.perfil.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }
  return serializarUsuario(usuario);
}

async function crearUsuario(
  { personaId, nombreUsuario, contrasena },
  { perfilSolicitante } = {}
) {
  const errores = {};
  const personaIdNum = Number(personaId);
  if (!personaId || !Number.isInteger(personaIdNum) || personaIdNum <= 0) {
    errores.personaId = 'Debe seleccionar una persona válida';
  }

  let creds;
  try {
    creds = validarCredenciales({ nombreUsuario, contrasena }, { requireContrasena: true });
  } catch (err) {
    if (err instanceof ValidacionError) {
      Object.assign(errores, err.errores);
    } else {
      throw err;
    }
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  const persona = await prisma.persona.findUnique({
    where: { id: personaIdNum },
    include: { perfil: true, usuario: true },
  });

  if (!persona) {
    throw new ValidacionError({ personaId: 'La persona seleccionada no existe' });
  }

  if (!persona.activo) {
    throw new ValidacionError({ personaId: 'No se puede crear una cuenta para una persona dada de baja' });
  }

  if (persona.usuario) {
    throw new ValidacionError({ personaId: 'Esta persona ya tiene una cuenta de usuario asignada' });
  }

  if (perfilSolicitante === 'ENCARGADO' && persona.perfil.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }

  const existente = await prisma.usuario.findUnique({ where: { nombreUsuario: creds.nombreUsuario } });
  if (existente) {
    throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
  }

  const estadoActivo = await obtenerEstadoUsuarioPorDescripcion('ACTIVO');
  const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
        personaId: persona.id,
        nombreUsuario: creds.nombreUsuario,
        contrasenaHash,
        estadoUsuarioId: estadoActivo.id,
      },
      include: INCLUDE_USUARIO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      const targetStr = Array.isArray(target) ? target.join(',') : String(target || '');
      if (targetStr.includes('persona_id')) {
        throw new ValidacionError({ personaId: 'Esta persona ya tiene un usuario asignado' });
      }
      throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
    }
    throw err;
  }

  return serializarUsuario(usuario);
}

async function actualizarUsuario(
  id,
  { nombreUsuario, contrasena, activo },
  { perfilSolicitante, personaIdSolicitante } = {}
) {
  const actual = await obtenerUsuario(id);

  if (perfilSolicitante === 'ENCARGADO' && actual.persona?.perfil?.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }
  // Un Encargado no toma la cuenta de otro (H4): el nombre de usuario y la
  // contraseña de una cuenta de Encargado solo los cambia un Administrador. El
  // resto de lo que un Encargado puede hacer sobre otro queda como estaba.
  if (perfilSolicitante === 'ENCARGADO' && actual.persona.perfil.descripcion === 'ENCARGADO') {
    const cambiaNombreUsuario = nombreUsuario !== undefined && String(nombreUsuario).trim() !== actual.nombreUsuario;
    if (cambiaNombreUsuario || contrasena !== undefined) {
      throw new PermisoDenegadoError(CREDENCIALES_DE_ENCARGADO);
    }
  }
  if (activo === false && actual.personaId === personaIdSolicitante) {
    throw new personaService.AccionSobreSiMismoError(BLOQUEAR_PROPIA_CUENTA);
  }
  // La cuenta de una persona dada de baja queda inactiva (H10): ni se activa ni
  // se le cambian las credenciales. Antes había que reactivar a la persona.
  if (!actual.persona.activo) {
    const cambiaNombreUsuario = nombreUsuario !== undefined && String(nombreUsuario).trim() !== actual.nombreUsuario;
    if (activo === true || cambiaNombreUsuario || contrasena !== undefined) {
      throw new PersonaDadaDeBajaError();
    }
  }

  const creds = validarCredenciales({ nombreUsuario, contrasena }, { requireContrasena: false });

  const data = {
    nombreUsuario: creds.nombreUsuario,
  };

  if (contrasena && contrasena.trim()) {
    data.contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);
  }

  if (typeof activo === 'boolean') {
    const descEstado = activo ? 'ACTIVO' : 'INACTIVO';
    const estado = await obtenerEstadoUsuarioPorDescripcion(descEstado);
    data.estadoUsuarioId = estado.id;
  }

  // Bloquear la cuenta de un Administrador activo: solo si queda otro.
  const sacaUnAdministrador = activo === false && esAdministradorActivo(personaConCuenta(actual));

  let usuario;
  try {
    usuario = await protegerUltimoAdministrador(prisma, { personaId: actual.personaId, sacaUnAdministrador }, (cliente) =>
      cliente.usuario.update({
        where: { id: actual.id },
        data,
        include: INCLUDE_USUARIO,
      })
    );
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError({ nombreUsuario: 'Ese nombre de usuario ya existe' });
    }
    throw err;
  }

  return serializarUsuario(usuario);
}

async function darDeBajaUsuario(id, { perfilSolicitante, personaIdSolicitante } = {}) {
  const actual = await obtenerUsuario(id);

  if (perfilSolicitante === 'ENCARGADO' && actual.persona?.perfil?.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }
  if (actual.personaId === personaIdSolicitante) {
    throw new personaService.AccionSobreSiMismoError(BLOQUEAR_PROPIA_CUENTA);
  }

  if (actual.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new YaInactivoError();
  }

  const estadoInactivo = await obtenerEstadoUsuarioPorDescripcion('INACTIVO');

  // Bloquear la cuenta de un Administrador activo: solo si queda otro.
  const sacaUnAdministrador = esAdministradorActivo(personaConCuenta(actual));
  const usuario = await protegerUltimoAdministrador(prisma, { personaId: actual.personaId, sacaUnAdministrador }, (cliente) =>
    cliente.usuario.update({
      where: { id: actual.id },
      data: { estadoUsuarioId: estadoInactivo.id },
      include: INCLUDE_USUARIO,
    })
  );

  return serializarUsuario(usuario);
}

const ORDEN_PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];

async function listarUsuarios({ busqueda } = {}, { perfilSolicitante } = {}) {
  const where = {};

  if (busqueda) {
    const q = busqueda.trim();
    where.OR = [
      { nombreUsuario: { contains: q, mode: 'insensitive' } },
      { persona: { nombre: { contains: q, mode: 'insensitive' } } },
      { persona: { apellido: { contains: q, mode: 'insensitive' } } },
    ];
  }

  if (perfilSolicitante === 'ENCARGADO') {
    where.persona = { perfil: { descripcion: { not: 'ADMINISTRADOR' } } };
  }

  const usuarios = await prisma.usuario.findMany({
    where,
    include: INCLUDE_USUARIO,
  });

  return usuarios
    .map(serializarUsuario)
    .sort((a, b) => {
      const ordenPerfil = ORDEN_PERFILES.indexOf(a.perfil) - ORDEN_PERFILES.indexOf(b.perfil);
      if (ordenPerfil !== 0) return ordenPerfil;
      return a.nombre.localeCompare(b.nombre);
    });
}

// Delegamos a personaService para mantener compatibilidad con endpoints anteriores si se consultan
async function listarDisponiblesParaConducir() {
  return personaService.listarDisponiblesParaConducir();
}

module.exports = {
  crearUsuario,
  listarUsuarios,
  actualizarUsuario,
  darDeBajaUsuario,
  obtenerUsuario,
  consultarUsuario,
  listarDisponiblesParaConducir,
  serializarUsuario,
  ValidacionError,
  NoEncontradoError,
  YaInactivoError,
  PermisoDenegadoError,
  UltimoAdministradorError,
  AccionSobreSiMismoError: personaService.AccionSobreSiMismoError,
  PersonaDadaDeBajaError,
};
