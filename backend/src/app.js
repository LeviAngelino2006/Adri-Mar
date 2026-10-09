const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const vehiculoRoutes = require('./routes/vehiculoRoutes');
const tipoVehiculoRoutes = require('./routes/tipoVehiculoRoutes');
const viajeRoutes = require('./routes/viajeRoutes');
const lecturaOdometroRoutes = require('./routes/lecturaOdometroRoutes');
const ubicacionRoutes = require('./routes/ubicacionRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const estadoPagoRoutes = require('./routes/estadoPagoRoutes');
const metodoPagoRoutes = require('./routes/metodoPagoRoutes');
const documentoRoutes = require('./routes/documentoRoutes');

const app = express();

app.use(cors({ exposedHeaders: ['X-Renewed-Token'] }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/tipos-vehiculo', tipoVehiculoRoutes);
app.use('/api/viajes', viajeRoutes);
app.use('/api/lecturas-odometro', lecturaOdometroRoutes);
app.use('/api/ubicaciones', ubicacionRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/estados-pago', estadoPagoRoutes);
app.use('/api/metodos-pago', metodoPagoRoutes);
app.use('/api/documentos', documentoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
