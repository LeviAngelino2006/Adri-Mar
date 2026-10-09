Formulario para crear o editar un vehículo (`FlotaVehiculos.jsx`). Patrón de página armado con `Card`, `FormField` y `.form-grid`.

## Estructura
- `.back-link`, `h1` ("Nuevo vehículo" o "Editar vehículo") y una `Card` `.form-card` (720px) con un solo `.form-grid`: dos columnas desde 640px, una debajo, en el mismo orden. Sin títulos de sección.

## Pares de campos
1. Número de interno | Dominio
2. Marca | Modelo
3. Tipo de vehículo | Año
4. Cantidad de asientos | Kilometraje actual

## Obligatorios y hints
- Todos los campos llevan `required` en `FormField` (asterisco rojo): `vehiculoService` los exige todos.
- Dominio: hint "Formato AB123CD o ABC123".
- Kilometraje actual: hint "En kilómetros".
- Los errores de validación vienen del backend y se muestran en cada campo (el hint se oculta mientras hay error). Un error general (por ejemplo, dominio repetido) va en un `Alert` error arriba de los botones.

## Botones
- `.form-actions`: "Crear vehículo" en el alta o "Guardar cambios" al editar (primary; mientras guarda, "Guardando…") y "Cancelar" (secondary).

## Scroll
- Al abrir el formulario y al volver al listado la página vuelve arriba.
