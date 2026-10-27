// Límite de intentos fallidos en POST /auth/login (H13 de la auditoría de
// Personal y Usuarios): sin esto se podían probar contraseñas sin fin.
//
// Cuenta los intentos FALLIDOS (respuestas 401) en una ventana deslizante, por
// dos claves:
// - el nombre de usuario (en minúsculas y sin espacios alrededor, para que
//   "AMartinez" no esquive el límite de "amartinez"): frena a quien prueba
//   contraseñas contra UNA cuenta. Cuenta igual si el usuario no existe: así el
//   429 no delata qué cuentas existen.
// - la IP del cliente (req.ip, ver `trust proxy` en app.js): frena a quien
//   prueba muchas cuentas desde el mismo lugar. Tiene un tope más alto que el
//   del usuario porque detrás de una IP puede haber varias personas legítimas:
//   la red de la oficina sale por una sola IP y los celulares de los choferes
//   salen por el NAT compartido de la empresa de telefonía.
// Si cualquiera de las dos llegó al tope, 429 sin mirar la contraseña (aunque
// sea la correcta) hasta que el intento más viejo salga de la ventana.
// Un ingreso correcto borra los fallos de ese usuario, no los de la IP.
//
// El contador vive en memoria: el backend corre en UNA sola instancia de Render
// (no hay otra réplica con la que compartirlo) y que se reinicie con un deploy
// solo le da a un atacante, como mucho, una ventana nueva.

const MENSAJE_DEMASIADOS_INTENTOS = 'Demasiados intentos. Probá de nuevo en unos minutos.';

const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS_POR_USUARIO = 5;
const MAX_FALLOS_POR_IP = 20;

function claveDeUsuario(nombreUsuario) {
  return typeof nombreUsuario === 'string' ? nombreUsuario.trim().toLowerCase() : '';
}

// `claveDe` y `esFallo` permiten usar el mismo límite en otra ruta: el cambio de
// la propia contraseña (authRoutes) cuenta por cuenta de la sesión y toma como
// fallo una contraseña actual incorrecta.
function crearLimiteLogin({
  ahora = Date.now,
  ventanaMs = VENTANA_MS,
  maxPorUsuario = MAX_FALLOS_POR_USUARIO,
  maxPorIp = MAX_FALLOS_POR_IP,
  claveDe = (req) => claveDeUsuario(req.body?.nombreUsuario),
  esFallo = (res) => res.statusCode === 401,
  etiqueta = 'login',
} = {}) {
  // clave → instantes de los fallos dentro de la ventana, del más viejo al más nuevo.
  const fallosPorUsuario = new Map();
  const fallosPorIp = new Map();

  function vigentes(mapa, clave) {
    const desde = ahora() - ventanaMs;
    const lista = (mapa.get(clave) ?? []).filter((t) => t > desde);
    if (lista.length > 0) mapa.set(clave, lista);
    else mapa.delete(clave);
    return lista;
  }

  function registrar(mapa, clave) {
    const lista = vigentes(mapa, clave);
    lista.push(ahora());
    mapa.set(clave, lista);
  }

  // Segundos hasta que el fallo más viejo de una lista llena salga de la ventana.
  function segundosHastaLiberar(lista) {
    return Math.max(1, Math.ceil((lista[0] + ventanaMs - ahora()) / 1000));
  }

  function middleware(req, res, next) {
    const usuario = claveDe(req);
    const ip = req.ip;

    const porUsuario = vigentes(fallosPorUsuario, usuario);
    const porIp = vigentes(fallosPorIp, ip);
    const llenas = [porUsuario.length >= maxPorUsuario && porUsuario, porIp.length >= maxPorIp && porIp].filter(Boolean);
    if (llenas.length > 0) {
      // Para el log de Render: deja ver qué IP ve el backend (ver trust proxy).
      console.warn(`[${etiqueta}] 429 ip=${ip} usuario=${JSON.stringify(usuario)} fallos usuario=${porUsuario.length} ip=${porIp.length}`);
      res.setHeader('Retry-After', String(Math.max(...llenas.map(segundosHastaLiberar))));
      return res.status(429).json({ error: MENSAJE_DEMASIADOS_INTENTOS });
    }

    res.on('finish', () => {
      if (esFallo(res)) {
        registrar(fallosPorUsuario, usuario);
        registrar(fallosPorIp, ip);
      } else if (res.statusCode === 200) {
        fallosPorUsuario.delete(usuario);
      }
    });
    next();
  }

  // Limpieza de las claves viejas (las que no se vuelven a consultar), para que
  // los mapas no crezcan sin fin con nombres de usuario inventados.
  function limpiar() {
    for (const mapa of [fallosPorUsuario, fallosPorIp]) {
      for (const clave of [...mapa.keys()]) vigentes(mapa, clave);
    }
  }

  function reiniciar() {
    fallosPorUsuario.clear();
    fallosPorIp.clear();
  }

  return { middleware, limpiar, reiniciar, tamanio: () => fallosPorUsuario.size + fallosPorIp.size };
}

// Las instancias de la app. La limpieza corre cada 5 minutos sin retener el proceso.
const limiteLogin = crearLimiteLogin();
// PUT /auth/contrasena (H11): quien tiene una sesión abierta ajena no puede
// probar contraseñas actuales sin fin. Va después de autenticar (req.usuario).
// El controller marca res.locals.contrasenaActualIncorrecta.
const limiteCambioContrasena = crearLimiteLogin({
  claveDe: (req) => `cuenta:${req.usuario?.id}`,
  esFallo: (res) => res.locals.contrasenaActualIncorrecta === true,
  etiqueta: 'cambio de contraseña',
});
for (const limite of [limiteLogin, limiteCambioContrasena]) setInterval(limite.limpiar, 5 * 60 * 1000).unref();

module.exports = {
  limiteLogin,
  limiteCambioContrasena,
  crearLimiteLogin,
  MENSAJE_DEMASIADOS_INTENTOS,
  VENTANA_MS,
  MAX_FALLOS_POR_USUARIO,
  MAX_FALLOS_POR_IP,
};
