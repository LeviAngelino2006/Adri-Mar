const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');
const { INCLUDE_MODELO_Y_MARCA, nombresMarcaModelo } = require('../utils/marcaModeloVehiculo');
const { calcularEstadoService } = require('../utils/estadoService');
const { aDiaCordoba, diaCordobaISO, SOLO_DIA_REGEX } = require('../utils/fechaCordoba');

// Mantenimiento de la flota (ver docs/dominio.md §2):
//  - SERVICE: el paquete fijo (aceite, filtros, alineado y balanceado,
//    revisión general). Reinicia el conteo del plan del vehículo.
//  - ARREGLO: cualquier otro trabajo, de un tipo del catálogo tipos_arreglo.
//    No toca el plan ni genera alertas.
// Los dos se guardan en mantenimientos_realizados (el CHECK
// mantenimientos_service_o_arreglo impide mezclarlos).

const ID_MAXIMO = 2147483647; // INTEGER de Postgres
const MAX_TEXTO = 500;
const MAX_RESPONSABLE = 120;
const POR_PAGINA_DEFECTO = 30;
const POR_PAGINA_MAXIMO = 100;
const ESTADO_DADO_DE_BAJA = 'DADO_DE_BAJA';

const TIPOS_HISTORIAL = ['SERVICE', 'ARREGLO'];
const ORDENES_HISTORIAL = {
  fecha_desc: [{ fecha: 'desc' }, { id: 'desc' }],
  fecha_asc: [{ fecha: 'asc' }, { id: 'asc' }],
  km_desc: [{ kilometraje: 'desc' }, { id: 'desc' }],
  // 'interno' se ordena en memoria (orden natural: 2 antes que 10), ver listarHistorial.
  interno: null,
};

// Campos que el service no acepta: viene siempre como el paquete completo y,
// por ahora, sin costo ni responsable (las columnas quedan en la base). Se
// rechazan en vez de ignorarse, así queda explícito.
const CAMPOS_AJENOS_SERVICE = {
  tipoArregloId: 'El service no lleva tipo de arreglo: para otro trabajo, registrá un arreglo',
  categoria: 'El service no lleva categoría',
  costo: 'El service no lleva costo',
  tallerMecanico: 'El service no lleva responsable',
  responsable: 'El service no lleva responsable',
};

const CAMPOS_AJENOS_ARREGLO = {
  categoria: 'El arreglo no lleva categoría: indicá el tipo de trabajo',
  costo: 'El arreglo no lleva costo',
  tallerMecanico: 'Indicá quién hizo el trabajo en "responsable"',
};

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradoError extends Error {
  constructor(recurso) {
    super(`${recurso} no encontrado`);
    this.recurso = recurso;
  }
}

const INCLUDE_VEHICULO = {
  tipoVehiculo: { include: { plantilla: true } },
  estadoVehiculo: true,
  ...INCLUDE_MODELO_Y_MARCA,
  planMantenimiento: { include: { plantillaMantenimiento: true } },
};

const INCLUDE_REGISTRO = {
  tipoArreglo: true,
  usuario: { select: { nombre: true, apellido: true } },
  vehiculo: { include: { tipoVehiculo: true, ...INCLUDE_MODELO_Y_MARCA } },
};

// --- Serialización ------------------------------------------------------------

function serializarVehiculo(vehiculo) {
  const { marca, modelo } = nombresMarcaModelo(vehiculo);
  return {
    id: vehiculo.id,
    numeroInterno: vehiculo.numeroInterno,
    dominio: vehiculo.dominio,
    marca,
    modelo,
    kilometraje: vehiculo.kilometraje,
    estado: vehiculo.estadoVehiculo?.descripcion ?? null,
    tipoVehiculoId: vehiculo.tipoVehiculoId,
    tipoVehiculo: vehiculo.tipoVehiculo?.descripcion ?? null,
  };
}

function serializarPlantilla(plantilla) {
  if (!plantilla) return null;
  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    intervaloKm: plantilla.intervaloKm,
    porcentajeAviso: plantilla.porcentajeAviso,
  };
}

// Estado del service de un vehículo (con `INCLUDE_VEHICULO`). Sin plan activo
// el estado es SIN_PLAN; la plantilla sale del plan o, si no tiene, la de su
// tipo (para mostrar "service cada 20.000 km" y asignarle el plan).
function serializarEstadoService(vehiculo) {
  const plan = vehiculo.planMantenimiento?.activo ? vehiculo.planMantenimiento : null;
  const plantilla = plan ? plan.plantillaMantenimiento : (vehiculo.tipoVehiculo?.plantilla ?? null);
  const base = {
    vehiculo: serializarVehiculo(vehiculo),
    plantilla: serializarPlantilla(plantilla),
    plan: plan ? { id: plan.id, kmUltimoService: plan.kmUltimoService } : null,
  };

  if (!plan) {
    return {
      ...base,
      estado: 'SIN_PLAN',
      kmDesdeService: null,
      kmProximoService: null,
      kmAviso: null,
      kmRestantes: null,
      kmExcedidos: null,
      porcentajeConsumido: null,
    };
  }

  return {
    ...base,
    ...calcularEstadoService({
      kilometraje: vehiculo.kilometraje,
      kmUltimoService: plan.kmUltimoService,
      intervaloKm: plan.plantillaMantenimiento.intervaloKm,
      porcentajeAviso: plan.plantillaMantenimiento.porcentajeAviso,
    }),
  };
}

function serializarRegistro(registro) {
  const v = registro.vehiculo;
  const { marca, modelo } = nombresMarcaModelo(v);
  return {
    id: registro.id,
    tipo: registro.esServicePreventivo ? 'SERVICE' : 'ARREGLO',
    tipoArreglo: registro.tipoArreglo ? { id: registro.tipoArreglo.id, nombre: registro.tipoArreglo.nombre } : null,
    fecha: registro.fecha,
    kilometraje: registro.kilometraje,
    descripcion: registro.descripcion ?? null,
    observaciones: registro.observaciones ?? null,
    repuestos: registro.repuestos ?? null,
    responsable: registro.tallerMecanico ?? null,
    vehiculo: {
      id: v.id,
      numeroInterno: v.numeroInterno,
      dominio: v.dominio,
      marca,
      modelo,
      tipoVehiculo: v.tipoVehiculo?.descripcion ?? null,
    },
    usuario: registro.usuario ? `${registro.usuario.nombre} ${registro.usuario.apellido}` : null,
    creadoEn: registro.creadoEn,
  };
}

// --- Validación ---------------------------------------------------------------

function parsearId(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const id = Number(texto);
  return id >= 1 && id <= ID_MAXIMO ? id : null;
}

const vino = (valor) => valor !== undefined;

// Texto opcional: trim, vacío → null, con tope de largo.
function validarTexto(valor, campo, etiqueta, maximo, errores) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    errores[campo] = `${etiqueta} tiene que ser texto`;
    return null;
  }
  const texto = valor.trim();
  if ([...texto].length > maximo) {
    errores[campo] = `${etiqueta} admite hasta ${maximo} caracteres`;
    return null;
  }
  return texto || null;
}

function validarKilometraje(valor, errores) {
  const texto = String(valor ?? '').trim();
  if (!texto) {
    errores.kilometraje = 'El kilometraje es obligatorio';
    return null;
  }
  const km = Number(texto);
  if (!Number.isInteger(km) || km < 0 || km > ID_MAXIMO) {
    errores.kilometraje = 'El kilometraje debe ser un número entero mayor o igual a 0';
    return null;
  }
  return km;
}

// Día del trabajo, en hora de Córdoba. No puede ser futuro.
function validarFecha(valor, errores, ahora = new Date()) {
  const fecha = aDiaCordoba(valor);
  if (!fecha) {
    errores.fecha = 'La fecha es obligatoria';
    return null;
  }
  if (Number.isNaN(fecha.getTime())) {
    errores.fecha = 'La fecha no es válida';
    return null;
  }
  if (diaCordobaISO(fecha) > diaCordobaISO(ahora)) {
    errores.fecha = 'La fecha no puede ser posterior a hoy';
    return null;
  }
  return fecha;
}

function rechazarCamposAjenos(datos, ajenos, errores) {
  for (const [campo, mensaje] of Object.entries(ajenos)) {
    if (vino(datos[campo])) errores[campo] = mensaje;
  }
}

// El vehículo tiene que existir y no estar dado de baja (su historial se
// conserva, pero no se le registran trabajos nuevos).
async function buscarVehiculoActivo(vehiculoId, errores, cliente = prisma) {
  const id = parsearId(vehiculoId);
  if (!id) {
    errores.vehiculoId = 'El vehículo es obligatorio';
    return null;
  }
  const vehiculo = await cliente.vehiculo.findUnique({ where: { id }, include: INCLUDE_VEHICULO });
  if (!vehiculo) {
    errores.vehiculoId = 'El vehículo no existe';
    return null;
  }
  if (vehiculo.estadoVehiculo?.descripcion === ESTADO_DADO_DE_BAJA) {
    errores.vehiculoId = 'El vehículo está dado de baja';
    return null;
  }
  return vehiculo;
}

// Si el km del trabajo supera al odómetro, se registra la lectura (origen
// MANTENIMIENTO) con crearLectura, que lockea el vehículo y valida que el
// odómetro no retroceda. `{ cliente: tx }` es obligatorio: sin él, crearLectura
// abriría otra transacción y se colgaría (ver su comentario).
async function registrarLecturaSiAvanza(tx, vehiculo, kilometraje, usuarioId) {
  if (kilometraje <= vehiculo.kilometraje) return;
  try {
    await lecturaOdometroService.crearLectura(
      { vehiculoId: vehiculo.id, valorKm: kilometraje, origen: 'MANTENIMIENTO', usuarioId },
      { cliente: tx }
    );
  } catch (err) {
    if (err instanceof lecturaOdometroService.ValidacionError) {
      throw new ValidacionError({ kilometraje: err.errores.valorKm || Object.values(err.errores)[0] });
    }
    throw err;
  }
}

// --- Catálogos y estado -------------------------------------------------------

async function listarTiposArreglo() {
  const tipos = await prisma.tipoArreglo.findMany({
    where: { activo: true },
    orderBy: { orden: 'asc' },
  });
  return tipos.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion ?? null,
    requiereDetalle: t.requiereDetalle,
  }));
}

// Todos los vehículos que no están dados de baja, con el estado de su service
// (SIN_PLAN si no tienen plan). El filtrado y el orden los hace el front: son
// pocos vehículos.
async function listarEstadoService() {
  const vehiculos = await prisma.vehiculo.findMany({
    where: { estadoVehiculo: { descripcion: { not: ESTADO_DADO_DE_BAJA } } },
    include: INCLUDE_VEHICULO,
  });
  return vehiculos.map(serializarEstadoService);
}

async function asignarPlanAVehiculo({ vehiculoId, kmUltimoService }) {
  const errores = {};
  const vehiculo = await buscarVehiculoActivo(vehiculoId, errores);
  if (!vehiculo) throw new ValidacionError(errores);

  const plantilla = vehiculo.tipoVehiculo?.plantilla;
  if (!plantilla) {
    throw new ValidacionError({ vehiculoId: 'No hay una plantilla de service para el tipo de este vehículo' });
  }

  const sinKm = kmUltimoService === undefined || kmUltimoService === null || String(kmUltimoService).trim() === '';
  const km = sinKm ? vehiculo.kilometraje : Number(String(kmUltimoService).trim());
  if (!Number.isInteger(km) || km < 0) {
    throw new ValidacionError({ kmUltimoService: 'El km del último service debe ser un número entero mayor o igual a 0' });
  }
  if (km > vehiculo.kilometraje) {
    throw new ValidacionError({
      kmUltimoService: `El km del último service no puede superar al odómetro actual (${vehiculo.kilometraje} km)`,
    });
  }

  const datos = { plantillaMantenimientoId: plantilla.id, kmUltimoService: km, activo: true };
  if (vehiculo.planMantenimiento) {
    await prisma.planMantenimiento.update({ where: { id: vehiculo.planMantenimiento.id }, data: datos });
  } else {
    await prisma.planMantenimiento.create({ data: { vehiculoId: vehiculo.id, ...datos } });
  }

  const actualizado = await prisma.vehiculo.findUnique({ where: { id: vehiculo.id }, include: INCLUDE_VEHICULO });
  return serializarEstadoService(actualizado);
}

// --- Plan automático (alta y cambio de tipo del vehículo) ---------------------
// Los llama vehiculoService DENTRO de su transacción (`tx`), así el vehículo y
// su plan se guardan juntos o no se guarda ninguno. Reciben la plantilla del
// tipo ya leída (o null si el tipo no tiene): sin plantilla el vehículo queda
// SIN_PLAN y se le asigna uno cuando exista.

// Km del último service opcional del formulario de alta: vacío → null (se usa
// el km de alta). No puede superar al odómetro de alta. Devuelve el número, o
// el error en `errores.kmUltimoService`.
function validarKmUltimoServiceAlta(valor, kilometrajeAlta, errores) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const km = Number(texto);
  if (!Number.isInteger(km) || km < 0 || km > ID_MAXIMO) {
    errores.kmUltimoService = 'El km del último service debe ser un número entero mayor o igual a 0';
    return null;
  }
  if (Number.isInteger(kilometrajeAlta) && km > kilometrajeAlta) {
    errores.kmUltimoService = `El km del último service no puede superar al kilometraje de alta (${kilometrajeAlta} km)`;
    return null;
  }
  return km;
}

async function crearPlanInicial(tx, { vehiculoId, plantilla, kmUltimoService }) {
  if (!plantilla) return null;
  return tx.planMantenimiento.create({
    data: { vehiculoId, plantillaMantenimientoId: plantilla.id, kmUltimoService, activo: true },
  });
}

// Si cambia el tipo del vehículo, su plan pasa a la plantilla del tipo nuevo
// sin tocar el km del último service (el service hecho sigue valiendo). Si el
// tipo nuevo no tiene plantilla, el plan se desactiva (SIN_PLAN) en vez de
// seguir avisando con el intervalo del tipo viejo. Si no tenía plan, se le crea
// uno desde el odómetro actual.
async function actualizarPlanPorCambioDeTipo(tx, { vehiculo, plantilla }) {
  const plan = vehiculo.planMantenimiento;
  if (!plan) {
    return crearPlanInicial(tx, { vehiculoId: vehiculo.id, plantilla, kmUltimoService: vehiculo.kilometraje });
  }
  const data = plantilla ? { plantillaMantenimientoId: plantilla.id, activo: true } : { activo: false };
  return tx.planMantenimiento.update({ where: { id: plan.id }, data });
}

// --- Registro -----------------------------------------------------------------

async function registrarService(datos, usuarioId) {
  const errores = {};
  rechazarCamposAjenos(datos, CAMPOS_AJENOS_SERVICE, errores);
  const fecha = validarFecha(datos.fecha, errores);
  const kilometraje = validarKilometraje(datos.kilometraje, errores);
  const observaciones = validarTexto(datos.observaciones, 'observaciones', 'La observación', MAX_TEXTO, errores);
  const vehiculo = await buscarVehiculoActivo(datos.vehiculoId, errores);
  if (vehiculo && !vehiculo.planMantenimiento && !vehiculo.tipoVehiculo?.plantilla) {
    errores.vehiculoId = 'No hay una plantilla de service para el tipo de este vehículo';
  }
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  // Todo junto: si falla la lectura del odómetro no queda un plan creado ni el
  // conteo reiniciado.
  return prisma.$transaction(async (tx) => {
    let plan = vehiculo.planMantenimiento;
    if (!plan) {
      plan = await tx.planMantenimiento.create({
        data: {
          vehiculoId: vehiculo.id,
          plantillaMantenimientoId: vehiculo.tipoVehiculo.plantilla.id,
          kmUltimoService: kilometraje,
          activo: true,
        },
      });
    } else {
      // Math.max: cargar hoy un service viejo (con menos km) no "rejuvenece" el conteo.
      plan = await tx.planMantenimiento.update({
        where: { id: plan.id },
        data: { kmUltimoService: Math.max(plan.kmUltimoService, kilometraje), activo: true },
      });
    }

    const registro = await tx.mantenimientoRealizado.create({
      data: {
        vehiculoId: vehiculo.id,
        planMantenimientoId: plan.id,
        esServicePreventivo: true,
        tipoArregloId: null,
        fecha,
        kilometraje,
        observaciones,
        usuarioId: Number(usuarioId),
      },
      include: INCLUDE_REGISTRO,
    });

    await registrarLecturaSiAvanza(tx, vehiculo, kilometraje, Number(usuarioId));
    return serializarRegistro(registro);
  });
}

async function registrarArreglo(datos, usuarioId) {
  const errores = {};
  rechazarCamposAjenos(datos, CAMPOS_AJENOS_ARREGLO, errores);
  const fecha = validarFecha(datos.fecha, errores);
  const kilometraje = validarKilometraje(datos.kilometraje, errores);
  const descripcion = validarTexto(datos.descripcion, 'descripcion', 'La descripción', MAX_TEXTO, errores);
  const repuestos = validarTexto(datos.repuestos, 'repuestos', 'Los repuestos', MAX_TEXTO, errores);
  const observaciones = validarTexto(datos.observaciones, 'observaciones', 'La observación', MAX_TEXTO, errores);
  const responsable = validarTexto(datos.responsable, 'responsable', 'Quién hizo el trabajo', MAX_RESPONSABLE, errores);
  const vehiculo = await buscarVehiculoActivo(datos.vehiculoId, errores);

  const tipoArregloId = parsearId(datos.tipoArregloId);
  let tipoArreglo = null;
  if (!tipoArregloId) {
    errores.tipoArregloId = 'Elegí el tipo de trabajo';
  } else {
    tipoArreglo = await prisma.tipoArreglo.findUnique({ where: { id: tipoArregloId } });
    if (!tipoArreglo || !tipoArreglo.activo) {
      errores.tipoArregloId = 'El tipo de trabajo no es válido';
      tipoArreglo = null;
    }
  }
  if (tipoArreglo?.requiereDetalle && !descripcion && !errores.descripcion) {
    errores.descripcion = `Contá qué trabajo se hizo (obligatorio para "${tipoArreglo.nombre}")`;
  }
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  // No toca el plan: un arreglo no reinicia el conteo del service.
  return prisma.$transaction(async (tx) => {
    const registro = await tx.mantenimientoRealizado.create({
      data: {
        vehiculoId: vehiculo.id,
        planMantenimientoId: null,
        esServicePreventivo: false,
        tipoArregloId: tipoArreglo.id,
        fecha,
        kilometraje,
        descripcion,
        repuestos,
        observaciones,
        tallerMecanico: responsable,
        usuarioId: Number(usuarioId),
      },
      include: INCLUDE_REGISTRO,
    });

    await registrarLecturaSiAvanza(tx, vehiculo, kilometraje, Number(usuarioId));
    return serializarRegistro(registro);
  });
}

// --- Historial ----------------------------------------------------------------

// Primer instante del día de Córdoba indicado ("YYYY-MM-DD").
const inicioDelDia = (dia) => new Date(`${dia}T00:00:00-03:00`);
const diaSiguiente = (dia) => {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, d + 1)).toISOString().slice(0, 10);
};

function validarDiaFiltro(valor, campo, errores) {
  if (valor === undefined || valor === '') return null;
  const texto = String(valor).trim();
  if (!SOLO_DIA_REGEX.test(texto) || Number.isNaN(inicioDelDia(texto).getTime())) {
    errores[campo] = 'La fecha no es válida (AAAA-MM-DD)';
    return null;
  }
  return texto;
}

function enteroEnRango(valor, defecto, minimo, maximo) {
  const numero = Number.parseInt(valor, 10);
  if (!Number.isInteger(numero)) return defecto;
  return Math.min(maximo, Math.max(minimo, numero));
}

function armarFiltroHistorial(query, errores) {
  const where = {};

  if (query.vehiculoId !== undefined && query.vehiculoId !== '') {
    const id = parsearId(query.vehiculoId);
    if (id) where.vehiculoId = id;
    else errores.vehiculoId = 'El vehículo no es válido';
  }

  if (query.tipo) {
    if (!TIPOS_HISTORIAL.includes(query.tipo)) errores.tipo = 'El tipo debe ser SERVICE o ARREGLO';
    else where.esServicePreventivo = query.tipo === 'SERVICE';
  }

  if (query.tipoArregloId !== undefined && query.tipoArregloId !== '') {
    const id = parsearId(query.tipoArregloId);
    if (id) where.tipoArregloId = id;
    else errores.tipoArregloId = 'El tipo de trabajo no es válido';
  }

  const filtroVehiculo = {};
  if (query.tipoVehiculoId !== undefined && query.tipoVehiculoId !== '') {
    const id = parsearId(query.tipoVehiculoId);
    if (id) filtroVehiculo.tipoVehiculoId = id;
    else errores.tipoVehiculoId = 'El tipo de vehículo no es válido';
  }
  const busqueda = String(query.busqueda ?? '').trim();
  if (busqueda) {
    const contiene = { contains: busqueda, mode: 'insensitive' };
    filtroVehiculo.OR = [
      { numeroInterno: contiene },
      { dominio: contiene },
      { modelo: { nombre: contiene } },
      { modelo: { marca: { nombre: contiene } } },
    ];
  }
  if (Object.keys(filtroVehiculo).length > 0) where.vehiculo = filtroVehiculo;

  const desde = validarDiaFiltro(query.desde, 'desde', errores);
  const hasta = validarDiaFiltro(query.hasta, 'hasta', errores);
  if (desde && hasta && hasta < desde) errores.hasta = 'La fecha "hasta" no puede ser anterior a "desde"';
  if (desde || hasta) {
    where.fecha = {
      ...(desde ? { gte: inicioDelDia(desde) } : {}),
      ...(hasta ? { lt: inicioDelDia(diaSiguiente(hasta)) } : {}),
    };
  }

  return where;
}

const compararInterno = (a, b) => {
  const conNumero = (v) => /\d/.test(v);
  if (conNumero(a) !== conNumero(b)) return conNumero(a) ? -1 : 1;
  return a.localeCompare(b, 'es', { numeric: true });
};

// Historial de toda la flota (dados de baja incluidos: su historial se
// conserva), con filtros, orden y paginado en la base: crece sin límite.
// Con `vehiculoId` trae además el estado del service de ese vehículo, para el
// encabezado del historial.
async function listarHistorial(query = {}) {
  const errores = {};
  const where = armarFiltroHistorial(query, errores);
  const orden = query.orden || 'fecha_desc';
  if (!(orden in ORDENES_HISTORIAL)) errores.orden = 'El orden no es válido';
  if (Object.keys(errores).length > 0) throw new ValidacionError(errores);

  const pagina = enteroEnRango(query.pagina, 1, 1, ID_MAXIMO);
  const porPagina = enteroEnRango(query.porPagina, POR_PAGINA_DEFECTO, 1, POR_PAGINA_MAXIMO);

  let vehiculo = null;
  if (where.vehiculoId) {
    const encontrado = await prisma.vehiculo.findUnique({ where: { id: where.vehiculoId }, include: INCLUDE_VEHICULO });
    if (!encontrado) throw new NoEncontradoError('Vehículo');
    vehiculo = serializarEstadoService(encontrado);
  }

  const total = await prisma.mantenimientoRealizado.count({ where });
  let registros;
  if (orden === 'interno') {
    // El interno es texto en la base ("10" < "2"): se ordena en memoria con
    // orden natural sobre una consulta liviana y después se trae solo la página.
    const claves = await prisma.mantenimientoRealizado.findMany({
      where,
      select: { id: true, fecha: true, vehiculo: { select: { numeroInterno: true } } },
    });
    claves.sort(
      (a, b) =>
        compararInterno(String(a.vehiculo.numeroInterno), String(b.vehiculo.numeroInterno)) ||
        new Date(b.fecha) - new Date(a.fecha) ||
        b.id - a.id
    );
    const ids = claves.slice((pagina - 1) * porPagina, pagina * porPagina).map((c) => c.id);
    const filas = await prisma.mantenimientoRealizado.findMany({ where: { id: { in: ids } }, include: INCLUDE_REGISTRO });
    const porId = new Map(filas.map((f) => [f.id, f]));
    registros = ids.map((id) => porId.get(id)).filter(Boolean);
  } else {
    registros = await prisma.mantenimientoRealizado.findMany({
      where,
      include: INCLUDE_REGISTRO,
      orderBy: ORDENES_HISTORIAL[orden],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    });
  }

  return { items: registros.map(serializarRegistro), total, pagina, porPagina, vehiculo };
}

// --- Advertencia al planificar un viaje ---------------------------------------

const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function evaluarAdvertenciaViaje({ vehiculoId, kilometrosEstimados }) {
  const id = parsearId(vehiculoId);
  if (!id) return { tieneAdvertencia: false };

  const vehiculo = await prisma.vehiculo.findUnique({ where: { id }, include: INCLUDE_VEHICULO });
  if (!vehiculo || vehiculo.estadoVehiculo?.descripcion === ESTADO_DADO_DE_BAJA) return { tieneAdvertencia: false };

  const estado = serializarEstadoService(vehiculo);
  if (estado.estado === 'SIN_PLAN') return { tieneAdvertencia: false };

  const kmEstimados = Math.max(0, Number.parseInt(kilometrosEstimados, 10) || 0);
  const kmActual = vehiculo.kilometraje;
  const kmFinalEstimado = kmActual + kmEstimados;
  const { kmProximoService, kmRestantes, kmExcedidos } = estado;
  const yaVencido = estado.estado === 'VENCIDO';
  const superaEnViaje = !yaVencido && kmFinalEstimado >= kmProximoService;
  const datos = { kmActual, kmEstimados, kmFinalEstimado, kmProximoService, kmRestantes, kmExcedidos };

  if (!yaVencido && !superaEnViaje) return { tieneAdvertencia: false, ...datos };

  const mensaje = yaVencido
    ? `El vehículo ya superó su service (tocaba a los ${miles(kmProximoService)} km; está pasado por ${miles(kmExcedidos)} km).`
    : `Con este viaje de ${miles(kmEstimados)} km, el vehículo llegaría a los ${miles(kmFinalEstimado)} km y superará su service (a los ${miles(kmProximoService)} km; faltan ${miles(kmRestantes)} km).`;

  return { tieneAdvertencia: true, yaVencido, superaEnViaje, ...datos, mensaje };
}

module.exports = {
  ValidacionError,
  NoEncontradoError,
  serializarEstadoService,
  serializarRegistro,
  listarTiposArreglo,
  listarEstadoService,
  asignarPlanAVehiculo,
  validarKmUltimoServiceAlta,
  crearPlanInicial,
  actualizarPlanPorCambioDeTipo,
  registrarService,
  registrarArreglo,
  listarHistorial,
  evaluarAdvertenciaViaje,
};
