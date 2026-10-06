import { useState } from 'react';
import api from '../services/api';
import { actualizarDatosAdministrativos } from '../services/viajesApi';
import Card from './ui/Card';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import { aInputCordoba } from '../utils/fechaCordoba';
import { capitalizarCatalogo, formatearMonto, formatearSoloFecha } from '../utils/viajeFormato';
import './DatosAdministrativosViaje.css';

const NO_CARGADO = 'No cargado';

const CAMPOS_MONTO = {
  precio: 'El precio',
  pagoChofer: 'El pago al chofer',
};

function viajeAValores(viaje) {
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
function valoresAPayload(valores) {
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
function validarMontos(valores) {
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

function Dato({ etiqueta, children }) {
  return (
    <div className="detalle-item">
      <dt>{etiqueta}</dt>
      <dd>{children ?? NO_CARGADO}</dd>
    </div>
  );
}

// Sección de la ficha de detalle con los datos administrativos/financieros
// del viaje. Es exclusiva de Administrador/Encargado — el que la renderiza
// (Viajes.jsx) es quien decide no montarla para el resto. Funciona en
// cualquier estado del viaje: el backend no restringe por estado.
function DatosAdministrativosViaje({ viaje, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(() => viajeAValores(viaje));
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [estadosPago, setEstadosPago] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  async function abrirEdicion() {
    setValores(viajeAValores(viaje));
    setErrores({});
    setEditando(true);
    // Los catálogos se piden recién al abrir la edición (y solo la primera
    // vez): quien solo mira la ficha no necesita ninguno de los dos.
    if (estadosPago.length === 0) {
      api.get('/estados-pago').then(({ data }) => setEstadosPago(data.estadosPago));
    }
    if (metodosPago.length === 0) {
      api.get('/metodos-pago').then(({ data }) => setMetodosPago(data.metodosPago));
    }
  }

  function cancelarEdicion() {
    setEditando(false);
    setErrores({});
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setValores((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});

    const erroresLocales = validarMontos(valores);
    if (Object.keys(erroresLocales).length > 0) {
      setErrores(erroresLocales);
      return;
    }

    setEnviando(true);
    try {
      const { data } = await actualizarDatosAdministrativos(viaje.id, valoresAPayload(valores));
      setEditando(false);
      onGuardado(data.viaje);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 404) {
        setErrores({ general: 'El viaje ya no existe' });
      } else {
        setErrores({ general: 'No se pudieron guardar los datos administrativos' });
      }
    } finally {
      setEnviando(false);
    }
  }

  const opcionesEstado = estadosPago.map((e) => (
    <option key={e.id} value={e.id}>
      {capitalizarCatalogo(e.descripcion)}
    </option>
  ));
  const opcionesMetodo = metodosPago.map((m) => (
    <option key={m.id} value={m.id}>
      {capitalizarCatalogo(m.descripcion)}
    </option>
  ));

  return (
    <Card className="datos-admin" role="region" aria-label="Datos administrativos">
      <div className="datos-admin-header">
        <h2>Datos administrativos</h2>
        {!editando && (
          <Button variant="secondary" onClick={abrirEdicion}>
            Editar datos administrativos
          </Button>
        )}
      </div>

      {!editando && (
        <>
          <h3 className="datos-admin-grupo">Cobro al cliente</h3>
          <dl className="viajes-detalle-list">
            <Dato etiqueta="Precio">{viaje.precio != null ? formatearMonto(viaje.precio) : null}</Dato>
            <Dato etiqueta="Estado del pago">
              {viaje.estadoPagoCliente ? capitalizarCatalogo(viaje.estadoPagoCliente.descripcion) : null}
            </Dato>
            <Dato etiqueta="Fecha de pago">
              {viaje.fechaPagoCliente ? formatearSoloFecha(viaje.fechaPagoCliente) : null}
            </Dato>
            <Dato etiqueta="Método de pago">
              {viaje.metodoPagoCliente ? capitalizarCatalogo(viaje.metodoPagoCliente.descripcion) : null}
            </Dato>
          </dl>

          <h3 className="datos-admin-grupo">Pago al chofer</h3>
          <dl className="viajes-detalle-list">
            <Dato etiqueta="Monto">{viaje.pagoChofer != null ? formatearMonto(viaje.pagoChofer) : null}</Dato>
            <Dato etiqueta="Estado del pago">
              {viaje.estadoPagoChofer ? capitalizarCatalogo(viaje.estadoPagoChofer.descripcion) : null}
            </Dato>
            <Dato etiqueta="Fecha de pago">
              {viaje.fechaPagoChofer ? formatearSoloFecha(viaje.fechaPagoChofer) : null}
            </Dato>
            <Dato etiqueta="Método de pago">
              {viaje.metodoPagoChofer ? capitalizarCatalogo(viaje.metodoPagoChofer.descripcion) : null}
            </Dato>
          </dl>
        </>
      )}

      {editando && (
        <form onSubmit={handleSubmit} noValidate>
          <h3 className="datos-admin-grupo">Cobro al cliente</h3>
          <div className="form-grid">
            <FormField id="precio" label="Precio ($)" error={errores.precio}>
              <input type="number" name="precio" min="0" step="0.01" value={valores.precio} onChange={handleChange} />
            </FormField>
            <FormField id="estadoPagoClienteId" label="Estado del pago" error={errores.estadoPagoClienteId}>
              <select name="estadoPagoClienteId" value={valores.estadoPagoClienteId} onChange={handleChange}>
                <option value="">Sin definir</option>
                {opcionesEstado}
              </select>
            </FormField>
            <FormField id="fechaPagoCliente" label="Fecha de pago" error={errores.fechaPagoCliente}>
              <input type="date" name="fechaPagoCliente" value={valores.fechaPagoCliente} onChange={handleChange} />
            </FormField>
            <FormField id="metodoPagoClienteId" label="Método de pago" error={errores.metodoPagoClienteId}>
              <select name="metodoPagoClienteId" value={valores.metodoPagoClienteId} onChange={handleChange}>
                <option value="">Sin definir</option>
                {opcionesMetodo}
              </select>
            </FormField>
          </div>

          <h3 className="datos-admin-grupo">Pago al chofer</h3>
          <div className="form-grid">
            <FormField id="pagoChofer" label="Monto ($)" error={errores.pagoChofer}>
              <input type="number" name="pagoChofer" min="0" step="0.01" value={valores.pagoChofer} onChange={handleChange} />
            </FormField>
            <FormField id="estadoPagoChoferId" label="Estado del pago" error={errores.estadoPagoChoferId}>
              <select name="estadoPagoChoferId" value={valores.estadoPagoChoferId} onChange={handleChange}>
                <option value="">Sin definir</option>
                {opcionesEstado}
              </select>
            </FormField>
            <FormField id="fechaPagoChofer" label="Fecha de pago" error={errores.fechaPagoChofer}>
              <input type="date" name="fechaPagoChofer" value={valores.fechaPagoChofer} onChange={handleChange} />
            </FormField>
            <FormField id="metodoPagoChoferId" label="Método de pago" error={errores.metodoPagoChoferId}>
              <select name="metodoPagoChoferId" value={valores.metodoPagoChoferId} onChange={handleChange}>
                <option value="">Sin definir</option>
                {opcionesMetodo}
              </select>
            </FormField>
          </div>

          {errores.general && <Alert variant="error">{errores.general}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Guardando…' : 'Guardar datos'}
            </Button>
            <Button type="button" variant="secondary" onClick={cancelarEdicion} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default DatosAdministrativosViaje;
