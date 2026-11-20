import { useEffect, useState } from 'react';
import { actualizarDatosAdministrativos } from '../services/viajesApi';
import Card from './ui/Card';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import { ErrorCarga } from './ui/EstadoCarga';
import OpcionesCatalogo from './ui/OpcionesCatalogo';
import OpcionVacia from './ui/OpcionVacia';
import { useCatalogosPago, valoresAPayload, validarMontos, viajeAValores } from '../utils/datosAdministrativos';
import { esPagoPendiente, limpiarFechasDePagosPendientes } from '../utils/pagoPendiente';
import { mensajeErrorCarga } from '../utils/errorCarga';
import './FormDatosAdministrativos.css';

const HINT_FECHA_PENDIENTE = 'Con el pago Pendiente no se carga la fecha de pago.';

// Formulario de los datos administrativos/financieros del viaje, en su propia
// pantalla (SCRUM-248). Viajes.jsx lo muestra solo a Administrador/Encargado,
// abierto desde "Editar datos administrativos" de la ficha. Al guardar entrega
// el viaje que devolvió el backend (`onGuardado`); `onCancelar` vuelve sin
// guardar.
function FormDatosAdministrativos({ viaje, onGuardado, onCancelar }) {
  const [valores, setValores] = useState(() => viajeAValores(viaje));
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const { estadosPago, metodosPago, cargarCatalogos, errorCatalogos, reintentarCatalogos } = useCatalogosPago();

  // Los catálogos se piden al abrir el formulario (y solo la primera vez):
  // quien solo mira la ficha no necesita ninguno de los dos.
  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // Con el pago Pendiente la fecha se vacía (también al pasar de Pagado a
  // Pendiente). Se limpia antes y después del cambio: así un viaje histórico
  // que ya estaba Pendiente con fecha no la recupera al cambiar a Pagado.
  function handleChange(e) {
    const { name, value } = e.target;
    setValores((v) =>
      limpiarFechasDePagosPendientes({ ...limpiarFechasDePagosPendientes(v, estadosPago), [name]: value }, estadosPago)
    );
  }

  const fechaClienteBloqueada = esPagoPendiente(valores.estadoPagoClienteId, estadosPago);
  const fechaChoferBloqueada = esPagoPendiente(valores.estadoPagoChoferId, estadosPago);

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
      const { data } = await actualizarDatosAdministrativos(
        viaje.id,
        valoresAPayload(limpiarFechasDePagosPendientes(valores, estadosPago))
      );
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
    <>
      {/* Sin los catálogos, los selects de estado y método quedarían vacíos:
          se avisa arriba del formulario, con "Reintentar". */}
      {errorCatalogos && (
        <div className="form-card datos-admin-error-catalogos">
          <ErrorCarga
            mensaje={mensajeErrorCarga(errorCatalogos, 'los estados y métodos de pago')}
            onReintentar={reintentarCatalogos}
          />
        </div>
      )}
      <Card className="form-card detalle-card datos-admin-form">
        <form onSubmit={handleSubmit} noValidate>
          <section className="detalle-seccion">
            <h2 className="detalle-seccion-titulo">Cobro al cliente</h2>
            <div className="form-grid">
              <FormField id="precio" label="Precio ($)" error={errores.precio}>
                <input type="number" name="precio" min="0" step="0.01" value={valores.precio} onChange={handleChange} />
              </FormField>
              <FormField id="estadoPagoClienteId" label="Estado del pago" error={errores.estadoPagoClienteId}>
                <select name="estadoPagoClienteId" value={valores.estadoPagoClienteId} onChange={handleChange}>
                  <OpcionVacia>Sin definir</OpcionVacia>
                  <OpcionesCatalogo items={estadosPago} />
                </select>
              </FormField>
              <FormField
                id="fechaPagoCliente"
                label="Fecha de pago"
                error={errores.fechaPagoCliente}
                hint={fechaClienteBloqueada ? HINT_FECHA_PENDIENTE : undefined}
              >
                <input
                  type="date"
                  name="fechaPagoCliente"
                  value={fechaClienteBloqueada ? '' : valores.fechaPagoCliente}
                  onChange={handleChange}
                  disabled={fechaClienteBloqueada}
                />
              </FormField>
              <FormField id="metodoPagoClienteId" label="Método de pago" error={errores.metodoPagoClienteId}>
                <select name="metodoPagoClienteId" value={valores.metodoPagoClienteId} onChange={handleChange}>
                  <OpcionVacia>Sin definir</OpcionVacia>
                  <OpcionesCatalogo items={metodosPago} />
                </select>
              </FormField>
            </div>
          </section>

          <section className="detalle-seccion">
            <h2 className="detalle-seccion-titulo">Pago al chofer</h2>
            <div className="form-grid">
              <FormField id="pagoChofer" label="Monto ($)" error={errores.pagoChofer}>
                <input type="number" name="pagoChofer" min="0" step="0.01" value={valores.pagoChofer} onChange={handleChange} />
              </FormField>
              <FormField id="estadoPagoChoferId" label="Estado del pago" error={errores.estadoPagoChoferId}>
                <select name="estadoPagoChoferId" value={valores.estadoPagoChoferId} onChange={handleChange}>
                  <OpcionVacia>Sin definir</OpcionVacia>
                  <OpcionesCatalogo items={estadosPago} />
                </select>
              </FormField>
              <FormField
                id="fechaPagoChofer"
                label="Fecha de pago"
                error={errores.fechaPagoChofer}
                hint={fechaChoferBloqueada ? HINT_FECHA_PENDIENTE : undefined}
              >
                <input
                  type="date"
                  name="fechaPagoChofer"
                  value={fechaChoferBloqueada ? '' : valores.fechaPagoChofer}
                  onChange={handleChange}
                  disabled={fechaChoferBloqueada}
                />
              </FormField>
              <FormField id="metodoPagoChoferId" label="Método de pago" error={errores.metodoPagoChoferId}>
                <select name="metodoPagoChoferId" value={valores.metodoPagoChoferId} onChange={handleChange}>
                  <OpcionVacia>Sin definir</OpcionVacia>
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
              <Button type="button" variant="secondary" onClick={onCancelar} disabled={enviando}>
                Cancelar
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </>
  );
}

export default FormDatosAdministrativos;
