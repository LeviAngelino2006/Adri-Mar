// La sesión la decide el backend en cada pedido (perfil y habilitación salen de
// la base). El front se entera de dos maneras:
// - 401: la cuenta se bloqueó o la persona se dio de baja → vuelve al login con
//   MENSAJE_SESION_VENCIDA.
// - El token renovado (X-Renewed-Token) trae otro perfil u otra habilitación
//   que el usuario guardado → hay que refrescarlo, así el menú y las rutas se
//   actualizan sin volver a iniciar sesión.

export const MENSAJE_SESION_VENCIDA = 'Tu sesión venció. Iniciá sesión de nuevo.';

// El payload de un JWT, sin verificar la firma (eso lo hace el backend): acá
// solo se lee qué perfil trae. null si el token no tiene la forma esperada.
export function payloadDelToken(token) {
  try {
    const parte = token.split('.')[1];
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// ¿El token renovado dice otra cosa que el usuario guardado? Solo importan el
// perfil y la habilitación para conducir: son los que deciden el menú y las rutas.
export function cambioLaSesion(usuarioGuardado, payload) {
  if (!usuarioGuardado || !payload) return false;
  return (
    usuarioGuardado.perfil !== payload.perfil ||
    Boolean(usuarioGuardado.habilitadoParaConducir) !== Boolean(payload.habilitadoParaConducir)
  );
}
