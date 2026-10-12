import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Cargando from '../components/ui/Cargando';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import RutaViaje from '../components/RutaViaje';
import IconoPresupuesto from '../components/IconoPresupuesto';
import PresupuestoForm from '../components/PresupuestoForm';
import FichaPresupuesto from '../components/FichaPresupuesto';
import { ListadoCard, ListadoHeader, ListadoToolbar } from '../components/Listado';
import { crearPresupuesto, listarPresupuestos, obtenerPresupuesto } from '../services/presupuestosApi';
import { DURACION_TOAST_MS } from '../constants/toast';
import { calcularImportes } from '../utils/importes';
import { formatearPesos } from '../utils/moneda';
import { formatearFechaPresupuesto, valoresDuplicado, valoresNuevoPresupuesto } from '../utils/presupuestos';
import './Presupuestos.css';

const DEMORA_BUSQUEDA_MS = 300;

function idDeUrl(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function TarjetaPresupuesto({ presupuesto, onClick }) {
  const { total } = calcularImportes(presupuesto);
  return (
    <ListadoCard
      marca={<IconoPresupuesto />}
      titulo={presupuesto.cliente.nombre}
      sub={<RutaViaje origen={presupuesto.origen} destino={presupuesto.destino} />}
      detalle={`Servicio el ${formatearFechaPresupuesto(presupuesto.fechaServicio)}`}
      pie={[
        `Emitido el ${formatearFechaPresupuesto(presupuesto.fechaEmision)}`,
        `${formatearPesos(total)} ${presupuesto.conFactura ? 'con factura' : 'con recibo'}`,
      ]}
      onClick={onClick}
    />
  );
}

// Presupuestos para clientes potenciales (SCRUM-159/160). Solo Administrador y
// Encargado. No se editan ni se eliminan: "Duplicar presupuesto" abre el
// formulario con los datos del original y crea uno nuevo.
//
// La ficha abierta vive en la URL (?presupuestoId=), así funciona el botón
// Atrás y se puede enlazar. El formulario (alta o duplicado) es estado local,
// como en Viajes.
function Presupuestos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fichaId = idDeUrl(searchParams.get('presupuestoId'));

  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  // { busqueda, items } | null: mientras la búsqueda no coincide con la
  // aplicada, el listado está cargando.
  const [listado, setListado] = useState(null);
  const [errorListado, setErrorListado] = useState('');
  const [recargas, setRecargas] = useState(0);

  // { id, data } | { id, error }: la ficha cargada. Si su id no es el de la
  // URL, está cargando.
  const [ficha, setFicha] = useState(null);

  // null | { valores, unidadesOriginales }
  const [formulario, setFormulario] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState('');

  // Búsqueda con debounce: no se pide el listado en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), DEMORA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    if (fichaId || formulario) return undefined;
    let vigente = true;
    listarPresupuestos({ cliente: busquedaAplicada })
      .then(({ data }) => {
        if (!vigente) return;
        setListado({ busqueda: busquedaAplicada, recargas, items: data.presupuestos });
        setErrorListado('');
      })
      .catch(() => {
        if (!vigente) return;
        setListado({ busqueda: busquedaAplicada, recargas, items: [] });
        setErrorListado('No se pudo cargar el listado de presupuestos.');
      });
    return () => {
      vigente = false;
    };
  }, [busquedaAplicada, fichaId, formulario, recargas]);

  useEffect(() => {
    if (!fichaId) return undefined;
    let vigente = true;
    obtenerPresupuesto(fichaId)
      .then(({ data }) => vigente && setFicha({ id: fichaId, data: data.presupuesto }))
      .catch((err) => {
        if (!vigente) return;
        const error =
          err.response?.status === 404 ? 'No se encontró el presupuesto.' : 'No se pudo cargar el presupuesto.';
        setFicha({ id: fichaId, error });
      });
    return () => {
      vigente = false;
    };
  }, [fichaId]);

  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(''), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [mensaje]);

  // La ficha y el formulario reemplazan al listado en la misma ruta: vuelven arriba.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [fichaId, formulario]);

  const cargandoListado =
    !listado || listado.busqueda !== busquedaAplicada || listado.recargas !== recargas;
  const fichaActual = ficha?.id === fichaId ? ficha : null;

  function abrirFicha(id) {
    setSearchParams({ presupuestoId: String(id) });
  }

  function volverAlListado() {
    setSearchParams({});
  }

  function abrirNuevo() {
    setFormulario({ valores: valoresNuevoPresupuesto(), unidadesOriginales: [] });
  }

  function abrirDuplicado(presupuesto) {
    setFormulario({ valores: valoresDuplicado(presupuesto), unidadesOriginales: presupuesto.unidades });
  }

  // El generador (@react-pdf/renderer, el layout y las imágenes) se carga
  // recién acá, con import() dinámico: no suma peso al bundle inicial.
  async function descargarPdf(presupuesto) {
    setErrorPdf('');
    setGenerandoPdf(true);
    try {
      const { descargarPdfPresupuesto } = await import('../components/presupuestoPdf/generarPdfPresupuesto');
      await descargarPdfPresupuesto(presupuesto);
    } catch (err) {
      console.error(err);
      setErrorPdf('No se pudo generar el PDF. Intentá de nuevo.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function handleGuardar(datos) {
    const { data } = await crearPresupuesto(datos);
    setFormulario(null);
    setMensaje('Presupuesto creado correctamente.');
    setRecargas((r) => r + 1);
    setFicha({ id: data.presupuesto.id, data: data.presupuesto });
    abrirFicha(data.presupuesto.id);
  }

  return (
    <Layout>
      {mensaje && !formulario && <Toast>{mensaje}</Toast>}

      {formulario && (
        <>
          <button type="button" className="back-link" onClick={() => setFormulario(null)}>
            {fichaId ? '← Volver al presupuesto' : '← Volver al listado'}
          </button>
          <h1>{fichaId ? 'Duplicar presupuesto' : 'Crear presupuesto'}</h1>
          <Card className="form-card">
            <PresupuestoForm
              valoresIniciales={formulario.valores}
              unidadesOriginales={formulario.unidadesOriginales}
              onSubmit={handleGuardar}
              onCancelar={() => setFormulario(null)}
            />
          </Card>
        </>
      )}

      {!formulario && !fichaId && (
        <>
          <ListadoHeader titulo="Presupuestos" />
          <ListadoToolbar
            busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar por cliente' }}
            accion={{ etiqueta: 'Crear presupuesto', onClick: abrirNuevo }}
          />

          {errorListado && <Alert variant="error">{errorListado}</Alert>}

          {cargandoListado && <Cargando forma="documentacion" />}

          {!cargandoListado && !errorListado && listado.items.length === 0 && (
            <div className="listado-vacio">
              {busquedaAplicada ? 'No hay presupuestos para ese cliente.' : 'Todavía no hay presupuestos.'}
            </div>
          )}

          {!cargandoListado && listado.items.length > 0 && (
            <div className="listado-cards">
              {listado.items.map((p) => (
                <TarjetaPresupuesto key={p.id} presupuesto={p} onClick={() => abrirFicha(p.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {!formulario && fichaId && (
        <>
          <button type="button" className="back-link" onClick={volverAlListado}>
            ← Volver al listado
          </button>

          {!fichaActual && <Cargando forma="tarjetas" cantidad={1} />}

          {fichaActual?.error && <Alert variant="error">{fichaActual.error}</Alert>}

          {fichaActual?.data && (
            <>
              <h1 className="presupuestos-detalle-titulo">Presupuesto para {fichaActual.data.cliente.nombre}</h1>
              <FichaPresupuesto
                presupuesto={fichaActual.data}
                acciones={
                  <>
                    <Button variant="secondary" loading={generandoPdf} onClick={() => descargarPdf(fichaActual.data)}>
                      {generandoPdf ? 'Generando PDF…' : 'Descargar PDF'}
                    </Button>
                    <Button variant="secondary" onClick={() => abrirDuplicado(fichaActual.data)}>
                      Duplicar presupuesto
                    </Button>
                  </>
                }
              />
              {errorPdf && <Alert variant="error">{errorPdf}</Alert>}
            </>
          )}
        </>
      )}
    </Layout>
  );
}

export default Presupuestos;
