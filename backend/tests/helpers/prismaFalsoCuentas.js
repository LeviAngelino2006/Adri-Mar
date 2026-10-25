// Doble de Prisma CON ESTADO para los tests de seguridad de Personal y Usuarios
// (cuentas.test.js): personas y cuentas en memoria, un $transaction con rollback
// real y el registro de los advisory locks ($executeRaw). Cubre lo que usan
// personaService, usuarioService y authService. NO toca la base ni lee el .env.
//
//   const { crearCuentas } = require('./helpers/prismaFalsoCuentas');
//   const { prisma, db, sembrar } = crearCuentas();
//   instalarEnCache(SRC, prisma);

const PERFILES = [
  { id: 1, descripcion: 'ADMINISTRADOR' },
  { id: 2, descripcion: 'ENCARGADO' },
  { id: 3, descripcion: 'PERSONAL_TALLER' },
  { id: 4, descripcion: 'CHOFER' },
];
const ESTADOS_USUARIO = [
  { id: 1, descripcion: 'ACTIVO' },
  { id: 2, descripcion: 'INACTIVO' },
];

const perfilPorId = (id) => PERFILES.find((p) => p.id === id);
const estadoPorId = (id) => ESTADOS_USUARIO.find((e) => e.id === id);

function errorUnico(campo) {
  const err = new Error(`Unique constraint failed on ${campo}`);
  err.code = 'P2002';
  err.meta = { target: [campo] };
  return err;
}

function crearCuentas() {
  const db = {
    personas: [],
    usuarios: [],
    // Viajes en los que alguien es chofer: { id, estado, choferId, fechaInicio,
    // origen, destino } (origen y destino, el nombre de la ubicación). Los
    // carga cada test; sembrar() los vacía.
    viajes: [],
    // Candidaturas de los viajes A confirmar: { viajeId, personaId }.
    candidatos: [],
    // Cada $executeRaw (el advisory lock de administradoresActivos).
    locks: [],
    siguienteId: 100,
  };

  // Datos de la auditoría de Personal y Usuarios (mismos nombres e ids).
  function sembrar() {
    const persona = (id, nombre, apellido, perfil, { activo = true, habilitado = false } = {}) => ({
      id,
      nombre,
      apellido,
      dni: String(30000000 + id),
      email: null,
      telefono: null,
      perfilId: PERFILES.find((p) => p.descripcion === perfil).id,
      habilitadoParaConducir: habilitado,
      activo,
      fechaBaja: activo ? null : new Date('2026-09-15T15:00:00Z'),
      creadoEn: new Date('2026-03-02T12:00:00Z'),
    });
    db.personas.splice(0, db.personas.length,
      persona(1, 'Adriana', 'Martínez', 'ADMINISTRADOR'),
      persona(2, 'Carlos', 'Ferreyra', 'ADMINISTRADOR'),
      persona(3, 'Lucía', 'Romero', 'ENCARGADO', { habilitado: true }),
      persona(4, 'Diego', 'Sosa', 'ENCARGADO'),
      persona(7, 'Hugo', 'Paz', 'PERSONAL_TALLER'),
      persona(13, 'Néstor', 'Vega', 'CHOFER', { activo: false, habilitado: true }),
      persona(14, 'Ramiro', 'Acosta', 'CHOFER', { habilitado: true })
    );
    const cuenta = (id, personaId, nombreUsuario, estado = 'ACTIVO') => ({
      id,
      personaId,
      nombreUsuario,
      contrasenaHash: 'hash-de-prueba',
      estadoUsuarioId: ESTADOS_USUARIO.find((e) => e.descripcion === estado).id,
      creadoEn: new Date('2026-03-02T12:00:00Z'),
    });
    db.usuarios.splice(0, db.usuarios.length,
      cuenta(1, 1, 'amartinez'),
      cuenta(2, 2, 'cferreyra'),
      cuenta(3, 3, 'lromero'),
      cuenta(4, 4, 'dsosa'),
      cuenta(10, 13, 'nvega', 'INACTIVO'),
      cuenta(11, 14, 'racosta')
    );
    db.viajes.length = 0;
    db.candidatos.length = 0;
    db.locks.length = 0;
  }

  // Lo que entiende de los `where` de viaje: choferId y estadoViaje.descripcion.
  function cumpleViaje(v, where = {}) {
    if (where.choferId !== undefined && v.choferId !== where.choferId) return false;
    const estado = where.estadoViaje?.descripcion;
    if (estado !== undefined && v.estado !== estado) return false;
    return true;
  }

  const usuarioDe = (personaId) => db.usuarios.find((u) => u.personaId === personaId) ?? null;

  function conIncludeUsuario(u, include) {
    if (!u) return null;
    const res = { ...u };
    if (include?.estadoUsuario) res.estadoUsuario = estadoPorId(u.estadoUsuarioId);
    if (include?.persona) {
      const p = db.personas.find((x) => x.id === u.personaId);
      res.persona = { ...p };
      if (include.persona.include?.perfil) res.persona.perfil = perfilPorId(p.perfilId);
    }
    return res;
  }

  function conIncludePersona(p, include) {
    if (!p) return null;
    const res = { ...p };
    if (include?.perfil) res.perfil = perfilPorId(p.perfilId);
    if (include?.usuario) {
      const u = usuarioDe(p.id);
      res.usuario = u ? conIncludeUsuario(u, include.usuario.include ?? {}) : null;
    }
    return res;
  }

  // Lo que entiende de los `where` de persona: id (o id.not), activo,
  // habilitadoParaConducir, perfil.descripcion (o .not) y usuario.is.estadoUsuario.
  function cumplePersona(p, where = {}) {
    if (typeof where.id === 'number' && p.id !== where.id) return false;
    if (where.id?.not !== undefined && p.id === where.id.not) return false;
    if (where.activo !== undefined && p.activo !== where.activo) return false;
    if (where.habilitadoParaConducir !== undefined && p.habilitadoParaConducir !== where.habilitadoParaConducir) return false;
    const perfil = perfilPorId(p.perfilId).descripcion;
    const filtroPerfil = where.perfil?.descripcion;
    if (typeof filtroPerfil === 'string' && perfil !== filtroPerfil) return false;
    if (filtroPerfil?.not !== undefined && perfil === filtroPerfil.not) return false;
    if (where.usuario?.is === null && usuarioDe(p.id)) return false;
    const estadoPedido = where.usuario?.is?.estadoUsuario?.descripcion;
    if (estadoPedido) {
      const u = usuarioDe(p.id);
      if (!u || estadoPorId(u.estadoUsuarioId).descripcion !== estadoPedido) return false;
    }
    return true;
  }

  function cumpleUsuario(u, where = {}) {
    const filtroPerfil = where.persona?.perfil?.descripcion;
    if (filtroPerfil?.not !== undefined) {
      const p = db.personas.find((x) => x.id === u.personaId);
      if (perfilPorId(p.perfilId).descripcion === filtroPerfil.not) return false;
    }
    return true;
  }

  const prisma = {
    perfil: {
      findUnique: async ({ where }) => PERFILES.find((p) => p.descripcion === where.descripcion || p.id === where.id) ?? null,
    },
    estadoUsuario: {
      findUnique: async ({ where }) => ESTADOS_USUARIO.find((e) => e.descripcion === where.descripcion) ?? null,
    },
    persona: {
      findUnique: async ({ where, include }) => conIncludePersona(db.personas.find((p) => p.id === where.id), include),
      findMany: async ({ where, include, select } = {}) =>
        db.personas
          .filter((p) => cumplePersona(p, where))
          .map((p) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, p[k]])) : conIncludePersona(p, include))),
      count: async ({ where } = {}) => db.personas.filter((p) => cumplePersona(p, where)).length,
      create: async ({ data, include }) => {
        if (data.dni && db.personas.some((p) => p.dni === data.dni)) throw errorUnico('dni');
        const fila = { id: db.siguienteId++, activo: true, fechaBaja: null, creadoEn: new Date(), email: null, telefono: null, ...data };
        db.personas.push(fila);
        return conIncludePersona(fila, include);
      },
      update: async ({ where, data, include }) => {
        const p = db.personas.find((x) => x.id === where.id);
        if (!p) throw new Error('Record not found');
        if (data.dni && db.personas.some((x) => x.id !== p.id && x.dni === data.dni)) throw errorUnico('dni');
        for (const [clave, valor] of Object.entries(data)) if (valor !== undefined) p[clave] = valor;
        return conIncludePersona(p, include);
      },
    },
    usuario: {
      findUnique: async ({ where, include }) => {
        const u = db.usuarios.find(
          (x) => (where.id !== undefined && x.id === where.id) || (where.nombreUsuario !== undefined && x.nombreUsuario === where.nombreUsuario)
        );
        return conIncludeUsuario(u, include);
      },
      findMany: async ({ where, include } = {}) =>
        db.usuarios.filter((u) => cumpleUsuario(u, where)).map((u) => conIncludeUsuario(u, include)),
      create: async ({ data, include }) => {
        if (db.usuarios.some((u) => u.nombreUsuario === data.nombreUsuario)) throw errorUnico('nombre_usuario');
        if (db.usuarios.some((u) => u.personaId === data.personaId)) throw errorUnico('persona_id');
        const fila = { id: db.siguienteId++, creadoEn: new Date(), ...data };
        db.usuarios.push(fila);
        return conIncludeUsuario(fila, include);
      },
      update: async ({ where, data, include }) => {
        const u = db.usuarios.find((x) => x.id === where.id);
        if (!u) throw new Error('Record not found');
        if (data.nombreUsuario && db.usuarios.some((x) => x.id !== u.id && x.nombreUsuario === data.nombreUsuario)) {
          throw errorUnico('nombre_usuario');
        }
        for (const [clave, valor] of Object.entries(data)) if (valor !== undefined) u[clave] = valor;
        return conIncludeUsuario(u, include);
      },
      updateMany: async ({ where, data }) => {
        const filas = db.usuarios.filter((u) => u.personaId === where.personaId);
        for (const u of filas) Object.assign(u, data);
        return { count: filas.length };
      },
    },
    // personaService pregunta si la persona maneja un viaje En viaje y cuáles
    // Programados tiene a su nombre (con el select de liberarComoChofer).
    viaje: {
      findFirst: async ({ where }) => db.viajes.find((v) => cumpleViaje(v, where)) ?? null,
      findMany: async ({ where }) =>
        db.viajes
          .filter((v) => cumpleViaje(v, where))
          .sort((a, b) => a.fechaInicio - b.fechaInicio || a.id - b.id)
          .map((v) => ({
            id: v.id,
            fechaInicio: v.fechaInicio,
            origen: v.origen ? { nombre: v.origen } : null,
            destino: v.destino ? { nombre: v.destino } : null,
          })),
    },
    // Las candidaturas de una persona en los viajes en el estado pedido.
    viajeChoferCandidato: {
      deleteMany: async ({ where }) => {
        const estado = where.viaje?.estadoViaje?.descripcion;
        const borra = (c) =>
          c.personaId === where.personaId &&
          (estado === undefined || db.viajes.find((v) => v.id === c.viajeId)?.estado === estado);
        const quedan = db.candidatos.filter((c) => !borra(c));
        const count = db.candidatos.length - quedan.length;
        db.candidatos.splice(0, db.candidatos.length, ...quedan);
        return { count };
      },
    },
    $executeRaw: async (partes, ...valores) => {
      db.locks.push({ sql: partes.join('?'), valores });
      return 1;
    },
    // Rollback real: si la función tira, personas, cuentas y candidaturas
    // vuelven a como estaban.
    $transaction: async (fn) => {
      const copia = {
        personas: db.personas.map((p) => ({ ...p })),
        usuarios: db.usuarios.map((u) => ({ ...u })),
        candidatos: db.candidatos.map((c) => ({ ...c })),
      };
      try {
        return await fn(prisma);
      } catch (err) {
        db.personas.splice(0, db.personas.length, ...copia.personas);
        db.usuarios.splice(0, db.usuarios.length, ...copia.usuarios);
        db.candidatos.splice(0, db.candidatos.length, ...copia.candidatos);
        throw err;
      }
    },
  };

  return { prisma, db, sembrar, perfilPorId, estadoPorId };
}

module.exports = { crearCuentas };
