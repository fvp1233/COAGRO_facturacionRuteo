# Promocionales: cambios en el backend

La app móvil ya:
- **descarga** las solicitudes con `GET /fr/sync/promocionales` (en *Cargar datos*), y
- **sube** las solicitudes nuevas dentro de `POST /fr/sync/enviar`, en la clave `promocionales`.

Hay que hacer dos cosas en el backend:
1. Que `POST /fr/sync/enviar` reciba y guarde `promocionales`.
2. Revisar que `GET /fr/sync/promocionales` devuelva las fechas en el formato correcto.

---

## 1. Tabla en el servidor

Se asume `COAGRO2.erpadmin.PROMOCIONAL`, con `ID` autonumérico. Si tu tabla ya existe con otro nombre, solo cámbialo en las consultas. Si no existe:

```sql
CREATE TABLE erpadmin.PROMOCIONAL (
  ID               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  CLIENTE          VARCHAR(20)  NOT NULL,
  FECHA_SOLICITUD  DATETIME     NOT NULL,
  RUTA             VARCHAR(4)   NOT NULL,
  NOM_CLT          VARCHAR(150) NULL,
  AGENTE           VARCHAR(10)  NULL,
  NOTAS            VARCHAR(200) NOT NULL,
  FECHA_REQUERIDA  DATETIME     NOT NULL,
  DOC_PRO          CHAR(1)      NOT NULL DEFAULT 'N',   -- 'N' pendiente, 'S' procesada
  FECHA_PROCESADO  DATETIME     NULL,
  FECHA_ENVIO      DATETIME     NOT NULL DEFAULT GETDATE(), -- cuándo llegó de la handheld
  CONSTRAINT UQ_PROMOCIONAL_CLIENTE_FECHA UNIQUE (CLIENTE, FECHA_SOLICITUD)
);
```

- La llave única `CLIENTE + FECHA_SOLICITUD` es la misma que usa la app. Gracias a ella, **reenviar la misma solicitud no la duplica**. Esto pasa si se corta la red después de guardar y antes de que la app reciba la respuesta.
- La app recorta `NOTAS` a **200 caracteres**. Si tu columna es más corta, avísame para cambiar el límite en la app.

---

## 2. `POST /fr/sync/enviar`: recibir `promocionales`

### Lo que manda la app

```json
{
  "ubicaciones": [], "visitas": [], "pedidos": [], "aprobaciones": [], "depositos": [], "consecutivos": [],
  "promocionales": [
    {
      "CLIENTE": "00109",
      "FECHA_SOLICITUD": "2026-11-13 09:15:42",
      "RUTA": "001",
      "NOM_CLT": "AGROSERVICIO EL EJEMPLO",
      "AGENTE": "AG01",
      "NOTAS": "2 exhibidores y 50 afiches de Credelio",
      "FECHA_REQUERIDA": "2026-11-20 00:00:00"
    }
  ]
}
```

- Las fechas vienen como `'YYYY-MM-DD HH:MM:SS'` en **hora local** (sin zona), igual que las visitas y los pedidos. `FECHA_REQUERIDA` llega a medianoche.
- `AGENTE` y `NOM_CLT` pueden venir en `null`.
- `promocionales` solo se manda cuando hay solicitudes nuevas. Si no hay, la clave puede no venir: trátala como `[]`.

### Lo que debe responder

Un resultado por cada solicitud, **en el mismo orden en que llegaron**, dentro de `result.promocionales`:

```json
{
  "result": {
    "ubicaciones": [], "visitas": [], "pedidos": [], "aprobaciones": [], "consecutivos": [],
    "promocionales": [
      { "ok": true, "ID": 15 },
      { "ok": false, "error": "La ruta 009 no pertenece a esta handheld" }
    ]
  },
  "success": true,
  "errors": []
}
```

- `ok: true` + `ID`: la app la marca como enviada y guarda el `ID`.
- **Si la solicitud ya existía** (mismo `CLIENTE` + `FECHA_SOLICITUD`), responde `ok: true` con el `ID` que ya tenía. Es un reenvío, no un error.
- `ok: false` + `error`: la app la deja pendiente y muestra el error en la card. **Un error en una solicitud no debe hacer fallar el request completo**; solo esa fila lleva `ok: false`.
- Si el backend manda `promocionales` vacío o con menos filas de las que recibió, la app marca las que falten como error y las vuelve a enviar en el siguiente envío.

### Código sugerido

Va en el mismo controlador de `enviar`, con el mismo estilo que `getSyncClientes` (`sequelize.query` y `QueryTypes`). Ajusta `rutasHandheld` a como ya obtienes las rutas del token en los otros registros (visitas y pedidos).

```js
const { QueryTypes } = require("sequelize");

const LARGO_NOTAS = 200;
const FECHA_SQL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const txt = (v) => (v == null ? null : String(v).trim());

// Guarda las solicitudes de promocionales de la handheld. Devuelve un resultado por fila, en orden.
// rutasHandheld: Set con las rutas del token (las mismas que validas para visitas y pedidos).
async function procesarPromocionales(promocionales, rutasHandheld, transaction) {
  const resultados = [];
  for (const p of Array.isArray(promocionales) ? promocionales : []) {
    try {
      const CLIENTE = txt(p?.CLIENTE);
      const RUTA = txt(p?.RUTA);
      const NOTAS = txt(p?.NOTAS);
      const FECHA_SOLICITUD = txt(p?.FECHA_SOLICITUD);
      const FECHA_REQUERIDA = txt(p?.FECHA_REQUERIDA);

      if (!CLIENTE || !RUTA || !NOTAS) throw new Error("Faltan CLIENTE, RUTA o NOTAS");
      if (!FECHA_SQL.test(FECHA_SOLICITUD || "") || !FECHA_SQL.test(FECHA_REQUERIDA || "")) {
        throw new Error("Fechas con formato inválido (se espera YYYY-MM-DD HH:MM:SS)");
      }
      if (rutasHandheld && !rutasHandheld.has(RUTA)) {
        throw new Error(`La ruta ${RUTA} no pertenece a esta handheld`);
      }

      // Reenvío: si ya existe, se devuelve el mismo ID (no se duplica).
      const [existente] = await sequelize.query(
        `SELECT ID FROM COAGRO2.erpadmin.PROMOCIONAL
          WHERE CLIENTE = :CLIENTE AND FECHA_SOLICITUD = CONVERT(datetime, :FECHA_SOLICITUD, 120)`,
        { replacements: { CLIENTE, FECHA_SOLICITUD }, type: QueryTypes.SELECT, transaction }
      );
      if (existente) {
        resultados.push({ ok: true, ID: existente.ID });
        continue;
      }

      // Las fechas se convierten con estilo 120 (texto local -> datetime), sin pasar por Date de JS,
      // para que no se corran por la zona horaria.
      const [nuevo] = await sequelize.query(
        `INSERT INTO COAGRO2.erpadmin.PROMOCIONAL
           (CLIENTE, FECHA_SOLICITUD, RUTA, NOM_CLT, AGENTE, NOTAS, FECHA_REQUERIDA, DOC_PRO)
         OUTPUT INSERTED.ID
         VALUES (:CLIENTE, CONVERT(datetime, :FECHA_SOLICITUD, 120), :RUTA, :NOM_CLT, :AGENTE, :NOTAS,
                 CONVERT(datetime, :FECHA_REQUERIDA, 120), 'N')`,
        {
          replacements: {
            CLIENTE,
            FECHA_SOLICITUD,
            RUTA,
            NOM_CLT: txt(p.NOM_CLT),
            AGENTE: txt(p.AGENTE),
            NOTAS: NOTAS.slice(0, LARGO_NOTAS),
            FECHA_REQUERIDA,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      resultados.push({ ok: true, ID: nuevo?.ID ?? null });
    } catch (error) {
      console.log(error);
      resultados.push({ ok: false, error: error.message || "No se pudo guardar la solicitud" });
    }
  }
  return resultados;
}
```

En el controlador de `enviar`, junto a las otras claves:

```js
const promocionales = await procesarPromocionales(req.body.promocionales, rutasHandheld /*, transaction */);

res.send({
  result: { ubicaciones, visitas, pedidos, aprobaciones, depositos, consecutivos, promocionales },
  success: true,
  errors: [],
});
```

> Si el `enviar` usa **una sola transacción para todo**, un error de SQL en una solicitud puede dejar la transacción abortada. En ese caso procesa `promocionales` sin transacción (cada `INSERT` va solo), o usa un `SAVE TRANSACTION` por fila. Lo importante es que el resto del envío no se pierda por una solicitud.

---

## 3. `GET /fr/sync/promocionales`: revisar el formato

La app ya lo consume. Para que funcione bien:

```json
{
  "result": {
    "promocionales": [
      {
        "ID": 15, "CLIENTE": "00109", "RUTA": "001", "NOM_CLT": "AGROSERVICIO EL EJEMPLO", "AGENTE": "AG01",
        "NOTAS": "2 exhibidores y 50 afiches de Credelio",
        "FECHA_SOLICITUD": "2026-11-13 09:15:42",
        "FECHA_REQUERIDA": "2026-11-20 00:00:00",
        "DOC_PRO": "N",
        "FECHA_PROCESADO": null,
        "FECHA_ENVIO": "2026-11-13 09:20:03"
      }
    ]
  },
  "success": true,
  "errors": []
}
```

- **Fechas como texto local**, no como `Date`. Si Sequelize devuelve un `datetime` como `Date`, al convertirlo a JSON sale en UTC (`...T15:15:42.000Z`) y la hora se corre 6 horas. Conviértelas en el `SELECT`:
  ```sql
  SELECT ID, CLIENTE, RUTA, NOM_CLT, AGENTE, NOTAS, DOC_PRO,
         CONVERT(varchar(19), FECHA_SOLICITUD, 120) AS FECHA_SOLICITUD,
         CONVERT(varchar(19), FECHA_REQUERIDA, 120) AS FECHA_REQUERIDA,
         CONVERT(varchar(19), FECHA_PROCESADO, 120) AS FECHA_PROCESADO,
         CONVERT(varchar(19), FECHA_ENVIO, 120)     AS FECHA_ENVIO
    FROM COAGRO2.erpadmin.PROMOCIONAL
   WHERE RUTA IN (:rutasHandheld)
   ORDER BY FECHA_SOLICITUD DESC
  ```
- **Filtra por las rutas de la handheld** (las del token), igual que los demás `sync`.
- `CLIENTE`, `FECHA_SOLICITUD`, `RUTA` y `FECHA_REQUERIDA` no pueden venir vacíos: la app descarta esas filas.
- Si quieres limitar el volumen, puedes devolver solo los últimos meses, por ejemplo `FECHA_SOLICITUD >= DATEADD(month, -3, GETDATE())`.

---

## 4. Cómo probarlo

1. **Postman:** `POST {{baseUrl}}/fr/sync/enviar` con el header `Authorization: Bearer {{tokenMovil}}` y el cuerpo del ejemplo de la sección 2. Debe responder `promocionales: [{ "ok": true, "ID": … }]`.
2. Manda **el mismo cuerpo otra vez**: debe responder `ok: true` con el **mismo ID**, y en la tabla debe haber una sola fila.
3. `GET {{baseUrl}}/fr/sync/promocionales`: la solicitud debe aparecer con las fechas exactas que se mandaron (misma hora, sin `T` ni `Z`).
4. **En la app:**
   - Validar → **Promocionales** → **Nueva solicitud**. Aparece con la etiqueta "Sin enviar".
   - Datos → **Enviar Datos**. La etiqueta "Sin enviar" desaparece y la card muestra "Solicitud N" con el ID del servidor.
   - Datos → **Cargar datos**. La solicitud se mantiene, sin duplicarse.
   - Marca `DOC_PRO = 'S'` y `FECHA_PROCESADO` en el servidor y vuelve a **Cargar datos**. La card cambia a **Procesada**.
