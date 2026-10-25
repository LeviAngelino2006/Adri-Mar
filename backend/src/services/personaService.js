const prisma = require('./prismaClient');
const {
  UltimoAdministradorError,
  esAdministradorActivo,
  asegurarOtroAdministradorActivo,
} = require('../utils/administradoresActivos');

// Persona = quién es alguien en la empresa (empleado/chofer), tenga o no
// cuenta en el sistema. Dueña de los datos personales, del perfil, de la
// habilitación para conducir y del legajo de documentación de chofer. La
// cuenta de acceso (Usuario) se gestiona aparte, en usuarioService.

const PERFILES_VALIDOS = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];
const ORDEN_PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'];

const DNI_REGEX = /^\d{7,8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class PermisoDenegadoError extends Error {}
class NoEncontradoError extends Error {}
class YaInactivaError extends Error {}

// Caso borde ya decidido: una persona que es chofer de un viaje En viaje en
// curso no se puede dar de baja ni deshabilitar para conducir hasta que ese
// viaje finalice — sin importar su perfil. Se consulta viajes directamente acá
// en vez de importar viajeService, para no crear una dependencia cruzada.
class ChoferEnViajeError extends Error {}

// Tampoco se da de baja ni se deshabilita a quien es chofer de viajes
// Programados, de cualquier fecha, hasta reasignarlos (H6 y H7 de la auditoría
// de Personal y Usuarios, decisión del cliente): si no, el viaje queda a nombre
// de alguien que no puede comenzarlo y se descubre el día del viaje. Lleva la
// lista para que el front la muestre.
class ChoferConViajesProgramadosError extends Error {
  constructor(viajes, accion) {
    const cantidad = viajes.length;
    super(
      cantidad === 1
        ? `Tiene 1 viaje programado. Reasignalo antes de ${accion}.`
        : `Tiene ${cantidad} viajes programados. Reasignalos antes de ${accion}.`
    );
    this.viajes = viajes;
  }
}

// Los datos de una persona dada de baja son de solo consulta, como los de un
// vehículo dado de baja (H12 de la auditoría, decisión del cliente): para
// corregirlos, primero se la reactiva. Lo usa también usuarioService (H10).
class PersonaDadaDeBajaError extends Error {
  constructor() {
    super('Reactivá primero a la persona.');
  }
}

// Nadie se da de baja, se bloquea la cuenta ni se cambia el perfil a sí mismo
// (H3 de la auditoría de Personal y Usuarios): es fácil de hacer sin querer y no
// tiene vuelta atrás desde la pantalla. Lo usa también usuarioService.
class AccionSobreSiMismoError extends Error {}

const INCLUDE_PERSONA = { perfil: true, usuario: { include: { estadoUsuario: true } } };

async function esChoferDeViajeEnCurso(personaId) {
  const viaje = await prisma.viaje.findFirst({
    where: { choferId: personaId, estadoViaje: { descripcion: 'EN_VIAJE' } },
  });
  return Boolean(viaje);
}

// Antes de dar de baja o deshabilitar, dentro de la misma transacción: si es
// chofer de viajes Programados, corta con la lista; si no, lo saca de los
// candidatos de los viajes A confirmar (ahí todavía no tiene nada asignado) y
// devuelve cuántas candidaturas quitó.
async function liberarComoChofer(tx, personaId, accion) {
  const programados = await tx.viaje.findMany({
    where: { choferId: personaId, estadoViaje: { descripcion: 'PROGRAMADO' } },
    select: { id: true, fechaInicio: true, origen: { select: { nombre: true } }, destino: { select: { nombre: true } } },
    orderBy: [{ fechaInicio: 'asc' }, { id: 'asc' }],
  });
  if (programados.length > 0) {
    throw new ChoferConViajesProgramadosError(
      programados.map((v) => ({
        id: v.id,
        fecha: v.fechaInicio,
        origen: v.origen?.nombre ?? null,
        destino: v.destino?.nombre ?? null,
      })),
      accion
    );
  }
  const { count } = await tx.viajeChoferCandidato.deleteMany({
    where: { personaId, viaje: { estadoViaje: { descripcion: 'A_CONFIRMAR' } } },
  });
  return count;
}

async function obtenerPerfilPorDescripcion(descripcion) {
  const perfil = await prisma.perfil.findUnique({ where: { descripcion } });
  if (!perfil) {
    throw new ValidacionError({ perfil: 'El perfil elegido no es válido' });
  }
  return perfil;
}

// La cuenta de acceso viaja resumida (sin hash ni nada sensible): alcanza para
// saber si la persona tiene acceso y ofrecer "Crear acceso al sistema".
function serializarPersona(persona) {
  const usuario = persona.usuario ?? null;
  return {
    id: persona.id,
    nombre: persona.nombre,
    apellido: persona.apellido,
    dni: persona.dni,
    email: persona.email,
    telefono: persona.telefono,
    perfil: persona.perfil.descripcion,
    habilitadoParaConducir: persona.habilitadoParaConducir,
    activo: persona.activo,
    fechaBaja: persona.fechaBaja ?? null,
    creadoEn: persona.creadoEn,
    usuario: usuario
      ? {
          id: usuario.id,
          nombreUsuario: usuario.nombreUsuario,
          activo: usuario.estadoUsuario?.descripcion === 'ACTIVO',
        }
      : null,
  };
}

function calcularHabilitadoParaConducir(habilitadoParaConducir, perfil) {
  if (typeof habilitadoParaConducir === 'boolean') {
    return habilitadoParaConducir;
  }
  return perfil === 'CHOFER';
}

function validarDatos({ nombre, apellido, perfil, dni, email, telefono }) {
  const errores = {};

  const nombreNormalizado = (nombre || '').trim();
  const apellidoNormalizado = (apellido || '').trim();
  if (!nombreNormalizado) errores.nombre = 'El nombre es obligatorio';
  if (!apellidoNormalizado) errores.apellido = 'El apellido es obligatorio';

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

  // El email es opcional: si viene, se valida el formato. Vacío se guarda
  // como null y no como "": la columna es @unique y dos "" chocarían (P2002).
  const emailNormalizado = (email || '').trim().toLowerCase();
  if (emailNormalizado && !EMAIL_REGEX.test(emailNormalizado)) {
    errores.email = 'El email no tiene un formato válido';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    nombre: nombreNormalizado,
    apellido: apellidoNormalizado,
    dni: dniNormalizado,
    email: emailNormalizado || null,
    telefono: (telefono || '').trim() || null,
  };
}

const MENSAJES_DUPLICADO = [
  ['dni', { dni: 'Ese DNI ya está registrado' }],
  ['email', { email: 'Ese email ya está registrado' }],
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

async function obtenerPersonaConRelaciones(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new NoEncontradoError();
  }
  const persona = await prisma.persona.findUnique({ where: { id: numero }, include: INCLUDE_PERSONA });
  if (!persona) {
    throw new NoEncontradoError();
  }
  return persona;
}

async function obtenerPersona(id, { perfilSolicitante } = {}) {
  const persona = await obtenerPersonaConRelaciones(id);
  if (perfilSolicitante === 'ENCARGADO' && persona.perfil.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }
  return serializarPersona(persona);
}

async function crearPersona(
  { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir },
  { perfilSolicitante } = {}
) {
  const datos = validarDatos({ nombre, apellido, perfil, dni, email, telefono });

  if (perfilSolicitante === 'ENCARGADO' && perfil === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }

  const perfilRow = await obtenerPerfilPorDescripcion(perfil);

  try {
    const persona = await prisma.persona.create({
      data: {
        ...datos,
        perfilId: perfilRow.id,
        habilitadoParaConducir: calcularHabilitadoParaConducir(habilitadoParaConducir, perfil),
      },
      include: INCLUDE_PERSONA,
    });
    return serializarPersona(persona);
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }
}

async function actualizarPersona(
  id,
  { nombre, apellido, perfil, dni, email, telefono, habilitadoParaConducir },
  { perfilSolicitante, personaIdSolicitante } = {}
) {
  const actual = await obtenerPersonaConRelaciones(id);

  if (perfilSolicitante === 'ENCARGADO') {
    if (actual.perfil.descripcion === 'ADMINISTRADOR' || perfil === 'ADMINISTRADOR') {
      throw new PermisoDenegadoError();
    }
  }
  if (!actual.activo) {
    throw new PersonaDadaDeBajaError();
  }

  // Sus propios datos sí, pero el perfil y la habilitación de uno los cambia
  // otro. El front manda el formulario entero: solo es un cambio si difiere.
  if (actual.id === personaIdSolicitante) {
    const cambiaPerfil = perfil !== actual.perfil.descripcion;
    const cambiaHabilitacion =
      typeof habilitadoParaConducir === 'boolean' && habilitadoParaConducir !== actual.habilitadoParaConducir;
    if (cambiaPerfil || cambiaHabilitacion) {
      throw new AccionSobreSiMismoError('No podés cambiar tu propio perfil');
    }
  }

  // Deshabilitar = pasar de habilitada a no habilitada. Si no viene en el
  // payload, viene en true o ya estaba en false, no hay nada que validar acá.
  const deshabilita = actual.habilitadoParaConducir && habilitadoParaConducir === false;
  if (deshabilita && (await esChoferDeViajeEnCurso(actual.id))) {
    throw new ChoferEnViajeError(
      'La persona tiene un viaje En viaje en curso como chofer. Debe finalizarse antes de deshabilitarla para conducir.'
    );
  }

  const datos = validarDatos({ nombre, apellido, perfil, dni, email, telefono });
  const perfilRow = await obtenerPerfilPorDescripcion(perfil);

  // Pasar a otro perfil a un Administrador activo: solo si queda otro.
  const sacaUnAdministrador = esAdministradorActivo(actual) && perfil !== 'ADMINISTRADOR';

  // Los chequeos que dependen de otras filas (el último Administrador, los
  // viajes Programados) van en la misma transacción que el cambio.
  const cambio = async (cliente) => {
    if (sacaUnAdministrador) await asegurarOtroAdministradorActivo(cliente, actual.id);
    const candidaturasQuitadas = deshabilita ? await liberarComoChofer(cliente, actual.id, 'deshabilitarla') : 0;
    const persona = await cliente.persona.update({
      where: { id: actual.id },
      data: {
        ...datos,
        perfilId: perfilRow.id,
        habilitadoParaConducir: typeof habilitadoParaConducir === 'boolean' ? habilitadoParaConducir : undefined,
      },
      include: INCLUDE_PERSONA,
    });
    return { persona: serializarPersona(persona), candidaturasQuitadas };
  };

  try {
    return sacaUnAdministrador || deshabilita ? await prisma.$transaction(cambio) : await cambio(prisma);
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ValidacionError(errorDuplicado(err));
    }
    throw err;
  }
}

// Baja lógica de la persona: conserva sus datos, viajes y documentos. Si tiene
// cuenta de acceso, se desactiva en la MISMA transacción (una persona que ya
// no está en la empresa no puede seguir entrando al sistema).
async function darDeBajaPersona(id, { perfilSolicitante, personaIdSolicitante } = {}) {
  const actual = await obtenerPersonaConRelaciones(id);

  if (perfilSolicitante === 'ENCARGADO' && actual.perfil.descripcion === 'ADMINISTRADOR') {
    throw new PermisoDenegadoError();
  }
  if (actual.id === personaIdSolicitante) {
    throw new AccionSobreSiMismoError('No podés darte de baja a vos mismo');
  }
  if (!actual.activo) {
    throw new YaInactivaError();
  }
  if (await esChoferDeViajeEnCurso(actual.id)) {
    throw new ChoferEnViajeError(
      'La persona tiene un viaje En viaje en curso como chofer. Debe finalizarse antes de darla de baja.'
    );
  }

  const estadoInactivo = await prisma.estadoUsuario.findUnique({ where: { descripcion: 'INACTIVO' } });
  if (!estadoInactivo) {
    throw new Error('Estado de usuario "INACTIVO" no configurado');
  }

  return prisma.$transaction(async (tx) => {
    // Dar de baja a un Administrador activo: solo si queda otro. El chequeo va
    // en la misma transacción que la baja (ver administradoresActivos).
    if (esAdministradorActivo(actual)) {
      await asegurarOtroAdministradorActivo(tx, actual.id);
    }
    const candidaturasQuitadas = await liberarComoChofer(tx, actual.id, 'darla de baja');
    await tx.usuario.updateMany({
      where: { personaId: actual.id },
      data: { estadoUsuarioId: estadoInactivo.id },
    });
    const persona = await tx.persona.update({
      where: { id: actual.id },
      data: { activo: false, fechaBaja: new Date() },
      include: INCLUDE_PERSONA,
    });
    return { persona: serializarPersona(persona), candidaturasQuitadas };
  });
}

function valorBooleano(valor) {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  return undefined;
}

// Filtros opcionales (query string): busqueda (nombre, apellido o DNI),
// sinUsuario=true (personas activas sin cuenta, para el alta de usuario),
// activo=true|false y habilitadoParaConducir=true|false.
async function listarPersonas(
  { busqueda, sinUsuario, activo, habilitadoParaConducir } = {},
  { perfilSolicitante } = {}
) {
  const where = {};
  const texto = (busqueda || '').trim();

  if (texto) {
    where.OR = [
      { nombre: { contains: texto, mode: 'insensitive' } },
      { apellido: { contains: texto, mode: 'insensitive' } },
      { dni: { contains: texto.replace(/\./g, '') } },
    ];
  }

  if (valorBooleano(sinUsuario) === true) {
    where.usuario = { is: null };
    where.activo = true;
  }

  const filtroActivo = valorBooleano(activo);
  if (filtroActivo !== undefined) where.activo = filtroActivo;

  const filtroConducir = valorBooleano(habilitadoParaConducir);
  if (filtroConducir !== undefined) where.habilitadoParaConducir = filtroConducir;

  if (perfilSolicitante === 'ENCARGADO') {
    where.perfil = { descripcion: { not: 'ADMINISTRADOR' } };
  }

  const personas = await prisma.persona.findMany({ where, include: INCLUDE_PERSONA });

  return personas.map(serializarPersona).sort((a, b) => {
    const ordenPerfil = ORDEN_PERFILES.indexOf(a.perfil) - ORDEN_PERFILES.indexOf(b.perfil);
    if (ordenPerfil !== 0) return ordenPerfil;
    return a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre);
  });
}

// Choferes asignables: personas activas y habilitadas para conducir, tengan o
// no cuenta en el sistema. Incluye a un Administrador que maneja (se lo tiene
// que poder asignar), así que, a diferencia de la ficha y el listado de
// Personal, no se puede ocultar a los Administradores para un Encargado: en
// cambio, solo viaja lo que hace falta para elegir al chofer (nada de DNI,
// email, teléfono ni cuenta).
async function listarDisponiblesParaConducir() {
  return prisma.persona.findMany({
    where: { habilitadoParaConducir: true, activo: true },
    select: { id: true, nombre: true, apellido: true },
    orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
  });
}

module.exports = {
  crearPersona,
  actualizarPersona,
  darDeBajaPersona,
  listarPersonas,
  obtenerPersona,
  listarDisponiblesParaConducir,
  serializarPersona,
  ValidacionError,
  PermisoDenegadoError,
  NoEncontradoError,
  YaInactivaError,
  ChoferEnViajeError,
  ChoferConViajesProgramadosError,
  UltimoAdministradorError,
  AccionSobreSiMismoError,
  PersonaDadaDeBajaError,
  PERFILES_VALIDOS,
};
