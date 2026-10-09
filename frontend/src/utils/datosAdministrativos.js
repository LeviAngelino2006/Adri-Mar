import { useState } from 'react';
import api from '../services/api';
import { aInputCordoba } from './fechaCordoba';

// Valores de un formulario de datos administrativos (todo como string, así se
// pueden enlazar directo a inputs y selects controlados).
export const VALORES_ADMIN_VACIOS = {
  precio: '',
  estadoPagoClienteId: '',
  fechaPagoCliente: '',
  metodoPagoClienteId: '',
  pagoChofer: '',
  estadoPagoChoferId: '',
  fechaPagoChofer: '',
  metodoPagoChoferId: '',
};

export const CAMPOS_ADMINISTRATIVOS = Object.keys(VALORES_ADMIN_VACIOS);

const CAMPOS_MONTO = {
  precio: 'El precio',
  pagoChofer: 'El pago al chofer',
};

export function viajeAValores(viaje) {
  return {
    precio: viaje.precio == null ? '' : String(viaje.precio),
    estadoPagoClienteId: viaje.estadoPagoClienteId ?? '',
    fechaPagoCliente: viaje.fechaPagoCliente ? aInputCordoba(viaje.fechaPagoCliente).slice(0, 10) : '',
    metodoPagoClienteId: viaje.metodoPagoClienteId ?? '',
    pagoChofer: viaje.pagoChofer == null ? '' : String(viaje.pagoChofer),
    estadoPagoChoferId: viaje.estadoPagoChoferId ?? '',
    fechaPagoChofer: viaje.fechaPagoChofer ? aInputCordoba(viaje.fechaPagoChofer).slice(0, 10) : '',
    metodoPagoChoferId: viaje.metodoPagoChoferId ?? '',
  };
}

// Un campo vacío del formulario se manda como `null` explícito (borra el
// dato), nunca como ''. El backend (actualizarDatosAdministrativos) trata '' como un valor —
// Number('') daría 0 en un monto— y una fecha sola ("YYYY-MM-DD") no la
// acepta (aFechaCordoba espera hora), por eso se completa con T00:00 (hora de
// Córdoba).
export function valoresAPayload(valores) {
  const monto = (v) => (v === '' ? null : Number(v));
  const id = (v) => (v === '' ? null : Number(v));
  const fecha = (v) => (v === '' ? null : `${v}T00:00`);

  return {
    precio: monto(valores.precio),
    estadoPagoClienteId: id(valores.estadoPagoClienteId),
    fechaPagoCliente: fecha(valores.fechaPagoCliente),
    metodoPagoClienteId: id(valores.metodoPagoClienteId),
    pagoChofer: monto(valores.pagoChofer),
    estadoPagoChoferId: id(valores.estadoPagoChoferId),
    fechaPagoChofer: fecha(valores.fechaPagoChofer),
    metodoPagoChoferId: id(valores.metodoPagoChoferId),
  };
}

// Mismo criterio que validarFormatoMonto del backend (no negativo, número
// finito), para avisar al instante sin esperar el roundtrip.
export function validarMontos(valores) {
  const errores = {};
  for (const [campo, etiqueta] of Object.entries(CAMPOS_MONTO)) {
    const valor = valores[campo];
    if (valor === '') continue;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) {
      errores[campo] = `${etiqueta} debe ser un número mayor o igual a 0`;
    }
  }
  return errores;
}

export function hayDatosAdministrativos(valores) {
  return CAMPOS_ADMINISTRATIVOS.some((campo) => valores[campo] !== '');
}

// Catálogos de estado y método de pago (los ids que espera el backend). Se
// piden recién cuando hacen falta (`cargarCatalogos`) y solo la primera vez:
// quien no abre la edición o la sección no los necesita.
export function useCatalogosPago() {
  const [estadosPago, setEstadosPago] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  function cargarCatalogos() {
    if (estadosPago.length === 0) {
      api.get('/estados-pago').then(({ data }) => setEstadosPago(data.estadosPago));
    }
    if (metodosPago.length === 0) {
      api.get('/metodos-pago').then(({ data }) => setMetodosPago(data.metodosPago));
    }
  }

  return { estadosPago, metodosPago, cargarCatalogos };
}
