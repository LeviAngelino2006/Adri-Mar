// Orden natural por número de interno (que en la base es un string): 2, 3, 10 y
// no "10" antes de "2". Un interno con letras ("A5", "A10") también compara
// por tramos numéricos, y los que no tienen número van al final.
export function ordenarPorInterno(vehiculos) {
  return [...vehiculos].sort((a, b) =>
    String(a.numeroInterno).localeCompare(String(b.numeroInterno), 'es', { numeric: true })
  );
}
