# Reglas del proyecto (Coagro Facturación Ruteo)

## Tablas

Toda tabla de datos de la app (nueva o existente) se construye con
`src/components/ui/DataTable.js`. No se dibujan tablas a mano con `View` + `map` ni con
`FlatList` propias.

`DataTable` ya incluye, y ninguna tabla debe quedar sin ellas:

- **Paginación**: 10 registros por página al inicio; el usuario elige 10 / 25 / 50 / 100
  (componente `src/components/ui/Pagination.js`).
- **Deslizamiento horizontal**: cada columna tiene un ancho mínimo (`width`); si no caben en la
  pantalla la tabla se desliza a lo largo y muestra el aviso "Desliza la tabla…". Si sobra
  espacio, se estiran las columnas marcadas con `grow`.
- Encabezado gris, filas alternas, selección opcional (`onRowPress` + `selectedKey`).

Cómo agregar una tabla nueva:

1. Crear un componente en `src/components/<módulo>/<Nombre>Table.js` que defina `COLUMNS`
   (`{ key, title, width, align?, grow?, render? }`) y devuelva `<DataTable … />`.
   Ejemplos: `reportes/InventarioTable.js` (solo lectura) y `clientes/ClientTable.js` (seleccionable).
2. Pasarle la lista completa en `data`; la paginación se hace dentro de `DataTable`.
3. Como `DataTable` dibuja una sola página (sin virtualizar), puede ir dentro de un `ScrollView`.
