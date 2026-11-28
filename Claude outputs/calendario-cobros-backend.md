# Cambios de backend: Calendario de cobros por vendedor

Contexto: la app móvil (Facturación Ruteo) tiene un Calendario de cobros con dos vistas:

- **Todos los documentos**: todos los documentos con saldo de los clientes de las rutas asignadas a la handheld, **sin importar el vendedor que hizo la factura**. Si dos vendedores atienden al mismo cliente, cada uno ve también las facturas del otro y puede saber si el otro ya le cobró.
- **Mis documentos**: el mismo listado filtrado en la app por el vendedor de la factura (`documentos_cc.VENDEDOR`) = vendedor de la handheld.

La app ya está lista para recibir estos datos. Si los campos o el endpoint nuevo todavía no existen, la app sigue funcionando sin ellos. Se necesitan dos cambios.

---

## 1. Modificar `GET /fr/sync/cobros`

Endpoint existente: con token, rol RUTA, y las rutas salen del token. Hoy devuelve `{ result: { documentos: [...] } }` con los campos de `alCXC_PEN_COB` más `AGENTE` y `NOMBRE_AGENTE`. **No quitar ni renombrar nada de lo que ya devuelve.**

### a) Alcance de los documentos

Devolver **todos los documentos con saldo > 0** (`documentos_cc`, todos los tipos que ya se mandan hoy, vencidos y por vencer) de **todos los clientes que pertenecen a alguna de las rutas de la handheld**, sin importar:

- el vendedor de la factura (`documentos_cc.VENDEDOR`);
- la ruta a la que esté asignado el documento.

Si un cliente está en una ruta de la handheld y en otra ruta de otro vendedor, sus facturas de los dos vendedores deben venir.

Lo ideal es **una fila por documento** (`COD_TIP_DC` + `NUM_DOC` + `COD_CLT`). Si el cliente está en dos rutas de la handheld, mandar el documento en una sola de ellas, en `COD_ZON`. La app igual elimina duplicados, pero así los totales cuadran también del lado del servidor.

### b) Campos nuevos en cada documento

| Campo | Origen |
|---|---|
| `VENDEDOR` | `documentos_cc.VENDEDOR` (código del ERP, por ejemplo `VCZ`), sin espacios |
| `NOMBRE_VENDEDOR` | Nombre de ese vendedor (tabla `VENDEDOR` de Softland, columna `NOMBRE`) |

### c) Campo nuevo en `result`

```json
{ "result": { "documentos": [ ... ], "vendedores": ["VCZ"] } }
```

`vendedores` lleva los códigos del ERP del vendedor de la handheld del token: el mismo valor que ya devuelve `/fr/sync/metas` en `result.vendedores`. La app lo usa para el filtro "Mis documentos".

### Prueba de cuadre

Para la handheld del vendedor VCZ, la suma de `SALDO_LOCAL` de los documentos con `VENDEDOR = 'VCZ'`, tipo `FAC` y `FEC_VEN >= hoy` debe dar lo mismo que:

```sql
select SUM(SALDO) AS SALDO from cincoh.documentos_cc
where saldo > 0 and tipo = 'FAC' and VENDEDOR = 'VCZ' and FECHA_VENCE >= '<hoy>'
```

---

## 2. Endpoint nuevo `GET /fr/sync/cobrosOtros`

Con token y rol RUTA, igual que los demás `/fr/sync/*`. Las rutas salen del token.

Devuelve los **abonos que OTRAS handhelds ya registraron** (recibos de cobro en `alCXC_ENC_DEP` + `alCXC_DET_DEP` que control **aún no aplica** en el ERP, `DOC_PRO = 'N'`) **a documentos que esta handheld recibe en `/fr/sync/cobros`**.

Reglas:

- **Excluir** los recibos hechos por las rutas de esta misma handheld: esos la app ya los tiene.
- Excluir recibos anulados.
- Cuando control aplica el recibo (`DOC_PRO = 'S'`), el abono deja de venir aquí, porque el saldo de `documentos_cc` ya lo trae descontado.
- Una fila por recibo (cuenta + número) y documento. Si un recibo tiene varias líneas para el mismo documento, sumarlas.

Respuesta:

```json
{
  "result": {
    "abonos": [
      {
        "COD_CIA": "...",
        "COD_TIP_DC": "...",
        "NUM_DOC": "...",
        "COD_CLT": "...",
        "COD_ZON": "ruta que hizo el recibo",
        "CTA_BCO": "cuenta del recibo",
        "NUM_DEP": "número de recibo",
        "FEC_DEP": "YYYY-MM-DD HH:mm:ss",
        "IND_MON": "L o D (moneda del recibo)",
        "MONTO": 50.00,
        "VENDEDOR": "código ERP del vendedor dueño de la ruta que cobró",
        "NOMBRE_VENDEDOR": "nombre de ese vendedor"
      }
    ]
  }
}
```

- `MONTO` = `MON_EFE + MON_CHE + MON_DEP + MON_TRA` de la(s) línea(s) de ese documento en ese recibo, en la moneda `IND_MON`.
- `COD_TIP_DC`, `NUM_DOC` y `COD_CLT` deben venir **igual que en `/fr/sync/cobros`**, porque la app los cruza por esas tres columnas.
- Sin abonos, responder `{ "result": { "abonos": [] } }` (no es un error).

---

## Sin cambios

- `/fr/sync/cobrosAgente` puede quedarse como está: el Calendario ya no lo usa.
- `/fr/sync/recibosPendientes` no cambia.
