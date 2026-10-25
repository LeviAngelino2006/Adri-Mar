// Siempre queda al menos un Administrador activo (H2 de la auditoría de Personal
// y Usuarios): si no, nadie más puede crear ni asignar Administradores y la única
// salida es tocar la base a mano.
//
// "Administrador activo" = persona con perfil ADMINISTRADOR, activa, con cuenta
// en estado ACTIVO (alguien que puede iniciar sesión y administrar).
//
// Lo usan personaService (cambio de perfil, baja) y usuarioService (bloqueo de
// la cuenta): vive en utils para no importar un service desde otro.

const MENSAJE_ULTIMO_ADMINISTRADOR = 'Tiene que quedar al menos un Administrador activo';

class UltimoAdministradorError extends Error {
  constructor() {
    super(MENSAJE_ULTIMO_ADMINISTRADOR);
  }
}

// ¿La persona (con perfil y usuario.estadoUsuario incluidos) es hoy un
// Administrador activo? Solo si lo es, el cambio puede dejar al sistema sin.
function esAdministradorActivo(persona) {
  return (
    persona?.perfil?.descripcion === 'ADMINISTRADOR' &&
    persona.activo === true &&
    persona.usuario?.estadoUsuario?.descripcion === 'ACTIVO'
  );
}

// Clave fija del advisory lock de Postgres que serializa los cambios que sacan a
// un Administrador activo. Sin él, dos Administradores que se bajan el perfil
// uno al otro a la vez verían cada uno al otro todavía activo (READ COMMITTED),
// pasarían los dos y el sistema quedaría sin ninguno. Con el lock, el segundo
// espera a que el primero confirme y cuenta con su cambio ya hecho.
const CLAVE_LOCK_ADMINISTRADORES = 724001;

// Dentro de la transacción del cambio: toma el lock y cuenta los OTROS
// Administradores activos. Si no queda ninguno, corta (y la transacción se
// deshace). El lock se libera solo al confirmar o deshacer.
async function asegurarOtroAdministradorActivo(tx, personaId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ADMINISTRADORES})`;
  const otros = await tx.persona.count({
    where: {
      id: { not: personaId },
      activo: true,
      perfil: { descripcion: 'ADMINISTRADOR' },
      usuario: { is: { estadoUsuario: { descripcion: 'ACTIVO' } } },
    },
  });
  if (otros === 0) {
    throw new UltimoAdministradorError();
  }
}

// Ejecuta `cambio(cliente)` y, si saca a un Administrador activo, lo hace en una
// transacción con el chequeo de arriba. Si no lo saca, va directo, como antes.
async function protegerUltimoAdministrador(prisma, { personaId, sacaUnAdministrador }, cambio) {
  if (!sacaUnAdministrador) return cambio(prisma);
  return prisma.$transaction(async (tx) => {
    await asegurarOtroAdministradorActivo(tx, personaId);
    return cambio(tx);
  });
}

module.exports = {
  UltimoAdministradorError,
  MENSAJE_ULTIMO_ADMINISTRADOR,
  CLAVE_LOCK_ADMINISTRADORES,
  esAdministradorActivo,
  asegurarOtroAdministradorActivo,
  protegerUltimoAdministrador,
};
