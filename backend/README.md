# Backend de Adri-Mar Gestión

La puesta en marcha está en el [README de la raíz](../README.md#2-backend).

## Firmas de los presupuestos

El PDF de los presupuestos lleva las firmas escaneadas de Marina y Pedro Scagliarini. El repo es público, así que las imágenes **no se commitean**: el backend las lee de una carpeta privada y las sirve solo a Administrador y Encargado en `GET /api/presupuestos/assets/firma/:nombre` (ver `src/services/firmaPresupuestoService.js`).

Archivos (nombres exactos, en JPG):

- `firma-marina.jpg`
- `firma-pedro.jpg`

**En Render (producción):**

1. En el servicio del backend, ir a **Environment → Secret Files** y agregar dos archivos con esos nombres, subiendo cada imagen. Render los deja en `/etc/secrets/`.
2. En **Environment Variables**, agregar `FIRMAS_DIR=/etc/secrets`.
3. Guardar: Render vuelve a desplegar el servicio.

Para comprobarlo, descargar el PDF de cualquier presupuesto: si falta un archivo, el endpoint responde 404 y el PDF sale sin esa firma.

**En desarrollo:** copiar los dos archivos a `backend/privado/firmas/` (la carpeta está en `.gitignore`) o definir `FIRMAS_DIR` en `backend/.env` apuntando a otra carpeta.

Para reemplazarlas por versiones en alta resolución alcanza con pisar los archivos con el mismo nombre.
