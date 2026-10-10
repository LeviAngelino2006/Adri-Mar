import { useState } from 'react';
import { actualizarDatosAdministrativos } from '../services/viajesApi';
import Card from './ui/Card';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import OpcionesCatalogo from './ui/OpcionesCatalogo';
import { useCatalogosPago, valoresAPayload, validarMontos, viajeAValores } from '../utils/datosAdministrativos';
import { capitalizarCatalogo, formatearFechaCorta, formatearMonto } from '../utils/viajeFormato';
import './DatosAdministrativosViaje.css';

const NO_CARGADO = 'No cargado';

function Dato({ etiqueta, ancho = false, children }) {
  return (
    <div className={ancho ? 'detalle-item detalle-item-ancho' : 'detalle-item'}>
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
  const { estadosPago, metodosPago, cargarCatalogos } = useCatalogosPago();

  async function abrirEdicion() {
    setValores(viajeAValores(viaje));
    setErrores({});
    setEditando(true);
    // Los catálogos se piden recién al abrir la edición (y solo la primera
    // vez): quien solo mira la ficha no necesita ninguno de los dos.
    cargarCatalogos();
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

  return (
    <Card className="detalle-card datos-admin" role="region" aria-label="Datos administrativos">
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
          <section className="detalle-seccion">
            <h3 className="detalle-seccion-titulo">Cobro al cliente</h3>
            <dl className="detalle-grid">
              <Dato etiqueta="Precio" ancho>
                {viaje.precio != null ? formatearMonto(viaje.precio) : null}
              </Dato>
              <Dato etiqueta="Estado del pago">
                {viaje.estadoPagoCliente ? capitalizarCatalogo(viaje.estadoPagoCliente.descripcion) : null}
              </Dato>
              <Dato etiqueta="Fecha de pago">
                {viaje.fechaPagoCliente ? formatearFechaCorta(viaje.fechaPagoCliente) : null}
              </Dato>
              <Dato etiqueta="Método de pago" ancho>
                {viaje.metodoPagoCliente ? capitalizarCatalogo(viaje.metodoPagoCliente.descripcion) : null}
              </Dato>
            </dl>
          </section>

          <section className="detalle-seccion">
            <h3 className="detalle-seccion-titulo">Pago al chofer</h3>
            <dl className="detalle-grid">
              <Dato etiqueta="Monto" ancho>
                {viaje.pagoChofer != null ? formatearMonto(viaje.pagoChofer) : null}
              </Dato>
              <Dato etiqueta="Estado del pago">
                {viaje.estadoPagoChofer ? capitalizarCatalogo(viaje.estadoPagoChofer.descripcion) : null}
              </Dato>
              <Dato etiqueta="Fecha de pago">
                {viaje.fechaPagoChofer ? formatearFechaCorta(viaje.fechaPagoChofer) : null}
              </Dato>
              <Dato etiqueta="Método de pago" ancho>
                {viaje.metodoPagoChofer ? capitalizarCatalogo(viaje.metodoPagoChofer.descripcion) : null}
              </Dato>
            </dl>
          </section>
        </>
      )}

      {editando && (
        <form onSubmit={handleSubmit} noValidate>
          <section className="detalle-seccion">
            <h3 className="detalle-seccion-titulo">Cobro al cliente</h3>
            <div className="form-grid">
              <FormField id="precio" label="Precio ($)" error={errores.precio}>
                <input type="number" name="precio" min="0" step="0.01" value={valores.precio} onChange={handleChange} />
              </FormField>
              <FormField id="estadoPagoClienteId" label="Estado del pago" error={errores.estadoPagoClienteId}>
                <select name="estadoPagoClienteId" value={valores.estadoPagoClienteId} onChange={handleChange}>
                  <option value="">Sin definir</option>
                  <OpcionesCatalogo items={estadosPago} />
                </select>
              </FormField>
              <FormField id="fechaPagoCliente" label="Fecha de pago" error={errores.fechaPagoCliente}>
                <input type="date" name="fechaPagoCliente" value={valores.fechaPagoCliente} onChange={handleChange} />
              </FormField>
              <FormField id="metodoPagoClienteId" label="Método de pago" error={errores.metodoPagoClienteId}>
                <select name="metodoPagoClienteId" value={valores.metodoPagoClienteId} onChange={handleChange}>
                  <option value="">Sin definir</option>
                  <OpcionesCatalogo items={metodosPago} />
                </select>
              </FormField>
            </div>
          </section>

          <section className="detalle-seccion">
            <h3 className="detalle-seccion-titulo">Pago al chofer</h3>
            <div className="form-grid">
              <FormField id="pagoChofer" label="Monto ($)" error={errores.pagoChofer}>
                <input type="number" name="pagoChofer" min="0" step="0.01" value={valores.pagoChofer} onChange={handleChange} />
              </FormField>
              <FormField id="estadoPagoChoferId" label="Estado del pago" error={errores.estadoPagoChoferId}>
                <select name="estadoPagoChoferId" value={valores.estadoPagoChoferId} onChange={handleChange}>
                  <option value="">Sin definir</option>
                  <OpcionesCatalogo items={estadosPago} />
                </select>
              </FormField>
              <FormField id="fechaPagoChofer" label="Fecha de pago" error={errores.fechaPagoChofer}>
                <input type="date" name="fechaPagoChofer" value={valores.fechaPagoChofer} onChange={handleChange} />
              </FormField>
              <FormField id="metodoPagoChoferId" label="Método de pago" error={errores.metodoPagoChoferId}>
                <select name="metodoPagoChoferId" value={valores.metodoPagoChoferId} onChange={handleChange}>
                  <option value="">Sin definir</option>
                  <OpcionesCatalogo items={metodosPago} />
                </select>
              </FormField>
            </div>
          </section>

          <div className="datos-admin-pie">
            {errores.general && <Alert variant="error">{errores.general}</Alert>}

            <div className="form-actions">
              <Button type="submit" variant="primary" loading={enviando}>
                {enviando ? 'Guardando…' : 'Guardar datos'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelarEdicion} disabled={enviando}>
                Cancelar
              </Button>
            </div>
          </div>
        </form>
      )}
    </Card>
  );
}

export default DatosAdministrativosViaje;
