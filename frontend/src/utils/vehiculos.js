const tieneNumero = (vehiculo) => /\d/.test(String(vehiculo.numeroInterno));

// Orden natural por número de interno (que en la base es un string): 2, 3, 10 y
// no "10" antes de "2". Un interno con letras ("A5", "A10") también compara
// por tramos numéricos. Los internos sin ningún número ("S/N", "-") van al final.
export function ordenarPorInterno(vehiculos) {
  return [...vehiculos].sort((a, b) => {
    const conNumeroA = tieneNumero(a);
    const conNumeroB = tieneNumero(b);
    if (conNumeroA !== conNumeroB) return conNumeroA ? -1 : 1;
    return String(a.numeroInterno).localeCompare(String(b.numeroInterno), 'es', { numeric: true });
  });
}
