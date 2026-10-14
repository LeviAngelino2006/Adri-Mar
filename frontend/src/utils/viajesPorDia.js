// Agrupa el listado de Viajes y Mis viajes por día de inicio (día de Córdoba).
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { fechaCordobaISO } from './fechaCordoba.js';
import { tituloDiaViajes } from './viajeFormato.js';

// [{ dia: 'YYYY-MM-DD', titulo: 'Hoy · vie 9 oct', viajes }]. Los grupos salen en
// el orden en que llegan los viajes (el backend los manda del más reciente al más
// viejo) y dentro de cada día se respeta ese mismo orden: solo se corta la lista
// donde cambia el día. Un viaje sin fecha de inicio (no debería haber: es
// obligatoria) va a un grupo "Sin fecha" en vez de romper la pantalla.
export function agruparViajesPorDia(viajes, ahora = Date.now()) {
  const grupos = [];
  const porDia = new Map();

  for (const viaje of viajes) {
    const dia = viaje.fechaInicio ? fechaCordobaISO(viaje.fechaInicio) : null;
    let grupo = porDia.get(dia);
    if (!grupo) {
      grupo = { dia, titulo: dia ? tituloDiaViajes(dia, ahora) : 'Sin fecha', viajes: [] };
      porDia.set(dia, grupo);
      grupos.push(grupo);
    }
    grupo.viajes.push(viaje);
  }

  return grupos;
}
