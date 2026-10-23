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
    const usuario = (id, nombre, apellido, { habilitado = true, estado = 'ACTIVO', telefono = null } = {}) => ({
      id,
      nombre,
      apellido,
      telefono,
      habilitadoParaConducir: habilitado,
      estadoUsuario: { descripcion: estado },
    });
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
    for (const usuarioId of choferesCandidatos) db.candChofer.push({ viajeId: fila.id, usuarioId });
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
      chofer: db.usuarios.find((u) => u.id === fila.choferId) ?? null,
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
        .map((c) => ({ ...c, usuario: db.usuarios.find((u) => u.id === c.usuarioId) })),
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
        const chofer = db.usuarios.find((u) => u.id === fila.choferId);
        return Boolean(chofer) && chofer.estadoUsuario.descripcion === filtro.estadoUsuario.descripcion;
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
    if (include?.chofer) resultado.chofer = db.usuarios.find((u) => u.id === fila.choferId) ?? null;
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

  // include: { documentos: { distinct, orderBy } } de vehiculo/usuario.
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
      if (['vehiculoId', 'esServicePreventivo', 'tipoArregloId'].includes(clave)) return fila[clave] === filtro;
      if (clave === 'id') return filtro.in.includes(fila.id);
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
    return {
      ...fila,
      tipoArreglo: db.tiposArreglo.find((t) => t.id === fila.tipoArregloId) ?? null,
      usuario: usuario ? { nombre: usuario.nombre, apellido: usuario.apellido } : null,
      vehiculo: { ...db.vehiculos.find((v) => v.id === fila.vehiculoId) },
    };
  }

  const modeloMantenimientoRealizado = {
    create: async ({ data }) => {
      if (db.fallos.createMantenimiento) throw new Error('falla simulada en el create del mantenimiento');
      // CHECK mantenimientos_service_o_arreglo de la migración.
      if (data.esServicePreventivo === (data.tipoArregloId != null)) {
        throw new Error('violates check constraint "mantenimientos_service_o_arreglo"');
      }
      const fila = {
        id: db.siguienteId++,
        planMantenimientoId: null,
        tipoArregloId: null,
        descripcion: null,
        repuestos: null,
        tallerMecanico: null,
        costo: null,
        observaciones: null,
        ...data,
        creadoEn: new Date(),
      };
      db.mantenimientosRealizados.push(fila);
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
    findMany: async ({ where, orderBy }) => {
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
        db.candChofer.push(...data);
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
      findUnique: async ({ where: { id } }) => {
        if (db.alLeerUsuario) db.alLeerUsuario();
        return db.usuarios.find((u) => u.id === id) ?? null;
      },
      findMany: async ({ where, include }) => {
        if (where.id?.in) return db.usuarios.filter((u) => where.id.in.includes(u.id));
        // Estado de documentación de choferes: perfil CHOFER o habilitado para conducir.
        if (where.OR) {
          return Promise.all(
            db.usuarios
              .filter((u) => u.habilitadoParaConducir && u.estadoUsuario.descripcion === where.estadoUsuario.descripcion)
              .map(async (u) => ({ ...u, documentos: await documentosDe('choferId', u.id, include.documentos) }))
          );
        }
        return db.usuarios.filter(
          (u) => u.habilitadoParaConducir === where.habilitadoParaConducir && u.estadoUsuario.descripcion === 'ACTIVO'
        );
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
        for (const { usuarioId } of choferesCandidatos?.create ?? []) db.candChofer.push({ viajeId: fila.id, usuarioId });
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
      // La consulta de solapamiento (buscarSolapamiento).
      findFirst: async ({ where }) => {
        const campo = 'choferId' in where ? 'choferId' : 'vehiculoId';
        return (
          db.viajes.find(
            (v) =>
              v[campo] === where[campo] &&
              v.estadoViajeId === where.estadoViajeId &&
              v.fechaInicio < where.fechaInicio.lt &&
              v.fechaFin > where.fechaFin.gt &&
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
