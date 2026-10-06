import FormField from './ui/FormField';
import OpcionesCatalogo from './ui/OpcionesCatalogo';

// Sección colapsada del formulario de alta de un viaje con los datos
// administrativos (solo Administrador y Encargado; quien la monta, ViajeForm,
// decide no renderizarla para el resto). Mismos campos que
// DatosAdministrativosViaje en la ficha. Es controlada: ViajeForm guarda los
// valores y si está abierta, para poder abrirla cuando hay errores adentro.
function SeccionDatosAdministrativos({ valores, errores, estadosPago, metodosPago, abierta, onToggle, onChange }) {
  return (
    <details className="form-seccion" open={abierta} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary className="form-seccion-resumen">Datos administrativos (opcional)</summary>
      <div className="form-seccion-cuerpo">
        <div className="form-grid">
          <div className="form-field-ancho">
            <FormField id="precio" label="Precio ($)" error={errores.precio}>
              <input type="number" name="precio" min="0" step="0.01" value={valores.precio} onChange={onChange} />
            </FormField>
          </div>

          <FormField id="estadoPagoClienteId" label="Estado de pago del cliente" error={errores.estadoPagoClienteId}>
            <select name="estadoPagoClienteId" value={valores.estadoPagoClienteId} onChange={onChange}>
              <option value="">Sin definir</option>
              <OpcionesCatalogo items={estadosPago} />
            </select>
          </FormField>

          <FormField id="fechaPagoCliente" label="Fecha de pago del cliente" error={errores.fechaPagoCliente}>
            <input type="date" name="fechaPagoCliente" value={valores.fechaPagoCliente} onChange={onChange} />
          </FormField>

          <div className="form-field-ancho">
            <FormField id="metodoPagoClienteId" label="Método de pago del cliente" error={errores.metodoPagoClienteId}>
              <select name="metodoPagoClienteId" value={valores.metodoPagoClienteId} onChange={onChange}>
                <option value="">Sin definir</option>
                <OpcionesCatalogo items={metodosPago} />
              </select>
            </FormField>
          </div>

          <div className="form-field-ancho">
            <FormField id="pagoChofer" label="Pago al chofer ($)" error={errores.pagoChofer}>
              <input type="number" name="pagoChofer" min="0" step="0.01" value={valores.pagoChofer} onChange={onChange} />
            </FormField>
          </div>

          <FormField id="estadoPagoChoferId" label="Estado de pago al chofer" error={errores.estadoPagoChoferId}>
            <select name="estadoPagoChoferId" value={valores.estadoPagoChoferId} onChange={onChange}>
              <option value="">Sin definir</option>
              <OpcionesCatalogo items={estadosPago} />
            </select>
          </FormField>

          <FormField id="fechaPagoChofer" label="Fecha de pago al chofer" error={errores.fechaPagoChofer}>
            <input type="date" name="fechaPagoChofer" value={valores.fechaPagoChofer} onChange={onChange} />
          </FormField>

          <div className="form-field-ancho">
            <FormField id="metodoPagoChoferId" label="Método de pago al chofer" error={errores.metodoPagoChoferId}>
              <select name="metodoPagoChoferId" value={valores.metodoPagoChoferId} onChange={onChange}>
                <option value="">Sin definir</option>
                <OpcionesCatalogo items={metodosPago} />
              </select>
            </FormField>
          </div>
        </div>
      </div>
    </details>
  );
}

export default SeccionDatosAdministrativos;
