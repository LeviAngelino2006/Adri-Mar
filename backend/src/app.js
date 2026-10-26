const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const personaRoutes = require('./routes/personaRoutes');
const vehiculoRoutes = require('./routes/vehiculoRoutes');
const tipoVehiculoRoutes = require('./routes/tipoVehiculoRoutes');
const viajeRoutes = require('./routes/viajeRoutes');
const lecturaOdometroRoutes = require('./routes/lecturaOdometroRoutes');
const ubicacionRoutes = require('./routes/ubicacionRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const marcaRoutes = require('./routes/marcaRoutes');
const estadoPagoRoutes = require('./routes/estadoPagoRoutes');
const metodoPagoRoutes = require('./routes/metodoPagoRoutes');
const documentoRoutes = require('./routes/documentoRoutes');
const presupuestoRoutes = require('./routes/presupuestoRoutes');
const mantenimientoRoutes = require('./routes/mantenimientoRoutes');

const app = express();

// En Render, un pedido llega así: cliente → Cloudflare → balanceador de Render
// → la app. Cloudflare agrega la IP del cliente a X-Forwarded-For y el
// balanceador agrega la del borde de Cloudflare; la conexión que ve la app es
// la del balanceador (una 10.x). Son DOS saltos de confianza: con 2, req.ip es
// la IP del cliente. Con `true` se tomaría la primera de la lista, que el
// cliente puede inventar mandando su propio X-Forwarded-For; con 1 sería la del
// borde de Cloudflare, que cambia y la comparten muchos clientes. Lo usa el
// límite de intentos de login (middlewares/limiteLogin.js), que deja en el log
// la IP que ve cuando responde 429: así se confirma en Render.
const SALTOS_DE_PROXY = 2;
app.set('trust proxy', SALTOS_DE_PROXY);

app.use(cors({ exposedHeaders: ['X-Renewed-Token'] }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/tipos-vehiculo', tipoVehiculoRoutes);
app.use('/api/viajes', viajeRoutes);
app.use('/api/lecturas-odometro', lecturaOdometroRoutes);
app.use('/api/ubicaciones', ubicacionRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/marcas', marcaRoutes);
app.use('/api/estados-pago', estadoPagoRoutes);
app.use('/api/metodos-pago', metodoPagoRoutes);
app.use('/api/documentos', documentoRoutes);
app.use('/api/presupuestos', presupuestoRoutes);
app.use('/api/mantenimientos', mantenimientoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
