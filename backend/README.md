# Backend de Adri-Mar Gestión

La puesta en marcha está en el [README de la raíz](../README.md#2-backend).

## Firmas de los presupuestos

El PDF de los presupuestos lleva las firmas escaneadas de Marina y Pedro Scagliarini. El repo es público, así que las imágenes **no se commitean**: el backend las lee de una carpeta privada (`FIRMAS_DIR`) y las sirve solo a Administrador y Encargado en `GET /api/presupuestos/assets/firma/:nombre` (ver `src/services/firmaPresupuestoService.js`).

Para cada firma, el backend busca primero `firma-<nombre>.jpg.b64` (el JPG en base64) y, si no existe, `firma-<nombre>.jpg`. Si el contenido no es un JPG válido (por ejemplo, un base64 mal pegado), responde 404 y deja un `console.error` en los logs; el PDF sale sin esa firma.

### En Render (producción)

Los Secret Files de Render solo aceptan texto pegado, con un **límite de 1 MB entre todos los Secret Files del servicio**. Por eso las firmas se cargan en base64:

1. En una PowerShell, parado en la carpeta donde están los JPG, copiar el base64 de cada firma al portapapeles:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\firma-marina.jpg))) | Set-Clipboard
   ```

   (Para `firma-pedro.jpg`, lo mismo cambiando el nombre.) Si preferís guardarlo en un archivo para revisarlo antes de pegarlo:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\firma-marina.jpg))) | Set-Content -NoNewline -Encoding ascii .\firma-marina.jpg.b64
   ```

2. En el servicio del backend, **Environment → Secret Files**, crear dos archivos y pegar el contenido completo:
   - `firma-marina.jpg.b64`
   - `firma-pedro.jpg.b64`

   Render los deja en `/etc/secrets/`.
3. En **Environment Variables**, agregar `FIRMAS_DIR=/etc/secrets`.
4. Guardar: Render vuelve a desplegar el servicio.

Para comprobarlo, descargar el PDF de cualquier presupuesto. Si falta una firma, revisar los logs: un pegado incompleto aparece como `Firma "<nombre>": /etc/secrets/firma-<nombre>.jpg.b64 no es un JPG válido`.

El base64 ocupa un tercio más que el JPG: las firmas actuales suman 15 KB en base64. Las versiones en alta resolución tienen que entrar en el límite junto con cualquier otro Secret File del servicio: 1 MB de base64 son unos 768 KB de JPG entre las dos.

### En desarrollo

Copiar `firma-marina.jpg` y `firma-pedro.jpg` a `backend/privado/firmas/` (la carpeta está en `.gitignore`), o definir `FIRMAS_DIR` en `backend/.env` apuntando a otra carpeta. También acepta los `.jpg.b64`.

Para reemplazarlas por versiones en alta resolución alcanza con pisar los archivos (o los Secret Files) con el mismo nombre.
