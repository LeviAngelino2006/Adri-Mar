// Aviso por WhatsApp al chofer cuando se confirma un viaje: normaliza el teléfono
// (que en la base es un texto libre), arma el mensaje y el link wa.me.
//
// Los imports llevan la extensión .js a propósito: así los tests (node --test)
// los resuelven igual que Vite.

import { fechaCordobaISO } from './fechaCordoba.js';
import { urlRecorrido } from './googleMaps.js';

export const MOTIVO_SIN_TELEFONO = 'El chofer no tiene teléfono cargado';
export const MOTIVO_TELEFONO_INVALIDO =
  'El teléfono del chofer no tiene un formato válido. Corregilo en Usuarios.';

// 54 es el país; el 9 intermedio es el que marca a un celular en el formato
// internacional ("+54 9 …"), y reemplaza al "0" de discado nacional y al "15".
const PREFIJO_MOVIL_AR = '549';

// Los números de 10 dígitos que resultan de sacar el "15" que se intercala entre la
// característica y el abonado en el discado local de celulares ("03571 15
// 612345"). Con el número ya sin separadores no se sabe de cuántos dígitos es la
// característica (2 en "11", 3 o 4 en el resto), así que se prueba el "15" tras los
// primeros 2, 3 y 4 dígitos y se junta el resultado de cada posición posible, sin
// repetidos.
//
// Con UN solo resultado la interpretación es segura: es el número. Con ninguno no
// hay 15 donde debería, y con varios resultados DISTINTOS sería adivinar. En la
// práctica las posiciones solo pueden coincidir en "…1515…" (tras 2 y tras 4
// dígitos), y ahí las dos dan el mismo número, así que se acepta.
export function interpretacionesSinQuince(digitos12) {
  const resultados = [2, 3, 4]
    .filter((posicion) => digitos12.slice(posicion, posicion + 2) === '15')
    .map((posicion) => digitos12.slice(0, posicion) + digitos12.slice(posicion + 2));

  return [...new Set(resultados)];
}

// Texto libre → número para wa.me ("5493571612345": solo dígitos, con 549), o
// null si no se puede normalizar con certeza. Nunca adivina.
//
// Acepta, con espacios, guiones, puntos o paréntesis en cualquier lado:
//  - con "+54", "0054" o "54", con o sin el 9 de celular ("+54 9 3571 61-2345",
//    "+54 3571 612345");
//  - discado nacional, con el 0 inicial y con o sin el 15 ("03571 15 612345",
//    "3571612345", "011 15 1234-5678").
//
// Devuelve null si: está vacío; trae algo que no sea dígitos y separadores (letras
// o "int 12", "/" entre dos números); es de otro país; falta la característica
// ("15 612345", "612345"); la característica no existe en Argentina (las de 2
// dígitos son solo "11", el resto empieza con 2 o 3); la longitud no cierra en 10
// dígitos; o el "15" cae en varias posiciones posibles y las interpretaciones dan
// números distintos (ver interpretacionesSinQuince).
export function normalizarTelefonoAR(texto) {
  if (texto === null || texto === undefined) return null;

  const crudo = String(texto).trim();
  if (crudo === '') return null;
  if (/[^\d\s\-.()+]/.test(crudo)) return null;
  if (crudo.lastIndexOf('+') > 0) return null;

  let digitos = crudo.replace(/\D/g, '');

  const internacional = crudo.startsWith('+') || digitos.startsWith('00');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (internacional && !digitos.startsWith('54')) return null;
  // Ninguna característica argentina empieza con 5, así que un 54 inicial siempre
  // es el país.
  if (digitos.startsWith('54')) digitos = digitos.slice(2);

  if (digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.length === 11 && digitos.startsWith('9')) digitos = digitos.slice(1);
  if (digitos.length === 12) {
    const interpretaciones = interpretacionesSinQuince(digitos);
    if (interpretaciones.length !== 1) return null;
    [digitos] = interpretaciones;
  }

  if (digitos.length !== 10) return null;
  if (!/^(11|[23]\d)/.test(digitos)) return null;

  return PREFIJO_MOVIL_AR + digitos;
}

export function urlWhatsApp(telefonoNormalizado, mensaje) {
  return `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
}

const ZONA_CORDOBA = 'America/Argentina/Cordoba';
const FORMATO_DIA_MES = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_CORDOBA, day: '2-digit', month: '2-digit' });
const FORMATO_DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_CORDOBA, weekday: 'long' });
const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_CORDOBA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "martes", en minúscula y en hora de Córdoba.
const diaDeLaSemana = (fecha) => FORMATO_DIA_SEMANA.format(fecha).toLowerCase();

// "08:00 a 12:30". Si el viaje termina otro día, cada hora lleva su fecha:
// "22:00 del 20/10 a 06:00 del 21/10". Sin hora de fin queda solo la de salida.
// Todo en hora de Córdoba.
function horarioDelViaje(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  if (!fechaFin) return FORMATO_HORA.format(inicio);

  const fin = new Date(fechaFin);
  if (fechaCordobaISO(fechaInicio) === fechaCordobaISO(fechaFin)) {
    return `${FORMATO_HORA.format(inicio)} a ${FORMATO_HORA.format(fin)}`;
  }
  return `${FORMATO_HORA.format(inicio)} del ${FORMATO_DIA_MES.format(inicio)} a ${FORMATO_HORA.format(fin)} del ${FORMATO_DIA_MES.format(fin)}`;
}

// El texto que se le manda al chofer. Usa las negritas de WhatsApp (*así*) y NO
// lleva emojis: los que están fuera del plano básico de Unicode (como 📅 o 🚌)
// llegan como "�" en WhatsApp Desktop de Windows al abrir el link wa.me. La flecha
// → y los acentos sí se ven bien. Las líneas cuyo dato falta (vehículo,
// recorrido, pasajeros, cliente, link) se omiten en vez de salir vacías.
//
//   Hola Ana, te confirmo el viaje del *martes 20/10*.
//
//   *Horario:* 08:00 a 12:30
//   *Vehículo:* Interno 12 (AE452KD)
//   *Recorrido:* Río Tercero → Córdoba
//   *Pasajeros:* 45
//   *Cliente:* ACME
//
//   Ver el recorrido en el mapa:
//   https://www.google.com/maps/dir/?api=1&…
//
// Con paradas el recorrido va en vertical, el origen y después cada punto en su
// línea con "→ " adelante:
//
//   *Recorrido:*
//   Río Tercero
//   → Alta Gracia
//   → Córdoba
export function armarMensajeViaje(viaje) {
  const paradas = (viaje.paradas ?? []).map((parada) => parada.ubicacion);
  const salida = new Date(viaje.fechaInicio);

  const lineas = [
    `Hola ${viaje.chofer.nombre}, te confirmo el viaje del *${diaDeLaSemana(salida)} ${FORMATO_DIA_MES.format(salida)}*.`,
    '',
    `*Horario:* ${horarioDelViaje(viaje.fechaInicio, viaje.fechaFin)}`,
  ];

  if (viaje.vehiculo) {
    lineas.push(`*Vehículo:* Interno ${viaje.vehiculo.numeroInterno} (${viaje.vehiculo.dominio})`);
  }

  if (viaje.origen && viaje.destino) {
    if (paradas.length === 0) {
      lineas.push(`*Recorrido:* ${viaje.origen.nombre} → ${viaje.destino.nombre}`);
    } else {
      lineas.push('*Recorrido:*', viaje.origen.nombre);
      for (const punto of [...paradas, viaje.destino]) lineas.push(`→ ${punto.nombre}`);
    }
  }

  const pasajeros = viaje.cantidadPasajeros;
  if (pasajeros !== null && pasajeros !== undefined && pasajeros !== '') {
    lineas.push(`*Pasajeros:* ${pasajeros}`);
  }

  if (viaje.cliente?.nombre) lineas.push(`*Cliente:* ${viaje.cliente.nombre}`);

  const enlaceMapa = urlRecorrido({ origen: viaje.origen, paradas, destino: viaje.destino });
  if (enlaceMapa) lineas.push('', 'Ver el recorrido en el mapa:', enlaceMapa);

  return lineas.join('\n');
}

// Lo que necesita el botón: o bien el link ({ url }) o bien el motivo por el que
// no se puede avisar ({ motivo }). Sin teléfono cargado y con un teléfono que no se
// entiende son motivos distintos, porque se corrigen distinto.
export function avisoWhatsApp(viaje) {
  const telefono = viaje?.chofer?.telefono;
  if (telefono === null || telefono === undefined || String(telefono).trim() === '') {
    return { motivo: MOTIVO_SIN_TELEFONO };
  }

  const normalizado = normalizarTelefonoAR(telefono);
  if (!normalizado) return { motivo: MOTIVO_TELEFONO_INVALIDO };

  return { url: urlWhatsApp(normalizado, armarMensajeViaje(viaje)) };
}
