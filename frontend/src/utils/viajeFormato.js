export function formatearFechaHora(valor) {
  // Se fuerza la zona horaria de Córdoba (la única en la que opera Adri-mar)
  // para que la hora mostrada no dependa de la zona horaria del navegador de
  // quien esté mirando la pantalla.
  return new Date(valor).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nombreChofer(chofer) {
  return `${chofer.nombre} ${chofer.apellido}`;
}

export function nombreVehiculo(vehiculo) {
  return `${vehiculo.numeroInterno} - ${vehiculo.dominio}`;
}
