# Cambios a datos de clientes desde la app → `POST /fr/sync/enviar`

En la app, en Consultar > Cliente, el vendedor ahora puede cambiar los datos del cliente. Cada cambio
se guarda en el equipo y sube en `POST /fr/sync/enviar`, en una clave nueva: **`cambiosCliente`**.
El backend tiene que aplicar cada cambio en la base de datos y responder un resultado por fila,
igual que con `promocionales`.

Antes de cambiar nada, revisa cómo `GET /fr/sync/clientes` arma cada cliente: de qué tabla y columna
sale cada campo, y cómo el `COD_CLT` de la handheld se traduce al cliente del ERP
(`CLIENTE_ASOC_RT.CODIGO → CLIENTE_ASOC_RT.CLIENTE`, `CLIENTE_RT`, `erpadmin.cliente`,
`CLIENTE_CIA`...). **Cada cambio se escribe en la misma tabla y columna de la que `/fr/sync/clientes`
lee ese campo.** Así, en la siguiente descarga la app recibe el valor nuevo. La app borra sus cambios
ya enviados y vuelve a llenar los datos con esa descarga.

## 1. Lo que manda la app

Header: `Authorization: Bearer <token movil>`, igual que hoy. `cambiosCliente` viene junto a las
demás claves (`visitas`, `pedidos`, `promocionales`...). Si no hay cambios, la clave puede no venir
o venir vacía.

```json
{
  "cambiosCliente": [
    {
      "COD_CLT": "00603",
      "COD_CIA": "CINCOH",
      "RUTA": null,
      "TABLA": "CLIENTE_CIA",
      "CAMPO": "LIM_CRE",
      "VALOR": 500,
      "VALOR_ANTERIOR": 10,
      "FECHA": "2026-11-12 15:42:10"
    }
  ]
}
```

- `COD_CLT`: código del cliente **en la handheld**, el mismo que manda `/fr/sync/clientes`.
- `COD_CIA`: compañía de CLIENTE_CIA del cliente. Puede venir null en los campos de `CLIENTE`.
- `RUTA`: siempre viene null (reservado). Los días de visita de la ruta **no** se editan desde la app.
- `TABLA`: tabla local de la app de donde salió el dato. Es solo informativa: **el backend decide
  dónde escribir según `CAMPO`**.
- `VALOR`: el valor nuevo. Viene como número en los campos numéricos y como texto en el resto. `""` significa que el vendedor dejó el dato vacío.
- `VALOR_ANTERIOR`: el valor que tenía la app antes del cambio. Sirve para bitácora o auditoría.
  No lo uses para validar.
- `FECHA`: cuándo se hizo el cambio en el equipo (`YYYY-MM-DD HH:MM:SS`).
- Por cada cliente + campo llega **solo el último valor**. Si el vendedor cambió el mismo dato
  varias veces antes de enviar, se manda una sola fila.

## 2. Campos posibles (`CAMPO`)

Todos llevan el nombre de la columna que ya devuelve `/fr/sync/clientes`. **Acepta solo esta lista.**
Cualquier otro `CAMPO` responde `ok: false` con `"Campo no editable: X"`.

| CAMPO | Dato en la app | Tipo de VALOR | Reglas |
|---|---|---|---|
| `NOM_CLT` | Nombre | texto | requerido. Va donde lee `/clientes` (hoy `CLIENTE_RT.NOMBRE`) |
| `DIR_CLT` | Dirección | texto | |
| `NOM_CTO` | Contacto | texto | columna NOT NULL: `""` se guarda como `""` |
| `NUM_TEL` | Teléfono | texto | columna NOT NULL: `""` se guarda como `""` |
| `codActividad` | Código de actividad | texto | `""` → NULL |
| `desActividad` | Descripción de actividad | texto | `""` → NULL |
| `nomEncargadoCompras` | Encargado de compras | texto | `""` → NULL |
| `telEncargadoCompras` | Teléfono encargado de compras | texto | `""` → NULL |
| `nomEncargadoPagos` | Encargado de pagos | texto | `""` → NULL |
| `telEncargadoPagos` | Teléfono encargado de pagos | texto | `""` → NULL |
| `COD_TIP_CL` | Tipo de cliente | texto (código) | debe existir en `alFAC_TIP_CLT` (catálogo `tiposCliente`) |
| `NIVEL_PRECIO` | Nivel de precio | texto (nombre, ej. `DISTRIBUIDOR`) | debe existir en `NIVEL_LISTA` (catálogo `nivelesPrecio`). Si en el ERP el nivel también define `LST_PRE`, actualízalo con la `LISTA` del nivel |
| `DIVISION_GEOGRAFICA1` | Departamento | texto | lo escribe el vendedor, sin catálogo: **no** lo valides contra `DIVISION_GEOGRAFICA1`. `""` → NULL. Recorta al largo de la columna |
| `DIVISION_GEOGRAFICA2` | Municipio | texto | igual que el departamento (texto libre, `""` → NULL) |
| `DIVISION_GEOGRAFICA3` | Distrito | texto | igual (texto libre, `""` → NULL). Es la columna nueva de CLIENTE_CIA |
| `DIA_CRE` | Días de crédito | entero ≥ 0 | |
| `LIM_CRE` | Límite de crédito | número ≥ 0 | |
| `POR_EXC_VT` | Exento imp. ventas (%) | número 0–100 | |
| `POR_EXC_CS` | Exento imp. selectivo consumo (%) | número 0–100 | |
| `IND_MON` | Moneda | `"L"` o `"D"` | |
| `DESCUENTO` | Descuento general (%) | número 0–100 | |

Valida en el backend también, aunque la app ya valida. Recorta los textos al largo de su columna
o responde error si no caben (lo que ya hagan en otros registros).

`DIAS_VISITA` (días de visita de la ruta) **no** es editable: si llegara, responde
`ok: false` con `"Campo no editable: DIAS_VISITA"`.

## 3. Respuesta

En `result`, junto a las demás claves, agrega `cambiosCliente`: **un resultado por cada fila
recibida, en el mismo orden**.

```json
{ "success": true, "errors": [], "result": { "...": [], "cambiosCliente": [ { "ok": true }, { "ok": false, "error": "La ruta 009 no pertenece al usuario" } ] } }
```

- `ok: true`: la app marca el cambio como enviado.
- `ok: false` + `error`: la app deja el cambio pendiente, muestra el error y lo vuelve a mandar en el
  siguiente envío. **Un error en un cambio no debe hacer fallar el request completo.** Solo esa fila
  lleva `ok: false`.
- Volver a aplicar el mismo cambio tiene que ser seguro, porque es un `UPDATE` al mismo valor. Esto
  pasa si se corta la red después de guardar y antes de que la app reciba la respuesta. En ese caso
  responde `ok: true`.
- Si el cliente no existe o no se puede resolver al ERP: `ok: false`, con un mensaje claro.
- Si el cliente no tiene fila en CLIENTE_CIA y el campo es de CLIENTE_CIA: `ok: false`. No crees la
  fila.

## 4. Cómo implementarlo

- Va en el mismo controlador de `enviar`, con el mismo estilo que `promocionales` (`sequelize.query`
  con `replacements`).
- Arma un mapa `CAMPO → { tabla, columna, tipo, validar }` con la tabla de la sección 2. **Nunca
  armes el nombre de la columna con el texto que llega.** Toma la columna del mapa, para evitar
  inyección SQL.
- Por cada fila: valida el campo y el valor, resuelve el cliente del ERP como en `/clientes`,
  ejecuta el `UPDATE` y agrega `{ ok: true }`. Si algo falla,
  agrega `{ ok: false, error }`.
- Si el `enviar` usa una sola transacción para todo, procesa `cambiosCliente` con un
  `SAVE TRANSACTION` por fila, o sin transacción, para que un error de SQL en un cambio no aborte
  el resto del envío.
- Bitácora (opcional, recomendada): guarda cada cambio con usuario/agente del token, `COD_CLT`,
  `CAMPO`, `VALOR_ANTERIOR`, `VALOR` y `FECHA`, para saber quién cambió qué. Sobre todo para el
  crédito, el descuento y las exenciones.

## 5. Pruebas

1. **Postman:** `POST {{baseUrl}}/fr/sync/enviar` con el cuerpo del ejemplo. Debe responder
   `cambiosCliente: [{ "ok": true }]` y los datos deben quedar cambiados en la base.
2. Manda **el mismo cuerpo otra vez**: debe responder `ok: true` otra vez.
3. Manda un `CAMPO` inventado (`"CAMPO": "COD_CLT"`): esa fila debe responder `ok: false` y las demás
   deben aplicarse igual.
4. `GET /fr/sync/clientes` debe devolver los valores nuevos (nombre, límite, etc.).
5. **En la app:** Consultar > Cliente → lápiz rojo → cambiar uno o varios datos → Guardar cambios →
   confirmar. La app los envía en ese momento, en un `POST /fr/sync/enviar` que trae **solo**
   `cambiosCliente`; las demás claves van vacías y la respuesta debe traerlas como arreglos vacíos.
   Debe mostrar "Cambios guardados y enviados al servidor". Sin conexión, el dato queda marcado
   "sin enviar" y se manda con Datos → **Enviar Datos**. Después, Datos → **Cargar datos** → el dato
   sigue con el valor nuevo, porque ahora viene del servidor.
