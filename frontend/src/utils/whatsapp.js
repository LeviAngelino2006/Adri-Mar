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

// Saca el "15" que se intercala entre la característica y el abonado en el
// discado local de celulares ("03571 15 612345"). Con el número ya sin
// separadores no se sabe de cuántos dígitos es la característica (2 en "11", 3 o
// 4 en el resto), así que se prueba el "15" tras los primeros 2, 3 y 4 dígitos:
// si cae en una sola posición se saca; si cae en más de una (o en ninguna) NO se
// elige: se devuelve null y se pide corregir el número.
//
// En la práctica la única forma de que dos posiciones coincidan es "…1515…"
// (tras 2 y tras 4 dígitos), que además daría el mismo número final. Igual se trata
// como ambiguo a propósito: ante la duda es preferible no mandar el aviso a que
// llegue a un número equivocado.
function sacarQuince(digitos12) {
  const posiciones = [2, 3, 4].filter((posicion) => digitos12.slice(posicion, posicion + 2) === '15');
  if (posiciones.length !== 1) return null;

  const [posicion] = posiciones;
  return digitos12.slice(0, posicion) + digitos12.slice(posicion + 2);
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
// dígitos; o el "15" cae en más de una posición posible (ver sacarQuince).
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
    digitos = sacarQuince(digitos);
    if (digitos === null) return null;
  }

  if (digitos.length !== 10) return null;
  if (!/^(11|[23]\d)/.test(digitos)) return null;

  return PREFIJO_MOVIL_AR + digitos;
}

export function urlWhatsApp(telefonoNormalizado, mensaje) {
  return `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
}

const FORMATO_DIA_MES = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba',
  day: '2-digit',
  month: '2-digit',
});
const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "20/10 · 08:00 a 12:30". Si el viaje termina otro día, el fin lleva su fecha:
// "20/10 · 22:00 a 21/10 06:00". Todo en hora de Córdoba.
function horarioDelViaje(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  const desde = `${FORMATO_DIA_MES.format(inicio)} · ${FORMATO_HORA.format(inicio)}`;
  if (!fechaFin) return desde;

  const fin = new Date(fechaFin);
  const mismoDia = fechaCordobaISO(fechaInicio) === fechaCordobaISO(fechaFin);
  const hasta = mismoDia ? FORMATO_HORA.format(fin) : `${FORMATO_DIA_MES.format(fin)} ${FORMATO_HORA.format(fin)}`;
  return `${desde} a ${hasta}`;
}

// El texto que se le manda al chofer. Las líneas cuyo dato no está (cliente,
// vehículo, pasajeros, recorrido, link) se omiten en vez de salir vacías. Va
// con emojis porque es un mensaje de WhatsApp (el sistema visual de la app, que
// no los usa, no aplica acá).
//
//   Hola Ana! Te confirmo el viaje:
//   📅 20/10 · 08:00 a 12:30
//   🚌 Interno 12 (AE452KD)
//   📍 Río Tercero → Alta Gracia → Córdoba
//   👥 45 pasajeros
//   Cliente: ACME
//   🗺️ Ver recorrido en Google Maps:
//   https://www.google.com/maps/dir/?api=1&…
export function armarMensajeViaje(viaje) {
  const paradas = (viaje.paradas ?? []).map((parada) => parada.ubicacion);

  const lineas = [`Hola ${viaje.chofer.nombre}! Te confirmo el viaje:`];

  lineas.push(`📅 ${horarioDelViaje(viaje.fechaInicio, viaje.fechaFin)}`);

  if (viaje.vehiculo) {
    lineas.push(`🚌 Interno ${viaje.vehiculo.numeroInterno} (${viaje.vehiculo.dominio})`);
  }

  if (viaje.origen && viaje.destino) {
    const puntos = [viaje.origen, ...paradas, viaje.destino].map((punto) => punto.nombre);
    lineas.push(`📍 ${puntos.join(' → ')}`);
  }

  const pasajeros = viaje.cantidadPasajeros;
  if (pasajeros !== null && pasajeros !== undefined && pasajeros !== '') {
    lineas.push(`👥 ${pasajeros} ${Number(pasajeros) === 1 ? 'pasajero' : 'pasajeros'}`);
  }

  if (viaje.cliente?.nombre) lineas.push(`Cliente: ${viaje.cliente.nombre}`);

  const enlaceMapa = urlRecorrido({ origen: viaje.origen, paradas, destino: viaje.destino });
  if (enlaceMapa) lineas.push(`🗺️ Ver recorrido en Google Maps:\n${enlaceMapa}`);

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
