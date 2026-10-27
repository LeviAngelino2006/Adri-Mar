import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import SelectorUbicacion from './SelectorUbicacion';
import SelectorMultiple from './ui/SelectorMultiple';
import { ordenarPorInterno } from '../utils/vehiculos';
import { importeIngresadoACentavos } from '../utils/importes';
import { ACLARACION_IVA, textoPrecioConIva } from '../utils/ivaPresupuesto';
import { formatearPesos } from '../utils/moneda';
import {
  fechaVencimiento,
  formatearFechaPresupuesto,
  opcionUnidad,
  errorImporteIngresado,
  valoresAPayload,
} from '../utils/presupuestos';
import { DIAS_VALIDEZ_MAX, DIAS_VALIDEZ_MIN } from '../constants/presupuesto';

const AVISO_DADO_DE_BAJA = 'Dada de baja: quitala para poder guardar.';

// Formulario de alta de un presupuesto (también para duplicar: llega con
// `valoresIniciales` del original). No hay edición: un presupuesto guardado no
// se modifica.
//
// `unidadesOriginales` son las unidades del presupuesto que se duplica: si
// alguna ya no figura entre los vehículos activos (se dio de baja después), se
// suma a las opciones con un aviso, así el chip no queda como "#id" y se
// entiende por qué el backend la rechaza.
function PresupuestoForm({ valoresIniciales, unidadesOriginales = [], onSubmit, onCancelar }) {
  const [form, setForm] = useState(valoresIniciales);
  const [vehiculos, setVehiculos] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Sin filtro de estado, /vehiculos devuelve todos menos los dados de baja.
    api
      .get('/vehiculos')
      .then(({ data }) => setVehiculos(ordenarPorInterno(data.vehiculos)))
      .catch(() => setVehiculos([]));
  }, []);

  // Mientras cargan los vehículos, los chips de un duplicado usan los datos
  // guardados del original (sin esto se verían como "#87").
  const { opcionesUnidades, avisosUnidades } = useMemo(() => {
    const opcionDeOriginal = (unidad) => ({
      id: unidad.vehiculoId,
      etiqueta: `${unidad.vehiculo.numeroInterno} · ${unidad.vehiculo.dominio}`,
      detalle: unidad.descripcion,
    });
    if (!vehiculos) {
      return { opcionesUnidades: unidadesOriginales.map(opcionDeOriginal), avisosUnidades: {} };
    }
    const opciones = vehiculos.map(opcionUnidad);
    const avisos = {};
    for (const unidad of unidadesOriginales) {
      if (!opciones.some((o) => o.id === unidad.vehiculoId)) {
        opciones.push(opcionDeOriginal(unidad));
        avisos[unidad.vehiculoId] = AVISO_DADO_DE_BAJA;
      }
    }
    return { opcionesUnidades: opciones, avisosUnidades: avisos };
  }, [vehiculos, unidadesOriginales]);

  // El texto del usuario ("420.000,50") se pasa a centavos.
  const centavosIngresados = importeIngresadoACentavos(form.importeNeto);
  // Siempre debajo del input, para que se note si falta un cero.
  const hintImporte =
    centavosIngresados === null ? 'Por ejemplo 420.000 o 420.000,50' : formatearPesos(centavosIngresados);
  // null con el importe vacío o inválido: entonces solo se ve la aclaración.
  const precioConIva = textoPrecioConIva(centavosIngresados);
  const vence = fechaVencimiento(form.fechaEmision, form.diasValidez);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  const seleccionar = (campo) => (item) =>
    setForm((f) => ({ ...f, [`${campo}Id`]: item?.id || '', [`${campo}Nombre`]: item?.nombre || '' }));

  async function handleSubmit(e) {
    e.preventDefault();
    const errorImporte = errorImporteIngresado(form.importeNeto);
    if (errorImporte) {
      setErrores({ importeNeto: errorImporte });
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await onSubmit(valoresAPayload(form));
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: 'No se pudo guardar el presupuesto' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <FormField id="fechaEmision" label="Fecha de emisión" error={errores.fechaEmision} required>
          <input type="date" name="fechaEmision" value={form.fechaEmision} onChange={handleChange} />
        </FormField>
        <div className="form-hueco" aria-hidden="true" />

        <div className="form-field-ancho">
          <FormField id="clienteId" label="Cliente" error={errores.clienteId} required>
            <SelectorBuscarOCrear
              endpoint="/clientes"
              valor={form.clienteId}
              valorNombre={form.clienteNombre}
              onSeleccionar={seleccionar('cliente')}
              placeholder="Buscar o crear cliente…"
            />
          </FormField>
        </div>

        <FormField id="origenId" label="Origen" error={errores.origenId} required>
          <SelectorUbicacion
            valor={form.origenId}
            valorNombre={form.origenNombre}
            onSeleccionar={seleccionar('origen')}
          />
        </FormField>

        <FormField id="destinoId" label="Destino" error={errores.destinoId} required>
          <SelectorUbicacion
            valor={form.destinoId}
            valorNombre={form.destinoNombre}
            onSeleccionar={seleccionar('destino')}
          />
        </FormField>

        <FormField id="fechaServicio" label="Fecha del servicio" error={errores.fechaServicio} required>
          <input type="date" name="fechaServicio" value={form.fechaServicio} onChange={handleChange} />
        </FormField>

        <FormField id="horaSalida" label="Horario de salida" error={errores.horaSalida} hint="Vacío = A confirmar">
          <input type="time" name="horaSalida" value={form.horaSalida} onChange={handleChange} />
        </FormField>

        <FormField id="cantidadPasajeros" label="Cantidad de pasajeros" error={errores.cantidadPasajeros} required>
          <input
            type="number"
            name="cantidadPasajeros"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.cantidadPasajeros}
            onChange={handleChange}
          />
        </FormField>
        <div className="form-hueco" aria-hidden="true" />

        <div className="form-field-ancho">
          <FormField id="vehiculoIds" label="Unidades" error={errores.vehiculoIds} required>
            <SelectorMultiple
              opciones={opcionesUnidades}
              valor={form.vehiculoIds}
              onChange={(ids) => setForm((f) => ({ ...f, vehiculoIds: ids }))}
              avisos={avisosUnidades}
              placeholder={vehiculos ? 'Buscar por interno, dominio o tipo…' : 'Cargando vehículos…'}
              disabled={!vehiculos}
            />
          </FormField>
        </div>

        {/* La aclaración y el precio con IVA van fuera del FormField: así se
            siguen viendo cuando el campo muestra un error (que oculta el hint). */}
        <div className="presupuesto-importe">
          <FormField id="importeNeto" label="Importe" error={errores.importeNeto} hint={hintImporte} required>
            <input
              type="text"
              name="importeNeto"
              inputMode="decimal"
              autoComplete="off"
              value={form.importeNeto}
              onChange={handleChange}
            />
          </FormField>
          <div className="presupuesto-iva">
            <p>{ACLARACION_IVA}</p>
            <p aria-live="polite">{precioConIva}</p>
          </div>
        </div>
        <div className="form-hueco" aria-hidden="true" />


        <div className="form-field-ancho">
          <FormField id="formaPago" label="Forma de pago" error={errores.formaPago} required>
            <textarea name="formaPago" rows={3} value={form.formaPago} onChange={handleChange} />
          </FormField>
        </div>

        <div className="presupuesto-validez">
          <FormField
            id="diasValidez"
            label="Validez (días)"
            error={errores.diasValidez}
            hint={vence ? `Vence el ${formatearFechaPresupuesto(vence)}` : undefined}
            required
          >
            <input
              type="number"
              name="diasValidez"
              min={DIAS_VALIDEZ_MIN}
              max={DIAS_VALIDEZ_MAX}
              step="1"
              inputMode="numeric"
              value={form.diasValidez}
              onChange={handleChange}
            />
          </FormField>
        </div>
      </div>

      {errores.general && <Alert variant="error">{errores.general}</Alert>}

      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando}>
          {enviando ? 'Creando…' : 'Crear presupuesto'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default PresupuestoForm;
