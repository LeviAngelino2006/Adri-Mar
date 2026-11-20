// Aviso por WhatsApp al chofer asignado de un viaje: normaliza el teléfono (que
// en la base es un texto libre) y arma el texto del mensaje. El link wa.me lo
// arma el componente (AvisarPorWhatsApp) con encodeURIComponent.
//
// Los imports llevan la extensión .js a propósito: así los tests (node --test)
// los resuelven igual que Vite.

import { fechaCordobaISO } from './fechaCordoba.js';
import { urlRecorrido } from './googleMaps.js';
import { formatearFechaConDia, formatearHora } from './viajeFormato.js';

export const MOTIVO_SIN_CHOFER = 'El viaje no tiene chofer asignado';
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
// Acepta, con espacios, guiones (también el largo "–" o "—" que queda al pegar
// desde otro programa), puntos o paréntesis en cualquier lado:
//  - con "+54", "0054" o "54", con o sin el 9 de celular ("+54 9 3571 61-2345",
//    "+54 3571 612345"), e incluso con el 9 y además el 0 o el 15 del discado
//    nacional ("+54 9 0351 412-3456", "+54 9 3571 15 612345");
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
  if (/[^\d\s\-‐-―.()+]/.test(crudo)) return null;
  if (crudo.lastIndexOf('+') > 0) return null;

  let digitos = crudo.replace(/\D/g, '');

  const internacional = crudo.startsWith('+') || digitos.startsWith('00');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (internacional && !digitos.startsWith('54')) return null;
  // Ninguna característica argentina empieza con 5, así que un 54 inicial siempre
  // es el país.
  if (digitos.startsWith('54')) digitos = digitos.slice(2);

  // Ninguna característica empieza con 9 ni con 0: un 9 inicial es siempre el de
  // celular del formato internacional, y un 0, el del discado nacional. Se sacan
  // en ese orden porque hay quien escribe los dos ("+54 9 0351 …"). Recién
  // después se busca el 15, que también puede venir junto al 9.
  if (digitos.startsWith('9')) digitos = digitos.slice(1);
  if (digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.length === 12) {
    const interpretaciones = interpretacionesSinQuince(digitos);
    if (interpretaciones.length !== 1) return null;
    [digitos] = interpretaciones;
  }

  if (digitos.length !== 10) return null;
  if (!/^(11|[23]\d)/.test(digitos)) return null;

  return PREFIJO_MOVIL_AR + digitos;
}

const hayDato = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== '';

// Paradas intermedias en el orden del recorrido. La API ya las manda ordenadas;
// se ordena igual por `orden` (si viene) para no depender de eso.
function paradasEnOrden(paradas) {
  return [...(paradas ?? [])]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((parada) => parada.ubicacion)
    .filter(Boolean);
}

// "12:30", o "06:00 del miércoles 21/10/2026" si el viaje termina otro día (todo
// en hora de Córdoba).
function horaDeFin(fechaInicio, fechaFin) {
  const hora = formatearHora(fechaFin);
  if (fechaInicio && fechaCordobaISO(fechaInicio) !== fechaCordobaISO(fechaFin)) {
    return `${hora} del ${formatearFechaConDia(fechaFin)}`;
  }
  return hora;
}

// El texto que se le manda al chofer asignado: un saludo corto y debajo un dato
// por línea, con la etiqueta en negrita de WhatsApp (*Etiqueta:*). Es una función
// pura: no sabe de links ni de teléfonos.
//
// NO lleva emojis: los que están fuera del plano básico de Unicode (como 📅 o 🚌)
// llegan como "�" en WhatsApp Desktop de Windows al abrir el link wa.me. Los
// acentos sí se ven bien.
//
// Los datos que no están cargados (paradas, pasajeros, hora de fin y, en un
// viaje incompleto, cualquier otro) se omiten: nunca sale "No cargado" ni una
// línea vacía.
//
//   Hola Ana, te paso los datos de tu viaje:
//
//   *Fecha:* martes 20/10/2026
//   *Hora de inicio:* 08:00
//   *Hora estimada de fin:* 12:30
//   *Origen:* Río Tercero
//   *Parada 1:* Alta Gracia
//   *Parada 2:* Museo del Kempes
//   *Destino:* Córdoba
//   *Cliente:* ACME
//   *Pasajeros:* 45
//   *Vehículo:* Interno 12, patente AE452KD
//   *Recorrido en Google Maps:* https://www.google.com/maps/dir/?api=1&…
export function armarMensajeWhatsApp(viaje) {
  const paradas = paradasEnOrden(viaje.paradas);
  const lineas = [];
  const agregar = (etiqueta, valor) => {
    if (hayDato(valor)) lineas.push(`*${etiqueta}:* ${String(valor).trim()}`);
  };

  if (viaje.fechaInicio) {
    agregar('Fecha', formatearFechaConDia(viaje.fechaInicio));
    agregar('Hora de inicio', formatearHora(viaje.fechaInicio));
  }
  if (viaje.fechaFin) agregar('Hora estimada de fin', horaDeFin(viaje.fechaInicio, viaje.fechaFin));

  agregar('Origen', viaje.origen?.nombre);
  paradas.forEach((ubicacion, indice) => agregar(`Parada ${indice + 1}`, ubicacion.nombre));
  agregar('Destino', viaje.destino?.nombre);
  agregar('Cliente', viaje.cliente?.nombre);
  agregar('Pasajeros', viaje.cantidadPasajeros);

  if (viaje.vehiculo) {
    const { numeroInterno, dominio } = viaje.vehiculo;
    const partes = [hayDato(numeroInterno) && `Interno ${numeroInterno}`, hayDato(dominio) && `patente ${dominio}`];
    agregar('Vehículo', partes.filter(Boolean).join(', '));
  }

  // El mismo link que abre el botón "Ver recorrido" de la ficha.
  agregar('Recorrido en Google Maps', urlRecorrido({ origen: viaje.origen, paradas, destino: viaje.destino }));

  const nombre = viaje.chofer?.nombre?.trim();
  const saludo = nombre ? `Hola ${nombre}, te paso los datos de tu viaje:` : 'Hola, te paso los datos de tu viaje:';
  return [saludo, '', ...lineas].join('\n');
}

// Lo que necesita el botón: o bien el teléfono normalizado y el mensaje
// ({ telefono, mensaje }), o bien el motivo por el que no se puede avisar
// ({ motivo }). Se le manda solo al chofer asignado: sin chofer no hay aviso. Sin
// teléfono cargado y con un teléfono que no se entiende son motivos distintos,
// porque se corrigen distinto.
export function avisoWhatsApp(viaje) {
  if (!viaje?.chofer) return { motivo: MOTIVO_SIN_CHOFER };

  const { telefono } = viaje.chofer;
  if (!hayDato(telefono)) return { motivo: MOTIVO_SIN_TELEFONO };

  const normalizado = normalizarTelefonoAR(telefono);
  if (!normalizado) return { motivo: MOTIVO_TELEFONO_INVALIDO };

  return { telefono: normalizado, mensaje: armarMensajeWhatsApp(viaje) };
}

// Si el viaje tiene un aviso posible: chofer asignado con un teléfono utilizable.
export function puedeAvisarPorWhatsApp(viaje) {
  return !avisoWhatsApp(viaje).motivo;
}
