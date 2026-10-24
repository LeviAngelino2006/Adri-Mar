import { useCallback, useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Card from '../ui/Card';
import FormField from '../ui/FormField';
import GrupoCasillas from '../ui/GrupoCasillas';
import { ListadoToolbar } from '../Listado';
import { useCarga } from '../../hooks/useCarga';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { listarTiposArreglo, registrarArreglo } from '../../services/mantenimientoApi';
import { MAX_DETALLE_TIPO, MAX_RESPONSABLE, MAX_TEXTO_MANTENIMIENTO } from '../../constants/mantenimiento';
import { mensajeErrorCarga } from '../../utils/errorCarga';
import { hoyCordobaISO } from '../../utils/fechaCordoba';
import { formatearKm } from '../../utils/viajeFormato';
import { etiquetaVehiculo, validarRegistroMantenimiento } from '../../utils/mantenimiento';
import { ordenarPorInterno } from '../../utils/vehiculos';

const formVacio = () => ({
  vehiculoId: '',
  tiposArregloIds: [],
  // "¿Qué trabajo?" de los tipos que lo piden ("Otro"): { [tipoId]: texto }.
  detallesTipos: {},
  fecha: hoyCordobaISO(),
  kilometraje: '',
  descripcion: '',
  responsable: '',
  repuestos: '',
  observaciones: '',
});

// "0/500" junto al label de los textos largos.
function Contador({ texto, maximo }) {
  const cantidad = [...texto].length;
  return (
    <span className={cantidad > maximo ? 'contador-texto contador-texto-excedido' : 'contador-texto'}>
      {cantidad}/{maximo}
    </span>
  );
}

// Pestaña Arreglos: solo el formulario para registrar un trabajo que no es el
// service (no reinicia el conteo ni genera alertas). Lo registrado se ve en
// Historial. `cargaVehiculos` es la lista de la página (vehículos no dados de
// baja, con su estado de service).
function PestanaArreglos({ cargaVehiculos, vistas, onSuccess }) {
  const cargaTipos = useCarga(useCallback(() => listarTiposArreglo().then(({ data }) => data.tiposArreglo), []));
  const [form, setForm] = useState(formVacio);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  const hoy = hoyCordobaISO();
  const vehiculos = ordenarPorInterno((cargaVehiculos.datos ?? []).map((item) => item.vehiculo));
  const tipos = cargaTipos.datos ?? [];
  const vehiculo = vehiculos.find((v) => String(v.id) === form.vehiculoId);
  const tiposElegidos = tipos.filter((t) => form.tiposArregloIds.includes(t.id));
  const opcionesTipos = tipos.map((t) => ({ id: t.id, etiqueta: t.nombre, detalle: t.descripcion || undefined }));

  const errorVehiculos = cargaVehiculos.error ? mensajeErrorCarga(cargaVehiculos.error, 'la lista de vehículos') : '';
  const errorTipos = cargaTipos.error ? mensajeErrorCarga(cargaTipos.error, 'los tipos de trabajo') : '';

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  }

  // Al desmarcar un tipo se descarta su "¿Qué trabajo?", así no se manda; y se
  // limpia el error del detalle, que puede ser de un tipo que ya no está.
  function cambiarTipos(ids) {
    setForm((actual) => ({
      ...actual,
      tiposArregloIds: ids,
      detallesTipos: Object.fromEntries(Object.entries(actual.detallesTipos).filter(([id]) => ids.includes(Number(id)))),
    }));
    setErrores((actuales) => ({ ...actuales, tiposArregloIds: undefined, detallesTipos: undefined }));
  }

  function cambiarDetalle(tipoId, texto) {
    setForm((actual) => ({ ...actual, detallesTipos: { ...actual.detallesTipos, [tipoId]: texto } }));
    setErrores((actuales) => ({ ...actuales, detallesTipos: undefined }));
  }

  // Debajo de un tipo marcado que lo pide ("Otro"): qué trabajo se hizo.
  function campoDetalle(opcion) {
    const tipo = tipos.find((t) => t.id === opcion.id);
    if (!tipo?.requiereDetalle) return null;
    return (
      <FormField id={`arreglo-detalle-${tipo.id}`} label="¿Qué trabajo?" required error={errores.detallesTipos}>
        <input
          type="text"
          maxLength={MAX_DETALLE_TIPO}
          placeholder="Por ejemplo, cambio de espejo"
          value={form.detallesTipos[tipo.id] ?? ''}
          onChange={(e) => cambiarDetalle(tipo.id, e.target.value)}
        />
      </FormField>
    );
  }

  function limpiar() {
    setForm(formVacio());
    setErrores({});
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const invalidos = validarRegistroMantenimiento(form, {
      hoy,
      esArreglo: true,
      tiposArreglo: tiposElegidos,
      maxTexto: MAX_TEXTO_MANTENIMIENTO,
      maxResponsable: MAX_RESPONSABLE,
      maxDetalleTipo: MAX_DETALLE_TIPO,
    });
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      const texto = (campo) => form[campo].trim() || undefined;
      // Solo los tipos marcados que lo piden (cambiarTipos ya descarta los demás).
      const detalles = Object.fromEntries(
        tiposElegidos.filter((t) => t.requiereDetalle).map((t) => [t.id, form.detallesTipos[t.id].trim()])
      );
      const { data } = await registrarArreglo({
        vehiculoId: Number(form.vehiculoId),
        tiposArregloIds: form.tiposArregloIds,
        detallesTipos: Object.keys(detalles).length > 0 ? detalles : undefined,
        fecha: form.fecha,
        kilometraje: Number(form.kilometraje),
        descripcion: texto('descripcion'),
        responsable: texto('responsable'),
        repuestos: texto('repuestos'),
        observaciones: texto('observaciones'),
      });
      limpiar();
      onSuccess(data.registro);
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        const campos = Object.keys(formVacio());
        setErrores(Object.fromEntries(Object.entries(delBackend).filter(([campo]) => campos.includes(campo))));
        const otros = Object.entries(delBackend).filter(([campo]) => !campos.includes(campo));
        if (otros.length > 0) setError(otros.map(([, texto]) => texto).join(' '));
      } else {
        setError(mensaje || 'No se pudo registrar el arreglo. Intentá de nuevo.');
      }
      enfocarPrimerError();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <ListadoToolbar vistas={vistas} vistasAlInicio />

      <Card className="form-card arreglos-form-card">
        <form ref={refForm} onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <FormField id="arreglo-vehiculo" label="Vehículo" required error={errores.vehiculoId || errorVehiculos}>
              <select
                value={form.vehiculoId}
                onChange={(e) => cambiar('vehiculoId', e.target.value)}
                disabled={cargaVehiculos.cargando && vehiculos.length === 0}
              >
                <option value="">{cargaVehiculos.cargando && vehiculos.length === 0 ? 'Cargando…' : 'Elegí el vehículo'}</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {etiquetaVehiculo(v)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              id="arreglo-km"
              label="Km del odómetro"
              required
              hint={vehiculo ? `Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km` : 'En kilómetros'}
              error={errores.kilometraje}
            >
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="num"
                value={form.kilometraje}
                onChange={(e) => cambiar('kilometraje', e.target.value)}
              />
            </FormField>

            <FormField id="arreglo-fecha" label="Fecha" required error={errores.fecha}>
              <input type="date" max={hoy} value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
            </FormField>

            <FormField
              id="arreglo-responsable"
              label="Quién hizo el trabajo"
              hint="Mecánico, chapista o taller"
              error={errores.responsable}
            >
              <input
                type="text"
                maxLength={MAX_RESPONSABLE}
                value={form.responsable}
                onChange={(e) => cambiar('responsable', e.target.value)}
              />
            </FormField>

            <div className="form-field-ancho">
              <GrupoCasillas
                id="arreglo-tipos"
                legend="Tipos de trabajo"
                required
                opciones={opcionesTipos}
                valor={form.tiposArregloIds}
                onChange={cambiarTipos}
                contenidoMarcada={campoDetalle}
                hint={cargaTipos.cargando && tipos.length === 0 ? 'Cargando…' : undefined}
                error={errores.tiposArregloIds || errorTipos}
                disabled={cargaTipos.cargando && tipos.length === 0}
              />
            </div>

            <div className="form-field-ancho">
              <FormField
                id="arreglo-descripcion"
                label={
                  <>
                    Descripción <Contador texto={form.descripcion} maximo={MAX_TEXTO_MANTENIMIENTO} />
                  </>
                }
                error={errores.descripcion}
              >
                <textarea
                  rows={3}
                  placeholder="Qué se hizo"
                  value={form.descripcion}
                  onChange={(e) => cambiar('descripcion', e.target.value)}
                />
              </FormField>
            </div>

            <div className="form-field-ancho">
              <FormField
                id="arreglo-repuestos"
                label={
                  <>
                    Repuestos <Contador texto={form.repuestos} maximo={MAX_TEXTO_MANTENIMIENTO} />
                  </>
                }
                error={errores.repuestos}
              >
                <textarea rows={2} value={form.repuestos} onChange={(e) => cambiar('repuestos', e.target.value)} />
              </FormField>
            </div>

            <div className="form-field-ancho">
              <FormField
                id="arreglo-observaciones"
                label={
                  <>
                    Observaciones <Contador texto={form.observaciones} maximo={MAX_TEXTO_MANTENIMIENTO} />
                  </>
                }
                error={errores.observaciones}
              >
                <textarea
                  rows={2}
                  value={form.observaciones}
                  onChange={(e) => cambiar('observaciones', e.target.value)}
                />
              </FormField>
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Registrando…' : 'Registrar arreglo'}
            </Button>
            <Button variant="secondary" onClick={limpiar} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

export default PestanaArreglos;
