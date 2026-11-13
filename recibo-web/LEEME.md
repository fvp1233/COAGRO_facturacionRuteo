# Recibo de cobro de Coagro, para la web

Es el mismo formato que genera la app móvil al pagar un documento en **Cobros** (Pagar → Recibo).

| Archivo | Qué es |
| --- | --- |
| `recibo.js` | Plantilla sin dependencias (navegador o Node). Exporta `htmlRecibo`, `reciboDesdeServidor`, `formasDeLinea`, `montoALetras` y `formatMonto`. |
| `recibo-ejemplo.html` | Un recibo generado con la plantilla. Ábrelo en el navegador para verlo. |

## Uso

```js
import { htmlRecibo, reciboDesdeServidor } from './recibo.js';

// enc = fila de erpadmin.alCXC_ENC_DEP, linea = su fila de erpadmin.alCXC_DET_DEP
const recibo = reciboDesdeServidor(enc, linea, {
  cliente: '00109', nombreCliente: 'AGROSERVICIO …',
  tecnico: 'AG01', nombreTecnico: 'JUAN PÉREZ',
  nombreCuenta: 'BANCO AGRICOLA CORRIENTE',
  saldoAnterior: 500, saldoNuevo: 274.5,          // opcionales
});
const html = htmlRecibo(recibo, { logo: '/img/logo.jpeg' });
```

- **Navegador:** abre `html` en una ventana nueva y llama a `print()`, o ponlo en un `iframe`.
- **Node:** pásalo a Puppeteer con `page.pdf({ format: 'Letter', printBackground: true })` para obtener el PDF. `printBackground` es necesario para que salgan los fondos verdes.
- **Logo:** usa el mismo de la cotización (`efacturaBackendCoagro/template/logo.jpeg`), como URL o como data URI.
- Si tu backend usa CommonJS, cambia los `export` por `module.exports`.

## Cómo guarda la app el recibo en el servidor

Cada pago a un documento es **un recibo**. La app lo sube con `POST /fr/sync/enviar` en `depositos`:

- **`alCXC_ENC_DEP`** (encabezado):
  - `NUM_DEP` = número del recibo (`RERT_<ruta>_<n>`)
  - `FEC_DEP` = fecha y hora
  - `IND_MON` = `D` o `L`
  - `COD_BCO` / `CTA_BCO` = cuenta donde entra el dinero
  - `NOTAS`
  - `DOC_PRO` = `N` (pendiente) hasta que control lo aplica
- **`alCXC_DET_DEP`** (una línea por documento): `NUM_DOC`, `MON_EFE` (efectivo), `MON_CHE` (cheques), `MON_TRA` (transferencia), `MON_DEP` (depósito) y `REF`.
- **`REF`** lleva el detalle en texto, separado por `;`:
  `TRA 778899; DEP 5566; CH 1234 BCO AGRICOLA CTA 5678 15/11/2026 $100.00`
  - `TRA <n>` = número de la transferencia; `DEP <n>` = boleta del depósito.
  - `CH <número> BCO <banco> CTA <cuenta> <dd/mm/aaaa> $<monto>` = un cheque. Banco, cuenta y fecha son opcionales.
  - Admite 80 caracteres. Con muchos cheques se recorta, y lo que falte para cuadrar con `MON_CHE` sale como un cheque sin detalle. `formasDeLinea` ya lo maneja.

## El objeto `recibo`

Lo arma `reciboDesdeServidor`, o puedes armarlo tú directamente:

| Campo | De dónde sale | En el recibo |
| --- | --- | --- |
| `recibo` | `alCXC_ENC_DEP.NUM_DEP` | Caja verde "No. de recibo" |
| `fecha` | `alCXC_ENC_DEP.FEC_DEP` (`'YYYY-MM-DD HH:MM:SS'`) | Fecha y hora |
| `documento` | `alCXC_DET_DEP.NUM_DOC` | Caja "Documento" y columna "Factura No." |
| `moneda` | `alCXC_ENC_DEP.IND_MON` | "Dólar (USD)" / "Moneda local" |
| `monto` | Suma de las formas de pago | "La suma de" (en letras y en cifra), Pagado y TOTAL |
| `cuenta` / `nombreCuenta` | `CTA_BCO` / `alCXC_CTA_BCO.NOM_CTA` | "Cuenta" |
| `notas` | `alCXC_ENC_DEP.NOTAS` | "Referencias y notas" |
| `cliente` / `nombreCliente` | Cliente del documento (ej. `alCXC_PEN_COB.COD_CLT` + `CLIENTE.NOM_CLT`) | "Recibimos de" |
| `tecnico` / `nombreTecnico` | Agente dueño de la ruta (en la app: `AGENTE` / `NOMBRE_AGENTE` del documento; si no hay agente, la ruta) | "Técnico / ruta" |
| `saldoAnterior` / `saldoNuevo` | Saldo del documento antes y después del pago (*no está en las tablas de depósito*) | Filas "Saldo anterior" y "Saldo pendiente". Si van `null`, no salen. |
| `cancelado` | `saldoNuevo <= 0` | Estado **CANCELADO** (verde) o **ABONO** (naranja) |
| `formas[]` | `formasDeLinea(linea)` | Tabla "Tipo de pago" y referencias |

Cada elemento de `formas` tiene `{ forma, monto, numeroCheque?, banco?, fecha?, transaccion? }`, donde `forma` es `EFECTIVO`, `CHEQUE`, `TRANSFERENCIA` o `DEPOSITO`.

## Reglas del formato

- **Tabla "Tipo de pago":**
  - La primera fila lleva el documento con el efectivo, la transferencia, el depósito y el primer cheque.
  - Cada cheque adicional va en su propia fila, con solo el cheque.
  - Las celdas en 0 quedan vacías.
- **Referencias y notas:** una línea por cada transferencia o depósito que tenga número, por ejemplo "Transferencia No. 778899 — $25.50". Debajo van las notas.
- **Montos:** `$1,234.50`. El monto en letras va en mayúsculas, con los centavos en /100 y la palabra "DÓLARES" al final: "DOSCIENTOS VEINTICINCO CON 50/100 DÓLARES".
- **Fechas:** se leen del texto `'YYYY-MM-DD'` sin pasar por `Date`, para que no se corran de día por la zona horaria.
- **Datos del emisor** (`EMISOR` en `recibo.js`) y texto legal al pie: "Este recibo no tiene validez si no lleva la firma del cliente y del técnico - vendedor. Todo cheque rechazado tendrá un cargo de $10.00 más IVA."
