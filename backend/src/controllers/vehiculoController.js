const vehiculoService = require('../services/vehiculoService');

async function crear(req, res) {
  const { dominio, numeroInterno, marca, modelo, anio, asientos, kilometraje } = req.body;

  try {
    const vehiculo = await vehiculoService.crearVehiculo({
      dominio,
      numeroInterno,
      marca,
      modelo,
      anio,
      asientos,
      kilometraje,
    });
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

module.exports = { crear, listar };
