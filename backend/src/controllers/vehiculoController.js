const vehiculoService = require('../services/vehiculoService');

async function crear(req, res) {
  const { dominio, numeroInterno, marca, modelo, anio, asientos, kilometraje, tipoVehiculoId } =
    req.body;

  try {
    const vehiculo = await vehiculoService.crearVehiculo(
      {
        dominio,
        numeroInterno,
        marca,
        modelo,
        anio,
        asientos,
        kilometraje,
        tipoVehiculoId,
      },
      { usuarioId: req.usuario.id }
    );
    return res.status(201).json({ vehiculo });
  } catch (err) {
    if (err instanceof vehiculoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { estado, busqueda } = req.query;
  const vehiculos = await vehiculoService.listarVehiculos({ estado, busqueda });
  return res.json({ vehiculos });
}

async function listarTipos(req, res) {
  const tiposVehiculo = await vehiculoService.listarTiposVehiculo();
  return res.json({ tiposVehiculo });
}

async function obtener(req, res) {
  try {
    const vehiculo = await vehiculoService.obtenerVehiculo(req.params.id);
    return res.json({ vehiculo });
  } catch (err) {
    if (err instanceof vehiculoService.NoEncontradoError) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    throw err;
  }
}

async function actualizar(req, res) {
  const { dominio, numeroInterno, marca, modelo, anio, asientos, kilometraje, tipoVehiculoId } =
    req.body;

  try {
    const { vehiculo, kilometrajeIgnorado } = await vehiculoService.actualizarVehiculo(req.params.id, {
      dominio,
      numeroInterno,
      marca,
      modelo,
      anio,
      asientos,
      kilometraje,
      tipoVehiculoId,
    });
    return res.json({
      vehiculo,
      ...(kilometrajeIgnorado
        ? { avisos: { kilometraje: 'El kilometraje no se modifica desde este formulario; se gestiona como historial de lecturas del odómetro.' } }
        : {}),
    });
  } catch (err) {
    if (err instanceof vehiculoService.NoEncontradoError) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    if (err instanceof vehiculoService.DadoDeBajaError) {
      return res.status(409).json({ error: 'No se puede modificar un vehículo dado de baja' });
    }
    if (err instanceof vehiculoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function darDeBaja(req, res) {
  try {
    const vehiculo = await vehiculoService.darDeBajaVehiculo(req.params.id);
    return res.json({ vehiculo });
  } catch (err) {
    if (err instanceof vehiculoService.NoEncontradoError) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    if (err instanceof vehiculoService.YaDadoDeBajaError) {
      return res.status(409).json({ error: 'El vehículo ya está dado de baja' });
    }
    if (err instanceof vehiculoService.VehiculoEnUsoError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = { crear, listar, listarTipos, obtener, actualizar, darDeBaja };
