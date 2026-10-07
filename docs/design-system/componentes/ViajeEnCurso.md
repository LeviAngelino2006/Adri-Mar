Tarjeta del viaje en curso, arriba de todo en el Dashboard: ruta, horario, cuánto falta y la acción para finalizarlo. Patrón de página (`Dashboard.jsx`).

## Lo que provee quien lo usa
- Una `Card` con `.viaje-en-curso`, solo si hay un viaje En viaje (si hay varios, una por viaje).
- `.viaje-en-curso-header`: `EstadoBadge` warning "En viaje".
- `.viaje-en-curso-ruta` con `RutaViaje` (18px).
- `.viaje-en-curso-progreso`: salida a la izquierda y llegada estimada a la derecha (`.viaje-en-curso-hora`). Cada una muestra primero día y hora ("06 oct 11:10") y debajo, en un `<small>`, la etiqueta "Salida" / "Llegada est.". En el medio, `.viaje-en-curso-barra` con `.viaje-en-curso-barra-fill` al porcentaje transcurrido entre `fechaInicio` y `fechaFin` (entre 0 y 100), con `role="progressbar"` y `aria-valuenow`. El porcentaje se recalcula cada 60 segundos.
- `.viaje-en-curso-pie`: a la izquierda el vehículo ("Vehículo: 3 - AI456JK", sin chofer: el viaje es del chofer que mira su Dashboard) y a la derecha `.viaje-en-curso-acciones` con un `Button` ghost "Ver detalle" (abre la ficha en Mis viajes) y un `Button` primary "Finalizar viaje" (abre el modal de odómetro, ver `ModalOdometro`).

## Reglas
- La barra mide 6px, `radius-full`, track `color-border` y relleno `brand-600`. El estado lo comunica el badge; la barra solo muestra el avance. Pasado el 100% queda llena y en azul: no existe el estado "Excedido".
- Horas en 600 y números tabulares.
- Si un gestor (Administrador o Encargado) mira el viaje de otro, las acciones son las mismas.
- Debajo de 480px las acciones ocupan todo el ancho y se apilan.
