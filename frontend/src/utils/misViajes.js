// Vistas y orden de Mis viajes (y de "Tus viajes pendientes" del Dashboard).
//
// - Próximos: arriba de todo el viaje En viaje (a lo sumo uno) y después los
//   Programados, el más próximo primero. Un Programado atrasado (de días
//   anteriores) queda primero, porque es el más viejo.
// - Anteriores: Finalizados y Cancelados, el más reciente primero.
//
// El chofer no ve viajes A confirmar (los filtra el backend), así que no van en
// ninguna de las dos vistas.

export const VISTAS_MIS_VIAJES = {
  proximos: ['EN_VIAJE', 'PROGRAMADO'],
  anteriores: ['FINALIZADO', 'CANCELADO'],
};

// La vista sale de la URL (?tab=anteriores); cualquier otro valor es Próximos.
export const vistaMisViajes = (valor) => (valor === 'anteriores' ? 'anteriores' : 'proximos');

// Por fecha de inicio, 'asc' o 'desc'. Sin fecha de inicio (no debería haber: es
// obligatoria) va al final en los dos sentidos. No modifica el arreglo recibido.
export function ordenarPorInicio(viajes, sentido = 'asc') {
  const signo = sentido === 'desc' ? -1 : 1;
  return [...viajes].sort((a, b) => {
    if (!a.fechaInicio || !b.fechaInicio) return (a.fechaInicio ? 0 : 1) - (b.fechaInicio ? 0 : 1);
    return signo * (Date.parse(a.fechaInicio) - Date.parse(b.fechaInicio));
  });
}

// { enCurso, resto }: los viajes de la vista. `enCurso` (solo en Próximos) va en
// su propio grupo, arriba; `resto` ya viene ordenado para agrupar por día.
export function viajesDeLaVista(viajes, vista) {
  if (vista === 'anteriores') {
    const anteriores = viajes.filter((v) => VISTAS_MIS_VIAJES.anteriores.includes(v.estado));
    return { enCurso: [], resto: ordenarPorInicio(anteriores, 'desc') };
  }
  return {
    enCurso: viajes.filter((v) => v.estado === 'EN_VIAJE'),
    resto: ordenarPorInicio(
      viajes.filter((v) => v.estado === 'PROGRAMADO'),
      'asc'
    ),
  };
}
