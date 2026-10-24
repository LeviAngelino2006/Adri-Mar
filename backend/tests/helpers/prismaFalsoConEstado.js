// Doble de Prisma CON ESTADO para los tests de viajes: tablas en memoria
// (usuarios, vehículos, ubicaciones, viajes, sus candidatos y sus paradas, tipos
// de documento y documentos, y mantenimiento) y un $transaction con rollback
// real — lo que no se confirma, se deshace. Lo comparten
// viajesCandidatos.test.js, viajesParadas.test.js, documentos.test.js y
// mantenimiento.test.js.
//
// Se usa así (el reemplazo del módulo tiene que ir ANTES de cargar la app):
//
//   const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');
//   const { prisma, db, sembrar, agregarViaje } = crearEntorno();
//   instalarEnCache(SRC, prisma);
//   const app = require(path.join(SRC, 'app.js'));
//
// Los arrays de `db` (viajes, candChofer, …) se mutan SIEMPRE en el lugar, aun en
// el rollback y en sembrar(): quien los desestructura una vez sigue viendo el
// estado vigente. NO toca la base ni lee el .env.

const path = require('node:path');

const ESTADOS = { A_CONFIRMAR: 1, PROGRAMADO: 2, EN_VIAJE: 3, FINALIZADO: 4, CANCELADO: 5 };
const nombreEstado = (id) => Object.keys(ESTADOS).find((k) => ESTADOS[k] === id);

// 2026-10-20 a las HH:mm, hora de Córdoba (UTC-3).
const cba = (hhmm, dia = '2026-10-20') => new Date(`${dia}T${hhmm}:00-03:00`);

const idsDe = (lista, campo, viajeId) => lista.filter((c) => c.viajeId === viajeId).map((c) => c[campo]);

const existe = (ids) => async ({ where: { id } }) => (ids.includes(id) ? { id } : null);

// Reemplaza el contenido de un array sin cambiar su identidad.
function reemplazar(array, nuevoContenido) {
  array.splice(0, array.length, ...nuevoContenido);
}

function aplicarCambios(fila, data) {
  for (const [clave, valor] of Object.entries(data)) {
    if (valor !== undefined) fila[clave] = valor;
  }
}

function coincideFiltroEstado(fila, filtro) {
  if (!filtro) return true;
  const descripcion = nombreEstado(fila.estadoViajeId);
  if (filtro.equals !== undefined && descripcion !== filtro.equals) return false;
  if (filtro.not !== undefined && descripcion === filtro.not) return false;
  return true;
}

function crearEntorno() {
  const db = {
    personas: [],
    usuarios: [],
    vehiculos: [],
    ubicaciones: [],
    viajes: [],
    candChofer: [],
    candVeh: [],
    // Filas de viaje_paradas: { viajeId, ubicacionId, orden }.
    paradas: [],
    // Mantenimiento: plantillas (una por tipo de vehículo), planes, registros
    // (services y arreglos), catálogo de tipos de arreglo y lecturas de
    // odómetro (solo las que crea o lee crearLectura dentro de la transacción).
    plantillasMantenimiento: [],
    planesMantenimiento: [],
    mantenimientosRealizados: [],
    // Tabla intermedia registro ↔ tipo de arreglo ({ mantenimientoId, tipoArregloId }).
    mantenimientosTiposArreglo: [],
    tiposArreglo: [],
    lecturas: [],
    // Orígenes de lectura sembrados (id → descripción).
    origenes: { 1: 'ALTA_VEHICULO', 2: 'INICIO_VIAJE', 3: 'FIN_VIAJE', 4: 'MANUAL', 5: 'CORRECCION', 6: 'MANTENIMIENTO' },
    // Catálogo de tipos de documento (con su categoría) y filas de `documentos`.
    tiposDocumento: [],
    documentos: [],
    // Reloj del doble: cada documento creado por el servicio se "crea" un
    // segundo después que el anterior, para que "el más reciente" sea determinista.
    relojDocumentos: Date.parse('2026-01-01T00:00:00Z'),
    siguienteId: 100,
    // Hooks para provocar situaciones puntuales desde cada test.
    fallos: {},
    alLeerUsuario: null,
    // Borrados de candidatos que se llegaron a EJECUTAR (aunque después un
    // rollback los deshaga): permite verificar que no se intentaron.
    borrados: [],
  };

  function sembrar() {
    const personasIniciales = [
      { id: 5, nombre: 'Ana', apellido: 'Pérez', dni: '30111225', email: 'ana@adrimar.com', telefono: '03571 15-612345', perfilId: 4, habilitadoParaConducir: true, activo: true },
      { id: 6, nombre: 'Beto', apellido: 'Gómez', dni: '30111226', email: 'beto@adrimar.com', telefono: null, perfilId: 4, habilitadoParaConducir: true, activo: true },
      { id: 7, nombre: 'Carla', apellido: 'Ruiz', dni: '30111227', email: 'carla@adrimar.com', telefono: null, perfilId: 2, habilitadoParaConducir: false, activo: true },
      { id: 8, nombre: 'Dani', apellido: 'Soto', dni: '30111228', email: 'dani@adrimar.com', telefono: null, perfilId: 4, habilitadoParaConducir: true, activo: false, fechaBaja: new Date('2026-01-01') },
      { id: 10, nombre: 'Chofer', apellido: 'Token', dni: '30111230', email: 'chofer@adrimar.com', telefono: null, perfilId: 4, habilitadoParaConducir: true, activo: true },
    ].map((p) => ({
      ...p,
      perfil: { id: p.perfilId, descripcion: p.perfilId === 4 ? 'CHOFER' : 'ENCARGADO', nombre: p.perfilId === 4 ? 'CHOFER' : 'ENCARGADO' },
      fechaBaja: p.fechaBaja ?? null,
      creadoEn: new Date('2026-01-01T00:00:00Z'),
      actualizadoEn: new Date('2026-01-01T00:00:00Z'),
    }));
    reemplazar(db.personas, personasIniciales);

    const usuario = (id, nombre, apellido, { habilitado = true, estado = 'ACTIVO', telefono = null } = {}) => {
      const p = db.personas.find((pers) => pers.id === id);
      return {
        id,
        personaId: id,
        nombreUsuario: `${nombre.toLowerCase()}${id}`,
        nombre,
        apellido,
        telefono,
        habilitadoParaConducir: habilitado,
        estadoUsuario: { id: estado === 'ACTIVO' ? 1 : 2, descripcion: estado },
        persona: p,
      };
    };
    reemplazar(db.usuarios, [
      usuario(5, 'Ana', 'Pérez', { telefono: '03571 15-612345' }),
      usuario(6, 'Beto', 'Gómez'),
      usuario(7, 'Carla', 'Ruiz', { habilitado: false }),
      usuario(8, 'Dani', 'Soto', { estado: 'INACTIVO' }),
      usuario(10, 'Chofer', 'Token'),
    ]);

    const vehiculo = (id, numeroInterno, dominio, estado = 'OPERATIVO', tipoVehiculoId = 1) => ({
      id,
      numeroInterno,
      dominio,
      modeloId: 1,
      modelo: { id: 1, nombre: 'O500', marcaId: 1, marca: { id: 1, nombre: 'Mercedes' } },
      kilometraje: 1000,
      estadoVehiculo: { descripcion: estado },
      tipoVehiculoId,
      tipoVehiculo: {
        id: tipoVehiculoId,
        descripcion: tipoVehiculoId === 1 ? 'Colectivo' : tipoVehiculoId === 2 ? 'Minibus' : tipoVehiculoId === 3 ? 'Trafic' : 'Utilitario',
        orden: tipoVehiculoId
      },
    });
    reemplazar(db.vehiculos, [
      vehiculo(7, '12', 'AE452KD'),
      vehiculo(8, '13', 'AE453KD', 'EN_TALLER'),
      vehiculo(9, '14', 'AE454KD'),
      vehiculo(10, '15', 'AE455KD', 'DADO_DE_BAJA'),
    ]);

    reemplazar(db.ubicaciones, [
      { id: 1, nombre: 'Río Tercero' },
      { id: 2, nombre: 'Córdoba' },
      // Localidad de Georef (con coordenadas) y lugar elegido en Google (con
      // placeId): así se ve qué viaja de cada punto.
      { id: 3, nombre: 'Alta Gracia', latitud: -31.6498, longitud: -64.4299 },
      { id: 4, nombre: 'Museo del Kempes', placeId: 'ChIJ_museo_kempes' },
      { id: 5, nombre: 'Villa del Dique' },
    ]);

    const tipo = (id, descripcion, categoria, requiereVencimiento, requiereArchivo, diasAviso = 30) => ({
      id,
      descripcion,
      categoriaDocumento: { id: categoria === 'VEHICULO' ? 1 : 2, descripcion: categoria },
      requiereVencimiento,
      requiereArchivo,
      diasAviso,
    });
    reemplazar(db.tiposDocumento, [
      tipo(1, 'POLIZA_SEGURO', 'VEHICULO', true, true),
      tipo(2, 'MATAFUEGOS', 'VEHICULO', true, false),
      tipo(3, 'TITULO_VEHICULO', 'VEHICULO', false, true),
      tipo(4, 'LICENCIA_CONDUCIR', 'CHOFER', true, true),
      tipo(5, 'DNI_CHOFER', 'CHOFER', true, true),
      tipo(6, 'PAGO_SEGURO', 'VEHICULO', true, true, 5),
      tipo(7, 'ITV', 'VEHICULO', true, true),
    ]);
    reemplazar(db.documentos, []);
    const plantilla = (id, descripcion, intervaloKm) => ({
      id,
      nombre: `Service ${descripcion}`,
      tipoVehiculoId: id,
      intervaloKm,
      porcentajeAviso: 95,
    });
    reemplazar(db.plantillasMantenimiento, [
      plantilla(1, 'Colectivo', 20000),
      plantilla(2, 'Minibus', 20000),
      plantilla(3, 'Trafic', 15000),
      plantilla(4, 'Utilitario', 10000),
    ]);
    reemplazar(db.planesMantenimiento, []);
    reemplazar(db.mantenimientosRealizados, []);
    reemplazar(db.mantenimientosTiposArreglo, []);
    const tipoArreglo = (id, nombre, { requiereDetalle = false, activo = true } = {}) => ({
      id,
      nombre,
      descripcion: `Descripción de ${nombre}`,
      requiereDetalle,
      orden: id,
      activo,
    });
    // Desordenados a propósito: el service tiene que ordenarlos por `orden`.
    reemplazar(db.tiposArreglo, [
      tipoArreglo(3, 'Cambio de cubiertas'),
      tipoArreglo(1, 'Engrase'),
      tipoArreglo(4, 'Frenos'),
      tipoArreglo(8, 'Otro', { requiereDetalle: true }),
      tipoArreglo(9, 'Tapicería', { activo: false }),
    ]);
    reemplazar(db.lecturas, []);
    db.relojDocumentos = Date.parse('2026-01-01T00:00:00Z');

    reemplazar(db.viajes, []);
    reemplazar(db.paradas, []);
    reemplazar(db.candChofer, []);
    reemplazar(db.candVeh, []);
    reemplazar(db.borrados, []);
    for (const clave of Object.keys(db.fallos)) delete db.fallos[clave];
    db.siguienteId = 100;
    db.alLeerUsuario = null;
  }

  function agregarViaje(sobrescribir = {}) {
    const {
      estado = 'A_CONFIRMAR',
      choferesCandidatos = [],
      vehiculosCandidatos = [],
      paradas = [],
      ...resto
    } = sobrescribir;
    const fila = {
      id: db.siguienteId++,
      estadoViajeId: ESTADOS[estado],
      choferId: null,
      vehiculoId: null,
      fechaInicio: cba('08:00'),
      fechaFin: cba('12:00'),
      kilometrosEstimados: 100,
      cantidadPasajeros: null,
      clienteId: 1,
      origenId: 1,
      destinoId: 2,
      ...resto,
    };
    db.viajes.push(fila);
    for (const candidato of choferesCandidatos) {
      const candId = typeof candidato === 'object' ? (candidato.personaId ?? candidato.usuarioId) : candidato;
      db.candChofer.push({ viajeId: fila.id, personaId: candId, usuarioId: candId });
    }
    for (const vehiculoId of vehiculosCandidatos) db.candVeh.push({ viajeId: fila.id, vehiculoId });
    paradas.forEach((ubicacionId, indice) => db.paradas.push({ viajeId: fila.id, ubicacionId, orden: indice + 1 }));
    return fila;
  }

  // La fila de la tabla con todas las relaciones que lee serializarViaje.
  function armar(fila) {
    return {
      precio: null,
      pagoChofer: null,
      estadoPagoClienteId: null,
      fechaPagoCliente: null,
      metodoPagoClienteId: null,
      estadoPagoChoferId: null,
      fechaPagoChofer: null,
      metodoPagoChoferId: null,
      horaInicioReal: null,
      horaFinReal: null,
      observacionFinal: null,
      creadoEn: new Date('2026-01-01T00:00:00Z'),
      ...fila,
      estadoViaje: { descripcion: nombreEstado(fila.estadoViajeId) },
      chofer: db.personas.find((p) => p.id === fila.choferId) ?? db.usuarios.find((u) => u.id === fila.choferId) ?? null,
      vehiculo: db.vehiculos.find((v) => v.id === fila.vehiculoId) ?? null,
      origen: null,
      destino: null,
      cliente: null,
      estadoPagoCliente: null,
      metodoPagoCliente: null,
      estadoPagoChofer: null,
      metodoPagoChofer: null,
      // Ordenadas por `orden`, como el include real (orderBy orden asc).
      paradas: db.paradas
        .filter((p) => p.viajeId === fila.id)
        .sort((a, b) => a.orden - b.orden)
        .map((p) => ({ ...p, ubicacion: db.ubicaciones.find((u) => u.id === p.ubicacionId) })),
      choferesCandidatos: db.candChofer
        .filter((c) => c.viajeId === fila.id)
        .map((c) => {
          const id = c.personaId ?? c.usuarioId;
          const persona = db.personas.find((p) => p.id === id) ?? db.usuarios.find((u) => u.id === id);
          return {
            ...c,
            personaId: id,
            usuarioId: id,
            persona,
            usuario: db.usuarios.find((u) => u.id === id) ?? persona,
          };
        }),
      vehiculosCandidatos: db.candVeh
        .filter((c) => c.viajeId === fila.id)
        .map((c) => ({ ...c, vehiculo: db.vehiculos.find((v) => v.id === c.vehiculoId) })),
    };
  }

  const filaPorId = (id) => db.viajes.find((v) => v.id === id);

  // --- Documentos -----------------------------------------------------------
  // Soporta solo los filtros que usa documentoService; un filtro desconocido
  // revienta en vez de ignorarse, para que el doble no oculte consultas mal armadas.
  function coincideFiltroDocumento(fila, where = {}) {
    return Object.entries(where).every(([clave, filtro]) => {
      if (['id', 'vehiculoId', 'choferId', 'tipoDocumentoId', 'archivoPath'].includes(clave)) {
        if (filtro !== null && typeof filtro === 'object') {
          if (filtro.in) return filtro.in.includes(fila[clave]);
          if (filtro.notIn) return !filtro.notIn.includes(fila[clave]);
          if ('not' in filtro) return fila[clave] !== filtro.not;
          throw new Error(`filtro no soportado por el doble en documentos.${clave}`);
        }
        return fila[clave] === filtro;
      }
      if (clave === 'vehiculo') {
        const vehiculo = db.vehiculos.find((v) => v.id === fila.vehiculoId);
        const { not } = filtro.estadoVehiculo.descripcion;
        return Boolean(vehiculo) && vehiculo.estadoVehiculo.descripcion !== not;
      }
      if (clave === 'chofer') {
        const chofer = db.personas.find((p) => p.id === fila.choferId) ?? db.usuarios.find((u) => u.id === fila.choferId);
        if (!chofer) return false;
        if (filtro.activo !== undefined && chofer.activo !== filtro.activo) return false;
        if (filtro.estadoUsuario && chofer.estadoUsuario?.descripcion !== filtro.estadoUsuario.descripcion) return false;
        return true;
      }
      throw new Error(`filtro no soportado por el doble: documentos.${clave}`);
    });
  }

  function ordenarDocumentos(filas, orderBy = []) {
    const criterios = [].concat(orderBy).flatMap((o) => Object.entries(o));
    return [...filas].sort((a, b) => {
      for (const [campo, sentido] of criterios) {
        const x = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
        const y = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
        if (x !== y) return (x < y ? -1 : 1) * (sentido === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }

  function armarDocumento(fila, include) {
    const resultado = { ...fila };
    if (include?.tipoDocumento) {
      resultado.tipoDocumento = db.tiposDocumento.find((t) => t.id === fila.tipoDocumentoId);
    }
    if (include?.usuario) {
      const u = db.usuarios.find((x) => x.id === fila.usuarioId);
      resultado.usuario = u ? { id: u.id, nombre: u.nombre, apellido: u.apellido } : null;
    }
    if (include?.vehiculo) resultado.vehiculo = db.vehiculos.find((v) => v.id === fila.vehiculoId) ?? null;
    if (include?.chofer) resultado.chofer = db.personas.find((p) => p.id === fila.choferId) ?? db.usuarios.find((u) => u.id === fila.choferId) ?? null;
    return resultado;
  }

  const modeloDocumento = {
    findMany: async ({ where, orderBy, distinct, include } = {}) => {
      let filas = ordenarDocumentos(db.documentos.filter((d) => coincideFiltroDocumento(d, where)), orderBy);
      if (distinct) {
        // Como la base: queda la primera fila de cada combinación según orderBy.
        const vistos = new Set();
        filas = filas.filter((d) => {
          const clave = distinct.map((c) => d[c]).join('|');
          if (vistos.has(clave)) return false;
          vistos.add(clave);
          return true;
        });
      }
      return filas.map((d) => armarDocumento(d, include));
    },
    findFirst: async ({ where, orderBy, include } = {}) => {
      const [primera] = ordenarDocumentos(db.documentos.filter((d) => coincideFiltroDocumento(d, where)), orderBy);
      return primera ? armarDocumento(primera, include) : null;
    },
    findUnique: async ({ where: { id } }) => db.documentos.find((d) => d.id === id) ?? null,
    count: async ({ where } = {}) => db.documentos.filter((d) => coincideFiltroDocumento(d, where)).length,
    create: async ({ data, include }) => {
      if (db.fallos.createDocumento) throw new Error('falla simulada en el create del documento');
      db.relojDocumentos += 1000;
      const fila = {
        id: db.siguienteId++,
        vehiculoId: null,
        choferId: null,
        archivoPath: null,
        nombreArchivo: null,
        fechaEmision: null,
        fechaVencimiento: null,
        observaciones: null,
        creadoEn: new Date(db.relojDocumentos),
        ...data,
      };
      db.documentos.push(fila);
      return armarDocumento(fila, include);
    },
    delete: async ({ where: { id } }) => {
      const indice = db.documentos.findIndex((d) => d.id === id);
      if (indice === -1) throw new Error('Record to delete does not exist');
      return db.documentos.splice(indice, 1)[0];
    },
    deleteMany: async ({ where }) => {
      if (db.fallos.deleteManyDocumentos) throw new Error('falla simulada en el deleteMany de documentos');
      const borrar = db.documentos.filter((d) => coincideFiltroDocumento(d, where));
      reemplazar(db.documentos, db.documentos.filter((d) => !borrar.includes(d)));
      return { count: borrar.length };
    },
  };

  // include: { documentos: { distinct, orderBy } } de vehiculo/usuario/persona.
  function documentosDe(campo, id, relacion) {
    return modeloDocumento.findMany({
      where: { [campo]: id },
      orderBy: relacion.orderBy,
      distinct: relacion.distinct,
      include: { tipoDocumento: Boolean(relacion.select?.tipoDocumento) },
    });
  }

  const modeloTipoDocumento = {
    findUnique: async ({ where: { id } }) => db.tiposDocumento.find((t) => t.id === id) ?? null,
    findMany: async ({ where }) =>
      db.tiposDocumento
        .filter((t) => t.categoriaDocumento.descripcion === where.categoriaDocumento.descripcion)
        .sort((a, b) => a.id - b.id),
    count: async ({ where }) =>
      db.tiposDocumento.filter((t) => t.categoriaDocumento.descripcion === where.categoriaDocumento.descripcion).length,
  };

  // --- Mantenimiento ----------------------------------------------------------
  const plantillaDeTipo = (tipoVehiculoId) => db.plantillasMantenimiento.find((p) => p.tipoVehiculoId === tipoVehiculoId) ?? null;

  function armarPlan(p) {
    if (!p) return null;
    const plantilla = db.plantillasMantenimiento.find((pl) => pl.id === p.plantillaMantenimientoId);
    return { ...p, plantillaMantenimiento: plantilla ? { ...plantilla } : null };
  }

  // El vehículo con lo que pide INCLUDE_VEHICULO de mantenimientoService: la
  // plantilla de su tipo y su plan (con su plantilla).
  function armarVehiculoMantenimiento(v) {
    return {
      ...v,
      tipoVehiculo: { ...v.tipoVehiculo, plantilla: plantillaDeTipo(v.tipoVehiculoId) },
      planMantenimiento: armarPlan(db.planesMantenimiento.find((p) => p.vehiculoId === v.id)),
    };
  }

  const modeloPlanMantenimiento = {
    create: async ({ data }) => {
      if (db.planesMantenimiento.some((p) => p.vehiculoId === data.vehiculoId)) {
        throw new Error('Unique constraint failed on (vehiculo_id)');
      }
      const fila = { id: db.siguienteId++, activo: true, ...data, creadoEn: new Date(), actualizadoEn: new Date() };
      db.planesMantenimiento.push(fila);
      return armarPlan(fila);
    },
    update: async ({ where: { id }, data }) => {
      const p = db.planesMantenimiento.find((x) => x.id === id);
      if (!p) throw new Error('Record to update not found');
      Object.assign(p, data, { actualizadoEn: new Date() });
      return armarPlan(p);
    },
  };

  const contieneSinMayusculas = (texto, filtro) => String(texto).toLowerCase().includes(filtro.contains.toLowerCase());

  function coincideVehiculoMantenimiento(v, filtro) {
    return Object.entries(filtro).every(([clave, valor]) => {
      if (clave === 'tipoVehiculoId') return v.tipoVehiculoId === valor;
      if (clave === 'OR') {
        return valor.some((opcion) => {
          if (opcion.numeroInterno) return contieneSinMayusculas(v.numeroInterno, opcion.numeroInterno);
          if (opcion.dominio) return contieneSinMayusculas(v.dominio, opcion.dominio);
          if (opcion.modelo?.nombre) return contieneSinMayusculas(v.modelo.nombre, opcion.modelo.nombre);
          if (opcion.modelo?.marca) return contieneSinMayusculas(v.modelo.marca.nombre, opcion.modelo.marca.nombre);
          throw new Error(`filtro OR no soportado por el doble: ${JSON.stringify(opcion)}`);
        });
      }
      throw new Error(`filtro no soportado por el doble: mantenimientos.vehiculo.${clave}`);
    });
  }

  // Soporta solo los filtros que arma mantenimientoService; uno desconocido revienta.
  function coincideRegistro(fila, where = {}) {
    return Object.entries(where).every(([clave, filtro]) => {
      if (['vehiculoId', 'esServicePreventivo'].includes(clave)) return fila[clave] === filtro;
      if (clave === 'id') return filtro.in.includes(fila.id);
      if (clave === 'tiposArreglo') {
        return db.mantenimientosTiposArreglo.some(
          (t) => t.mantenimientoId === fila.id && t.tipoArregloId === filtro.some.tipoArregloId
        );
      }
      if (clave === 'fecha') {
        const t = fila.fecha.getTime();
        return (!filtro.gte || t >= filtro.gte.getTime()) && (!filtro.lt || t < filtro.lt.getTime());
      }
      if (clave === 'vehiculo') {
        return coincideVehiculoMantenimiento(db.vehiculos.find((v) => v.id === fila.vehiculoId), filtro);
      }
      throw new Error(`filtro no soportado por el doble: mantenimientos.${clave}`);
    });
  }

  function armarRegistro(fila) {
    const usuario = db.usuarios.find((u) => u.id === fila.usuarioId);
    // Como el include real: filas de la tabla intermedia con su tipo, por orden del catálogo.
    const tiposArreglo = db.mantenimientosTiposArreglo
      .filter((t) => t.mantenimientoId === fila.id)
      .map((t) => ({ ...t, tipoArreglo: db.tiposArreglo.find((x) => x.id === t.tipoArregloId) }))
      .sort((a, b) => a.tipoArreglo.orden - b.tipoArreglo.orden);
    return {
      ...fila,
      tiposArreglo,
      // Como el select real: nombre y apellido viven en Persona (Usuario ya no los tiene).
      usuario: usuario ? { persona: { nombre: usuario.persona.nombre, apellido: usuario.persona.apellido } } : null,
      vehiculo: { ...db.vehiculos.find((v) => v.id === fila.vehiculoId) },
    };
  }

  const modeloMantenimientoRealizado = {
    create: async ({ data }) => {
      if (db.fallos.createMantenimiento) throw new Error('falla simulada en el create del mantenimiento');
      // La base no lo impide (lo valida el servicio), pero un service con tipos
      // o un arreglo sin tipos es un bug: el doble revienta.
      const { tiposArreglo, ...columnas } = data;
      const tipos = tiposArreglo?.create ?? [];
      if (columnas.esServicePreventivo === tipos.length > 0) {
        throw new Error('un service no lleva tipos de arreglo y un arreglo lleva al menos uno');
      }
      // PK compuesta (mantenimiento_id, tipo_arreglo_id).
      if (new Set(tipos.map((t) => t.tipoArregloId)).size !== tipos.length) {
        throw new Error('Unique constraint failed on the fields: (`mantenimiento_id`,`tipo_arreglo_id`)');
      }
      const fila = {
        id: db.siguienteId++,
        planMantenimientoId: null,
        descripcion: null,
        repuestos: null,
        tallerMecanico: null,
        costo: null,
        observaciones: null,
        ...columnas,
        creadoEn: new Date(),
      };
      db.mantenimientosRealizados.push(fila);
      for (const { tipoArregloId, detalle } of tipos) {
        db.mantenimientosTiposArreglo.push({ mantenimientoId: fila.id, tipoArregloId, detalle: detalle ?? null });
      }
      return armarRegistro(fila);
    },
    count: async ({ where } = {}) => db.mantenimientosRealizados.filter((m) => coincideRegistro(m, where)).length,
    findMany: async ({ where, orderBy = [], skip = 0, take } = {}) => {
      const filas = db.mantenimientosRealizados.filter((m) => coincideRegistro(m, where));
      const criterios = [].concat(orderBy).flatMap((o) => Object.entries(o));
      filas.sort((a, b) => {
        for (const [campo, sentido] of criterios) {
          const x = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
          const y = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
          if (x !== y) return (x < y ? -1 : 1) * (sentido === 'desc' ? -1 : 1);
        }
        return 0;
      });
      return filas.slice(skip, take === undefined ? undefined : skip + take).map(armarRegistro);
    },
  };

  const modeloTipoArreglo = {
    // Dos formas: el catálogo (activos por orden) o los tipos elegidos (id in, activos o no).
    findMany: async ({ where, orderBy }) => {
      if (where?.id?.in) return db.tiposArreglo.filter((t) => where.id.in.includes(t.id)).map((t) => ({ ...t }));
      if (!where?.activo || orderBy?.orden !== 'asc') throw new Error('el doble espera where activo + orderBy orden asc');
      return db.tiposArreglo
        .filter((t) => t.activo)
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ ...t }));
    },
    findUnique: async ({ where: { id } }) => db.tiposArreglo.find((t) => t.id === id) ?? null,
  };

  // Lo que usa crearLectura dentro de la transacción: lock de la fila del
  // vehículo, última lectura, origen, alta de la lectura y caché de km.
  const modelosLecturaTx = {
    $queryRaw: async (_partes, vehiculoId) => (db.vehiculos.some((v) => v.id === vehiculoId) ? [{ id: vehiculoId }] : []),
    lecturaOdometro: {
      findFirst: async ({ where: { vehiculoId } }) =>
        db.lecturas.filter((l) => l.vehiculoId === vehiculoId).sort((a, b) => b.fechaHora - a.fechaHora)[0] ?? null,
      create: async ({ data }) => {
        const fila = { id: db.siguienteId++, lecturaCorregidaId: null, motivo: null, creadoEn: new Date(), ...data };
        db.lecturas.push(fila);
        return { ...fila, origen: { id: data.origenId, descripcion: db.origenes[data.origenId] } };
      },
    },
    origenLectura: {
      findUnique: async ({ where: { descripcion } }) => {
        const id = Number(Object.keys(db.origenes).find((k) => db.origenes[k] === descripcion));
        return id ? { id, descripcion } : null;
      },
    },
  };

  // Los modelos de candidatos y updateMany solo existen DENTRO de la transacción
  // (tx): si alguna ruta los usara por fuera de $transaction, el test revienta.
  const modelosTx = {
    planMantenimiento: modeloPlanMantenimiento,
    mantenimientoRealizado: modeloMantenimientoRealizado,
    ...modelosLecturaTx,
    vehiculo: {
      update: async ({ where: { id }, data }) => {
        const v = db.vehiculos.find((x) => x.id === id);
        if (v) Object.assign(v, data);
        return v ? { ...v } : null;
      },
    },
    documento: modeloDocumento,
    // @@unique([viajeId, orden]) como en la base: createMany falla si una fila
    // choca con otra. Por eso reordenar solo funciona si el deleteMany va ANTES.
    viajeParada: {
      deleteMany: async ({ where: { viajeId } }) => {
        reemplazar(db.paradas, db.paradas.filter((p) => p.viajeId !== viajeId));
        return {};
      },
      createMany: async ({ data }) => {
        if (db.fallos.createManyParadas) throw new Error('falla simulada en createMany de paradas');
        for (const fila of data) {
          if (db.paradas.some((p) => p.viajeId === fila.viajeId && p.orden === fila.orden)) {
            throw new Error('Unique constraint failed on (viaje_id, orden)');
          }
          db.paradas.push({ ...fila });
        }
        return {};
      },
    },
    viaje: {
      updateMany: async ({ where, data }) => {
        const coinciden = db.viajes.filter((v) => v.id === where.id && v.estadoViajeId === where.estadoViajeId);
        coinciden.forEach((fila) => aplicarCambios(fila, data));
        return { count: coinciden.length };
      },
      findUnique: async ({ where: { id } }) => {
        const fila = filaPorId(id);
        return fila ? armar(fila) : null;
      },
      update: async ({ where: { id }, data }) => {
        if (db.fallos.updateViaje) throw new Error('falla simulada en el update del viaje');
        const fila = filaPorId(id);
        aplicarCambios(fila, data);
        return armar(fila);
      },
    },
    viajeChoferCandidato: {
      deleteMany: async ({ where: { viajeId } }) => {
        db.borrados.push(`choferes:${viajeId}`);
        reemplazar(db.candChofer, db.candChofer.filter((c) => c.viajeId !== viajeId));
        return {};
      },
      createMany: async ({ data }) => {
        if (db.fallos.createManyChofer) throw new Error('falla simulada en createMany de choferes');
        for (const c of data) {
          const id = c.personaId ?? c.usuarioId;
          db.candChofer.push({ viajeId: c.viajeId, personaId: id, usuarioId: id });
        }
        return {};
      },
    },
    viajeVehiculoCandidato: {
      deleteMany: async ({ where: { viajeId } }) => {
        db.borrados.push(`vehiculos:${viajeId}`);
        if (db.fallos.deleteManyVehiculo) throw new Error('falla simulada en deleteMany de vehículos');
        reemplazar(db.candVeh, db.candVeh.filter((c) => c.viajeId !== viajeId));
        return {};
      },
      createMany: async ({ data }) => {
        db.candVeh.push(...data);
        return {};
      },
    },
  };

  const prisma = {
    perfil: {
      findUnique: async ({ where }) => {
        const desc = where.descripcion || (where.id === 1 ? 'ADMINISTRADOR' : where.id === 2 ? 'ENCARGADO' : where.id === 3 ? 'PERSONAL_TALLER' : 'CHOFER');
        const id = where.id || (desc === 'ADMINISTRADOR' ? 1 : desc === 'ENCARGADO' ? 2 : desc === 'PERSONAL_TALLER' ? 3 : 4);
        return { id, descripcion: desc, nombre: desc };
      },
      findMany: async () => [
        { id: 1, descripcion: 'ADMINISTRADOR', nombre: 'ADMINISTRADOR' },
        { id: 2, descripcion: 'ENCARGADO', nombre: 'ENCARGADO' },
        { id: 3, descripcion: 'PERSONAL_TALLER', nombre: 'PERSONAL_TALLER' },
        { id: 4, descripcion: 'CHOFER', nombre: 'CHOFER' },
      ],
    },
    persona: {
      findUnique: async ({ where, include }) => {
        if (db.alLeerUsuario) db.alLeerUsuario();
        const p = db.personas.find(
          (x) =>
            (where.id !== undefined && x.id === where.id) ||
            (where.dni && x.dni === where.dni) ||
            (where.email && x.email === where.email)
        );
        if (!p) return null;
        const res = { ...p };
        if (include?.usuario) {
          res.usuario = db.usuarios.find((u) => u.personaId === p.id) ?? null;
        }
        if (include?.perfil) {
          const u = db.usuarios.find((x) => x.personaId === p.id);
          res.perfil = u?.perfil ?? p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' };
        }
        return res;
      },
      findFirst: async ({ where }) => {
        return (
          db.personas.find((p) => {
            if (where.dni && p.dni !== where.dni) return false;
            if (where.email && p.email !== where.email) return false;
            if (where.id && p.id !== where.id) return false;
            return true;
          }) ?? null
        );
      },
      findMany: async ({ where = {}, include } = {}) => {
        let filtradas = [...db.personas];
        if (where.activo !== undefined) {
          filtradas = filtradas.filter((p) => p.activo === where.activo);
        }
        if (where.id?.in) {
          filtradas = filtradas.filter((p) => where.id.in.includes(p.id));
        }
        if (where.habilitadoParaConducir !== undefined) {
          filtradas = filtradas.filter((p) => p.habilitadoParaConducir === where.habilitadoParaConducir);
        }
        if (where.perfilId !== undefined) {
          filtradas = filtradas.filter((p) => p.perfilId === where.perfilId);
        }
        if (where.OR) {
          filtradas = filtradas.filter((p) => {
            return where.OR.some((cond) => {
              if (cond.habilitadoParaConducir !== undefined && p.habilitadoParaConducir === cond.habilitadoParaConducir) return true;
              if (cond.perfil?.nombre && (p.perfil?.nombre === cond.perfil.nombre || p.perfil?.descripcion === cond.perfil.nombre)) return true;
              if (cond.perfilId && p.perfilId === cond.perfilId) return true;
              return false;
            });
          });
        }
        return Promise.all(
          filtradas.map(async (p) => {
            const res = { ...p };
            if (include?.documentos) {
              res.documentos = await documentosDe('choferId', p.id, include.documentos);
            }
            if (include?.usuario) {
              res.usuario = db.usuarios.find((u) => u.personaId === p.id) ?? null;
            }
            if (include?.perfil) {
              res.perfil = p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' };
            }
            return res;
          })
        );
      },
      count: async ({ where = {} } = {}) => {
        const res = await prisma.persona.findMany({ where });
        return res.length;
      },
      create: async ({ data, include }) => {
        const id = db.siguienteId++;
        const p = {
          id,
          nombre: data.nombre,
          apellido: data.apellido,
          dni: data.dni,
          email: data.email ?? null,
          telefono: data.telefono ?? null,
          perfilId: data.perfilId,
          perfil: { id: data.perfilId, descripcion: data.perfilId === 1 ? 'ADMINISTRADOR' : 'CHOFER', nombre: data.perfilId === 1 ? 'ADMINISTRADOR' : 'CHOFER' },
          habilitadoParaConducir: data.habilitadoParaConducir ?? false,
          activo: true,
          fechaBaja: null,
          creadoEn: new Date(),
          actualizadoEn: new Date(),
        };
        db.personas.push(p);
        const res = { ...p };
        if (include?.perfil) res.perfil = p.perfil;
        return res;
      },
      update: async ({ where: { id }, data, include }) => {
        const p = db.personas.find((x) => x.id === id);
        if (!p) throw new Error('Record to update not found');
        aplicarCambios(p, data);
        const res = { ...p };
        if (include?.perfil) res.perfil = p.perfil;
        if (include?.usuario) res.usuario = db.usuarios.find((u) => u.personaId === p.id) ?? null;
        return res;
      },
    },
    cliente: { findUnique: existe([1]) },
    documento: modeloDocumento,
    tipoDocumento: modeloTipoDocumento,
    ubicacion: {
      findUnique: async ({ where: { id } }) => db.ubicaciones.find((u) => u.id === id) ?? null,
      findMany: async ({ where }) => db.ubicaciones.filter((u) => where.id.in.includes(u.id)),
    },
    estadoViaje: {
      findUnique: async ({ where: { descripcion } }) => ({ id: ESTADOS[descripcion], descripcion }),
    },
    lecturaOdometro: { findFirst: async () => null },
    planMantenimiento: modeloPlanMantenimiento,
    mantenimientoRealizado: modeloMantenimientoRealizado,
    tipoArreglo: modeloTipoArreglo,
    usuario: {
      findUnique: async ({ where, include }) => {
        if (db.alLeerUsuario) db.alLeerUsuario();
        const u = db.usuarios.find(
          (x) =>
            (where.id !== undefined && x.id === where.id) ||
            (where.nombreUsuario && x.nombreUsuario === where.nombreUsuario) ||
            (where.personaId && x.personaId === where.personaId)
        );
        if (!u) return null;
        const res = { ...u };
        if (include?.persona) {
          const p = db.personas.find((pers) => pers.id === u.personaId);
          res.persona = p ? { ...p, perfil: p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' } } : null;
        }
        if (include?.estadoUsuario) {
          res.estadoUsuario = u.estadoUsuario ?? { id: 1, descripcion: 'ACTIVO' };
        }
        return res;
      },
      findFirst: async ({ where }) => {
        return db.usuarios.find((u) => {
          if (where.personaId && u.personaId !== where.personaId) return false;
          if (where.nombreUsuario && u.nombreUsuario !== where.nombreUsuario) return false;
          return true;
        }) ?? null;
      },
      findMany: async ({ where = {}, include } = {}) => {
        if (where.id?.in) return db.usuarios.filter((u) => where.id.in.includes(u.id));
        // Estado de documentación de choferes: perfil CHOFER o habilitado para conducir.
        if (where.OR) {
          return Promise.all(
            db.usuarios
              .filter((u) => u.habilitadoParaConducir && u.estadoUsuario?.descripcion === where.estadoUsuario?.descripcion)
              .map(async (u) => {
                const res = { ...u };
                if (include?.documentos) {
                  res.documentos = await documentosDe('choferId', u.id, include.documentos);
                }
                if (include?.persona) {
                  const p = db.personas.find((pers) => pers.id === u.personaId);
                  res.persona = p ? { ...p, perfil: p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' } } : null;
                }
                return res;
              })
          );
        }
        let filas = db.usuarios;
        if (where.habilitadoParaConducir !== undefined) {
          filas = filas.filter((u) => u.habilitadoParaConducir === where.habilitadoParaConducir);
        }
        if (where.estadoUsuario?.descripcion) {
          filas = filas.filter((u) => u.estadoUsuario?.descripcion === where.estadoUsuario.descripcion);
        }
        return Promise.all(
          filas.map(async (u) => {
            const res = { ...u };
            if (include?.persona) {
              const p = db.personas.find((pers) => pers.id === u.personaId);
              res.persona = p ? { ...p, perfil: p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' } } : null;
            }
            return res;
          })
        );
      },
      create: async ({ data, include }) => {
        const fila = {
          id: db.siguienteId++,
          personaId: data.personaId,
          nombreUsuario: data.nombreUsuario,
          contrasenaHash: data.contrasenaHash,
          estadoUsuarioId: data.estadoUsuarioId,
          estadoUsuario: { id: data.estadoUsuarioId, descripcion: data.estadoUsuarioId === 1 ? 'ACTIVO' : 'INACTIVO' },
          creadoEn: new Date(),
        };
        db.usuarios.push(fila);
        const res = { ...fila };
        if (include?.persona) {
          const p = db.personas.find((pers) => pers.id === fila.personaId);
          res.persona = p ? { ...p, perfil: p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' } } : null;
        }
        if (include?.estadoUsuario) {
          res.estadoUsuario = fila.estadoUsuario;
        }
        return res;
      },
      update: async ({ where: { id }, data, include }) => {
        const u = db.usuarios.find((x) => x.id === id);
        if (!u) throw new Error('Record to update not found');
        aplicarCambios(u, data);
        if (data.estadoUsuarioId) {
          u.estadoUsuario = { id: data.estadoUsuarioId, descripcion: data.estadoUsuarioId === 1 ? 'ACTIVO' : 'INACTIVO' };
        }
        const res = { ...u };
        if (include?.persona) {
          const p = db.personas.find((pers) => pers.id === u.personaId);
          res.persona = p ? { ...p, perfil: p.perfil ?? { id: p.perfilId, descripcion: 'CHOFER', nombre: 'CHOFER' } } : null;
        }
        return res;
      },
    },
    vehiculo: {
      findUnique: async ({ where: { id }, include }) => {
        const v = db.vehiculos.find((x) => x.id === id);
        if (!v) return null;
        return include?.planMantenimiento ? armarVehiculoMantenimiento(v) : v;
      },
      findMany: async ({ where, include }) => {
        const filas = where.id?.in
          ? db.vehiculos.filter((v) => where.id.in.includes(v.id))
          : db.vehiculos.filter((v) => v.estadoVehiculo.descripcion !== where.estadoVehiculo.descripcion.not);
        if (include?.planMantenimiento) return filas.map(armarVehiculoMantenimiento);
        if (!include?.documentos) return filas;
        return Promise.all(
          filas.map(async (v) => ({ ...v, documentos: await documentosDe('vehiculoId', v.id, include.documentos) }))
        );
      },
    },
    viaje: {
      create: async ({ data }) => {
        const { choferesCandidatos, vehiculosCandidatos, paradas, ...columnas } = data;
        const fila = { id: db.siguienteId++, ...columnas };
        db.viajes.push(fila);
        for (const c of choferesCandidatos?.create ?? []) {
          const id = c.personaId ?? c.usuarioId;
          db.candChofer.push({ viajeId: fila.id, personaId: id, usuarioId: id });
        }
        for (const { vehiculoId } of vehiculosCandidatos?.create ?? []) db.candVeh.push({ viajeId: fila.id, vehiculoId });
        for (const { ubicacionId, orden } of paradas?.create ?? []) db.paradas.push({ viajeId: fila.id, ubicacionId, orden });
        return armar(fila);
      },
      findUnique: async ({ where: { id } }) => {
        const fila = filaPorId(id);
        return fila ? armar(fila) : null;
      },
      findMany: async ({ where }) =>
        db.viajes
          .filter((v) => coincideFiltroEstado(v, where.estadoViaje?.descripcion))
          .filter((v) => where.choferId === undefined || v.choferId === where.choferId)
          .map(armar),
      // La consulta de solapamiento (buscarSolapamiento) y, sin fechas, la de
      // "¿ya tiene otro viaje En viaje?" de comenzarViaje.
      findFirst: async ({ where }) => {
        const campo = 'choferId' in where ? 'choferId' : 'vehiculoId';
        return (
          db.viajes.find(
            (v) =>
              v[campo] === where[campo] &&
              v.estadoViajeId === where.estadoViajeId &&
              (!where.fechaInicio || v.fechaInicio < where.fechaInicio.lt) &&
              (!where.fechaFin || v.fechaFin > where.fechaFin.gt) &&
              (!where.id || v.id !== where.id.not)
          ) ?? null
        );
      },
      update: modelosTx.viaje.update,
    },
    // Transacción con rollback real: si la función lanza, el estado vuelve a lo
    // que había antes de empezar.
    $transaction: async (fn) => {
      const copia = {
        viajes: db.viajes.map((v) => ({ ...v })),
        candChofer: db.candChofer.map((c) => ({ ...c })),
        candVeh: db.candVeh.map((c) => ({ ...c })),
        paradas: db.paradas.map((p) => ({ ...p })),
        documentos: db.documentos.map((d) => ({ ...d })),
        planesMantenimiento: db.planesMantenimiento.map((p) => ({ ...p })),
        mantenimientosRealizados: db.mantenimientosRealizados.map((m) => ({ ...m })),
        mantenimientosTiposArreglo: db.mantenimientosTiposArreglo.map((t) => ({ ...t })),
        lecturas: db.lecturas.map((l) => ({ ...l })),
        kmVehiculos: db.vehiculos.map((v) => [v, v.kilometraje]),
      };
      try {
        return await fn(modelosTx);
      } catch (err) {
        reemplazar(db.viajes, copia.viajes);
        reemplazar(db.candChofer, copia.candChofer);
        reemplazar(db.candVeh, copia.candVeh);
        reemplazar(db.paradas, copia.paradas);
        reemplazar(db.documentos, copia.documentos);
        reemplazar(db.planesMantenimiento, copia.planesMantenimiento);
        reemplazar(db.mantenimientosRealizados, copia.mantenimientosRealizados);
        reemplazar(db.mantenimientosTiposArreglo, copia.mantenimientosTiposArreglo);
        reemplazar(db.lecturas, copia.lecturas);
        for (const [vehiculo, km] of copia.kmVehiculos) vehiculo.kilometraje = km;
        throw err;
      }
    },
  };

  return { prisma, db, sembrar, agregarViaje, filaPorId };
}

// Tiene que llamarse antes de cargar la app: los services hacen
// require('./prismaClient') al cargarse.
function instalarEnCache(srcDir, prisma) {
  const ruta = require.resolve(path.join(srcDir, 'services', 'prismaClient.js'));
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: prisma };
}

module.exports = { crearEntorno, instalarEnCache, ESTADOS, cba, idsDe };
