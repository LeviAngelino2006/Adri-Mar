const { verificarToken, generarToken } = require('../services/tokenService');
const { buscarSesion } = require('../services/sesionService');

const SESION_NO_VALIDA = 'Tu sesión ya no es válida. Iniciá sesión de nuevo.';

// Contraseña provisoria (H11): la cuenta tiene una contraseña que definió un
// gestor y su dueño todavía no la cambió. Hasta entonces solo puede leer su
// sesión y cambiar la contraseña; todo lo demás responde 403 con este código,
// que el front reconoce para llevarla a "Cambiar contraseña". Se decide acá y en
// ningún otro lado: cualquier ruta nueva que use autenticar queda bloqueada.
const DEBE_CAMBIAR_CONTRASENA = 'DEBE_CAMBIAR_CONTRASENA';
const PERMITIDAS_CON_CONTRASENA_PROVISORIA = new Set(['GET /api/auth/me', 'PUT /api/auth/contrasena']);

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let payload;
  try {
    payload = verificarToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  // Desde la separación personas/usuarios, el chofer de un viaje es una
  // PERSONA y se compara con el personaId del token. Un token emitido antes no
  // lo trae: en vez de caer al id de usuario (que no es el mismo número), se
  // pide volver a iniciar sesión. Va antes de renovar, para no reemitirlo.
  if (!Number.isInteger(payload.personaId) || payload.personaId <= 0) {
    return res.status(401).json({ error: 'Tu sesión es de una versión anterior del sistema. Iniciá sesión de nuevo.' });
  }

  // La firma solo prueba que el token es nuestro. Si desde que se emitió la
  // cuenta se bloqueó o la persona se dio de baja, la sesión termina acá y el
  // token no se renueva. Perfil y habilitación salen de la base: un cambio de
  // perfil vale desde el próximo pedido, no desde el próximo inicio de sesión.
  const sesion = await buscarSesion(payload);
  if (!sesion) {
    return res.status(401).json({ error: SESION_NO_VALIDA });
  }

  req.usuario = sesion;

  // Renueva el token en cada petición autenticada: el backend responde con
  // uno nuevo y el frontend reemplaza el anterior, extendiendo la sesión
  // mientras haya actividad. Lleva los datos actuales de la base, así el front
  // se entera si cambió el perfil o la habilitación.
  res.setHeader('X-Renewed-Token', generarToken(sesion));

  // Después de renovar: la sesión sigue viva mientras cambia la contraseña.
  if (sesion.debeCambiarContrasena && !PERMITIDAS_CON_CONTRASENA_PROVISORIA.has(`${req.method} ${req.baseUrl}${req.path}`)) {
    return res.status(403).json({
      error: 'Tenés que cambiar tu contraseña antes de seguir.',
      codigo: DEBE_CAMBIAR_CONTRASENA,
    });
  }

  next();
}

function autorizar(...perfilesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !perfilesPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }

    next();
  };
}

module.exports = { autenticar, autorizar, SESION_NO_VALIDA, DEBE_CAMBIAR_CONTRASENA, PERMITIDAS_CON_CONTRASENA_PROVISORIA };
