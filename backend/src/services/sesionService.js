const prisma = require('./prismaClient');

// La sesión de cada request sale de la BASE, no del token: el token solo dice
// quién es (id de la cuenta) y que la firma es nuestra. Así, dar de baja a la
// persona, bloquear la cuenta, cambiar el perfil o la habilitación para conducir
// tienen efecto en el próximo pedido, aunque el token siga vigente.
//
// Es UNA consulta por clave primaria con un JOIN a las tres tablas, en SQL a
// mano: con `select` anidado, Prisma resuelve cada relación con un SELECT aparte
// (cuatro idas a la base en vez de una). Los nombres de tablas y columnas son los
// de los @@map / @map de schema.prisma; el test de integración la corre contra
// la base migrada, así que si alguno cambia, falla ahí.
async function buscarSesion(payload) {
  const usuarioId = Number(payload?.id);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return null;

  const filas = await prisma.$queryRaw`
    SELECT u.id,
           u.nombre_usuario           AS "nombreUsuario",
           u.persona_id               AS "personaId",
           e.descripcion              AS "estadoCuenta",
           p.activo                   AS "personaActiva",
           p.habilitado_para_conducir AS "habilitadoParaConducir",
           f.descripcion              AS "perfil"
      FROM usuarios u
      JOIN estado_usuario e ON e.id_estadousuario = u.estado_usuario_id
      JOIN personas p       ON p.id = u.persona_id
      JOIN perfiles f       ON f.id_perfil = p.perfil_id
     WHERE u.id = ${usuarioId}`;

  const fila = filas[0];
  if (!fila || fila.estadoCuenta !== 'ACTIVO' || !fila.personaActiva) return null;

  return {
    id: fila.id,
    personaId: fila.personaId,
    nombreUsuario: fila.nombreUsuario,
    perfil: fila.perfil,
    habilitadoParaConducir: fila.habilitadoParaConducir,
  };
}

module.exports = { buscarSesion };
