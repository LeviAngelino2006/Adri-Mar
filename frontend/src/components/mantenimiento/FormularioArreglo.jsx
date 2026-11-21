import { useCallback, useEffect, useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import GrupoCasillas from '../ui/GrupoCasillas';
import SelectorBuscarOCrear from '../ui/SelectorBuscarOCrear';
import Switch from '../ui/Switch';
import { useCarga } from '../../hooks/useCarga';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { listarTiposArreglo, registrarArreglo } from '../../services/mantenimientoApi';
import { DEMORA_KM_MS, MAX_DETALLE_TIPO, MAX_TEXTO_MANTENIMIENTO } from '../../constants/mantenimiento';
import { mensajeErrorCarga } from '../../utils/errorCarga';
import { hoyCordobaISO } from '../../utils/fechaCordoba';
import { formatearKm } from '../../utils/viajeFormato';
import { esKmAnterior, validarRegistroMantenimiento } from '../../utils/mantenimiento';

const formVacio = () => ({
  tiposArregloIds: [],
  // "¿Qué trabajo?" de los tipos que lo piden ("Otro"): { [tipoId]: texto }.
  detallesTipos: {},
  fecha: hoyCordobaISO(),
  kilometraje: '',
  // Trabajo hecho antes que se carga ahora: deja poner menos km que el odómetro.
  esAnterior: false,
  descripcion: '',
  // Catálogo "buscar o crear" (SelectorBuscarOCrear): el id va al backend y el
  // nombre es para mostrar.
  responsableId: '',
  responsableNombre: '',
  repuestos: '',
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

// Registrar un arreglo (un trabajo que no es el service: no reinicia el conteo
// ni genera alertas) del vehículo del panel. Se monta solo mientras se ve, así
// arranca siempre limpio.
function FormularioArreglo({ vehiculo, onCancel, onSuccess }) {
  const cargaTipos = useCarga(useCallback(() => listarTiposArreglo().then(({ data }) => data.tiposArreglo), []));
  const [form, setForm] = useState(formVacio);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  const hoy = hoyCordobaISO();
  const tipos = cargaTipos.datos ?? [];
  const tiposElegidos = tipos.filter((t) => form.tiposArregloIds.includes(t.id));
  // El switch "arreglo anterior" solo aparece (y solo se manda) si el km es
  // menor al odómetro del vehículo.
  const kmAnterior = esKmAnterior(form.kilometraje, vehiculo.kilometraje);
  const esAnterior = kmAnterior && form.esAnterior;
  // Debounce: el switch aparece cuando se deja de escribir el km (si no, al
  // tipear "1" de "12000" ya preguntaría). Se oculta con cualquier cambio del km
  // y vuelve solo cuando el valor quedó quieto.
  const [kmTipeado, setKmTipeado] = useState(form.kilometraje);
  useEffect(() => {
    const temporizador = setTimeout(() => setKmTipeado(form.kilometraje), DEMORA_KM_MS);
    return () => clearTimeout(temporizador);
  }, [form.kilometraje]);
  const mostrarSwitchAnterior = kmAnterior && kmTipeado === form.kilometraje;
  const opcionesTipos = tipos.map((t) => ({ id: t.id, etiqueta: t.nombre }));

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

  function elegirResponsable(item) {
    setForm((actual) => ({ ...actual, responsableId: item ? String(item.id) : '', responsableNombre: item?.nombre ?? '' }));
    setErrores((actuales) => ({ ...actuales, responsableId: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    // Si se envía antes de la demora, el switch se muestra ya (el error lo nombra).
    setKmTipeado(form.kilometraje);
    const invalidos = validarRegistroMantenimiento(
      { ...form, vehiculoId: vehiculo.id, esAnterior },
      {
        hoy,
        esArreglo: true,
        tiposArreglo: tiposElegidos,
        maxTexto: MAX_TEXTO_MANTENIMIENTO,
        maxDetalleTipo: MAX_DETALLE_TIPO,
        kmMinimo: vehiculo.kilometraje,
      }
    );
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
        vehiculoId: vehiculo.id,
        tiposArregloIds: form.tiposArregloIds,
        detallesTipos: Object.keys(detalles).length > 0 ? detalles : undefined,
        fecha: form.fecha,
        kilometraje: Number(form.kilometraje),
        esAnterior: esAnterior || undefined,
        descripcion: texto('descripcion'),
        responsableId: form.responsableId ? Number(form.responsableId) : undefined,
        repuestos: texto('repuestos'),
      });
      onSuccess(data.registro);
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        // Lo que no tiene campo en el formulario (el vehículo, por ejemplo) va
        // como mensaje general.
        const campos = Object.keys(formVacio());
        setErrores(Object.fromEntries(Object.entries(delBackend).filter(([campo]) => campos.includes(campo))));
        const otros = Object.entries(delBackend).filter(([campo]) => !campos.includes(campo));
        if (otros.length > 0) setError(otros.map(([, texto]) => texto).join(' '));
      } else {
        setError(mensaje || 'No se pudo registrar el arreglo. Intentá de nuevo.');
      }
      enfocarPrimerError();
      setEnviando(false);
    }
  }

  return (
    <form ref={refForm} className="mantenimiento-panel-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <FormField
          id="arreglo-km"
          label="Km del odómetro"
          required
          hint={`Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km`}
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

        {mostrarSwitchAnterior && (
          <div className="form-field switch-field">
            <label htmlFor="arreglo-anterior" className="switch-field-label">
              <Switch
                id="arreglo-anterior"
                checked={form.esAnterior}
                onChange={(e) => {
                  cambiar('esAnterior', e.target.checked);
                  setErrores((actuales) => ({ ...actuales, kilometraje: undefined }));
                }}
              />
              Es un arreglo anterior, hecho con menos km que el odómetro actual
            </label>
          </div>
        )}

        <div className="form-field-ancho">
          <FormField id="arreglo-responsable" label="Responsable" error={errores.responsableId}>
            <SelectorBuscarOCrear
              endpoint="/mantenimientos/responsables"
              valor={form.responsableId}
              valorNombre={form.responsableNombre}
              onSeleccionar={elegirResponsable}
              placeholder="Buscar o crear responsable…"
            />
          </FormField>
        </div>

        <div className="form-field-ancho">
          <GrupoCasillas
            id="arreglo-tipos"
            legend="Trabajos realizados"
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
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando}>
          {enviando ? 'Registrando…' : 'Registrar arreglo'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default FormularioArreglo;
