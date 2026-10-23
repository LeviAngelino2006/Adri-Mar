// Estado del service preventivo de un vehículo. Único cálculo: lo usan la
// pestaña Service (GET /mantenimientos/planes), el historial de un vehículo y
// la advertencia al planificar un viaje. Función pura, sin Prisma.
//
// El km del próximo service y el estado no se guardan: salen de
// kmUltimoService y de la plantilla del tipo de vehículo (intervaloKm y
// porcentajeAviso). Así, si cambia el intervalo de una plantilla, todos los
// planes quedan al día sin migrar nada.
//
// Estados:
//  - AL_DIA:  todavía no llegó al aviso.
//  - PROXIMO: recorrió el porcentajeAviso del intervalo (95 %: un colectivo
//             cada 20.000 km avisa a los 19.000 km desde su último service).
//  - VENCIDO: recorrió el intervalo completo.
const PORCENTAJE_AVISO_POR_DEFECTO = 95;

function calcularEstadoService({ kilometraje, kmUltimoService, intervaloKm, porcentajeAviso = PORCENTAJE_AVISO_POR_DEFECTO }) {
  // Un último service cargado por encima del odómetro no debería pasar (el
  // service actualiza el odómetro), pero si pasa no se cuentan km negativos.
  const kmDesdeService = Math.max(0, kilometraje - kmUltimoService);
  const kmAviso = Math.floor((intervaloKm * porcentajeAviso) / 100);
  const kmProximoService = kmUltimoService + intervaloKm;

  let estado = 'AL_DIA';
  if (kmDesdeService >= intervaloKm) estado = 'VENCIDO';
  else if (kmDesdeService >= kmAviso) estado = 'PROXIMO';

  return {
    estado,
    kmDesdeService,
    kmProximoService,
    // km desde el último service a partir de los cuales pasa a PROXIMO.
    kmAviso,
    kmRestantes: Math.max(0, kmProximoService - kilometraje),
    kmExcedidos: Math.max(0, kilometraje - kmProximoService),
    // Fracción del intervalo recorrida (0,5 = la mitad): ordena por urgencia
    // sin favorecer a los intervalos cortos. 900 km restantes son el 4,5 % de
    // un colectivo pero el 9 % de un utilitario.
    porcentajeConsumido: intervaloKm > 0 ? kmDesdeService / intervaloKm : 0,
  };
}

module.exports = { calcularEstadoService, PORCENTAJE_AVISO_POR_DEFECTO };
