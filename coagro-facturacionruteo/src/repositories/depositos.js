import { getDatabase } from '../db/database';

// Recibos de cobro como depósitos (alCXC_ENC_DEP local; se suben con POST /fr/sync/enviar -> depositos).
// Cada pago a un documento es UN recibo: un encabezado en alCXC_ENC_DEP con NUM_DEP = número del
// recibo (RUTA_CONSECUT_RT.RECIBO de la ruta) y la cuenta de banco elegida, y una línea por documento
// en alCXC_DET_DEP con el monto de cada forma de pago. Cada forma de pago (COBRO_PAGO_DET) apunta a
// su recibo con DEP_CIA + DEP_BCO + DEP_CTA + DEP_NUM.

const EPS = 0.005;

// Largos de las columnas de texto en el servidor (erpadmin.alCXC_DET_DEP / alCXC_ENC_DEP).
const LARGO_REF = 80;
const LARGO_NOTAS = 80;
const corta = (v, max) => (v == null ? null : String(v).slice(0, max));
const redondea = (n) => Math.round(n * 100) / 100;

// Texto plano de REF (alCXC_DET_DEP): números de transferencia y boleta del depósito del cliente, y
// los cheques. Ej.: 'TRA 778899; DEP 5566; CH 1234 BCO AGRICOLA CTA 5678 15/11/2026 $50.00'.
const textoRef = (filas) =>
  filas
    .map((f) => {
      if (f.FORMA === 'TRANSFERENCIA') return f.NUM_TRANSACCION ? `TRA ${f.NUM_TRANSACCION}` : null;
      if (f.FORMA === 'DEPOSITO') return f.NUM_TRANSACCION ? `DEP ${f.NUM_TRANSACCION}` : null;
      if (f.FORMA === 'CHEQUE') {
        return [
          `CH ${f.NUM_CHEQUE ?? ''}`.trim(),
          f.BANCO_CHEQUE ? `BCO ${f.BANCO_CHEQUE}` : null,
          f.NUM_CUENTA ? `CTA ${f.NUM_CUENTA}` : null,
          f.FECHA_CHEQUE,
          `$${Number(f.MONTO).toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(' ');
      }
      return null;
    })
    .filter(Boolean)
    .join('; ');

// Recibos pendientes de enviar, en el formato de POST /fr/sync/enviar -> depositos.
// Las líneas se agrupan por documento (el servidor rechaza un NUM_DOC repetido): MON_EFE (efectivo),
// MON_CHE (cheques), MON_DEP (depósito del cliente), MON_TRA (transferencia) y REF. MON_DEP y MON_TRA
// solo van si tienen monto. MON_DEP del encabezado = suma de todas las líneas.
// Solo se envían los recibos (ORIGEN 'RECIBO', NUM_DEP = RERT_<ruta>_<n>): los depósitos de pruebas
// con el diseño anterior (ORIGEN 'PAGO' / 'DEPOSITO', NUM_DEP = boleta o transferencia) ya no aplican,
// no se envían ni cuentan como pendientes (no bloquean Cargar datos).
export async function leerDepositosPendientes(db) {
  const encabezados = await db.getAllAsync(
    "SELECT * FROM alCXC_ENC_DEP WHERE ENVIADO = 0 AND ORIGEN = 'RECIBO' ORDER BY FEC_DEP"
  );
  const depositos = [];
  for (const e of encabezados) {
    const filas = await db.getAllAsync(
      `SELECT d.FORMA, d.MONTO, d.NUM_CHEQUE, d.NUM_CUENTA, d.FECHA_CHEQUE, d.NUM_TRANSACCION, d.BANCO_CHEQUE, p.NUM_DOC
         FROM COBRO_PAGO_DET d JOIN COBRO_PAGO p ON p.ID = d.ID_PAGO
        WHERE d.DEP_CIA = ? AND d.DEP_BCO = ? AND d.DEP_CTA = ? AND d.DEP_NUM = ?
        ORDER BY p.NUM_DOC, d.ID_PAGO, d.LINEA`,
      [e.COD_CIA, e.COD_BCO, e.CTA_BCO, e.NUM_DEP]
    );
    if (!filas.length) continue;

    const porDoc = new Map();
    for (const f of filas) {
      const l = porDoc.get(f.NUM_DOC) ?? { NUM_DOC: f.NUM_DOC, MON_EFE: 0, MON_CHE: 0, MON_DEP: 0, MON_TRA: 0, filas: [] };
      const monto = Number(f.MONTO ?? 0);
      if (f.FORMA === 'EFECTIVO') l.MON_EFE += monto;
      else if (f.FORMA === 'CHEQUE') l.MON_CHE += monto;
      else if (f.FORMA === 'DEPOSITO') l.MON_DEP += monto;
      else if (f.FORMA === 'TRANSFERENCIA') l.MON_TRA += monto;
      l.filas.push(f);
      porDoc.set(f.NUM_DOC, l);
    }
    const lineas = [...porDoc.values()].map((l) => ({
      NUM_DOC: l.NUM_DOC,
      MON_EFE: redondea(l.MON_EFE),
      MON_CHE: redondea(l.MON_CHE),
      ...(l.MON_DEP > EPS ? { MON_DEP: redondea(l.MON_DEP) } : {}),
      ...(l.MON_TRA > EPS ? { MON_TRA: redondea(l.MON_TRA) } : {}),
      // REF admite 80 caracteres: con muchos cheques se recorta (el detalle completo queda en el equipo).
      REF: corta(textoRef(l.filas), LARGO_REF) || null,
    }));
    const total = redondea(
      lineas.reduce((s, l) => s + l.MON_EFE + l.MON_CHE + (l.MON_DEP ?? 0) + (l.MON_TRA ?? 0), 0)
    );
    if (total <= EPS) continue;

    depositos.push({
      encabezado: {
        COD_CIA: e.COD_CIA,
        COD_BCO: e.COD_BCO,
        CTA_BCO: e.CTA_BCO,
        NUM_DEP: e.NUM_DEP,
        MON_DEP: total,
        FEC_DEP: e.FEC_DEP,
        IND_MON: e.IND_MON,
        NOTAS: corta(e.NOTAS, LARGO_NOTAS),
        // Sin procesar: lo cambia después el proceso de la web.
        DOC_PRO: 'N',
      },
      lineas,
    });
  }
  return depositos;
}

// --- Recibos pendientes del servidor (GET /fr/sync/recibosPendientes) ------------------------------
// DOC_PRO del recibo en el servidor: 'N' = pendiente (control aún no lo aplica en el ERP), 'S' =
// aplicado. El servidor solo manda los 'N' de esta handheld. Se guarda localmente en
// alCXC_ENC_DEP.DOC_PRO: los 'S' ya no se descuentan del saldo del documento (ver repositories/cobros).

const t = (v) => (v == null ? '' : String(v).trim());
const num = (v) => Number(v ?? 0) || 0;
const WHERE_RECIBO = 'COD_CIA = ? AND COD_BCO = ? AND CTA_BCO = ? AND NUM_DEP = ?';
const WHERE_DET_RECIBO = 'DEP_CIA = ? AND DEP_BCO = ? AND DEP_CTA = ? AND DEP_NUM = ?';

// Formas de pago de una línea de alCXC_DET_DEP. Los números de transferencia / boleta y el detalle de
// los cheques salen de REF ('TRA 778899; DEP 5566; CH 1234 BCO X CTA 5678 11/11/2026 $100.00'). Si REF
// se recortó (80 caracteres) y no cuadra con MON_CHE, lo que falte va en un cheque sin detalle.
export function formasDeLinea(l) {
  const partes = t(l.REF).split(';').map((x) => x.trim()).filter(Boolean);
  const tra = partes.map((x) => /^TRA (\S+)$/.exec(x)?.[1]).find(Boolean) ?? null;
  const dep = partes.map((x) => /^DEP (\S+)$/.exec(x)?.[1]).find(Boolean) ?? null;
  const cheques = partes
    .map((x) => /^CH (\S*)(?: BCO (.+?))?(?: CTA (\S+))?(?: (\d{2}\/\d{2}\/\d{4}))? \$([\d.]+)$/.exec(x))
    .filter(Boolean)
    .map((m) => ({
      forma: 'CHEQUE',
      monto: num(m[5]),
      numeroCheque: m[1] || null,
      banco: m[2] ?? null,
      cuenta: m[3] ?? null,
      fecha: m[4] ?? null,
    }));

  const formas = [];
  if (num(l.MON_EFE) > EPS) formas.push({ forma: 'EFECTIVO', monto: num(l.MON_EFE) });
  const totalCheques = num(l.MON_CHE);
  if (totalCheques > EPS) {
    let detallados = 0;
    for (const c of cheques) {
      if (detallados + c.monto > totalCheques + EPS) break;
      formas.push(c);
      detallados += c.monto;
    }
    if (totalCheques - detallados > EPS) formas.push({ forma: 'CHEQUE', monto: redondea(totalCheques - detallados) });
  }
  if (num(l.MON_TRA) > EPS) formas.push({ forma: 'TRANSFERENCIA', monto: num(l.MON_TRA), transaccion: tra });
  if (num(l.MON_DEP) > EPS) formas.push({ forma: 'DEPOSITO', monto: num(l.MON_DEP), transaccion: dep });
  return formas;
}

// Borra del equipo un recibo con sus pagos (COBRO_PAGO + COBRO_PAGO_DET).
async function borrarRecibo(db, llave) {
  const pagos = await db.getAllAsync(`SELECT DISTINCT ID_PAGO FROM COBRO_PAGO_DET WHERE ${WHERE_DET_RECIBO}`, llave);
  for (const { ID_PAGO } of pagos) {
    await db.runAsync('DELETE FROM COBRO_PAGO_DET WHERE ID_PAGO = ?', [ID_PAGO]);
    await db.runAsync('DELETE FROM COBRO_PAGO WHERE ID = ?', [ID_PAGO]);
  }
  await db.runAsync(`DELETE FROM alCXC_ENC_DEP WHERE ${WHERE_RECIBO}`, llave);
}

// Guarda en el equipo un recibo pendiente que llegó del servidor y no estaba (reinstalación, otro
// equipo de la misma handheld): encabezado + un pago por línea (documento) con sus formas de pago.
async function insertarReciboServidor(db, r) {
  const llave = [t(r.COD_CIA), t(r.COD_BCO), t(r.CTA_BCO), t(r.NUM_DEP)];
  const fecha = t(r.FEC_DEP);
  const moneda = t(r.IND_MON) === 'D' ? 'D' : 'L';
  await db.runAsync(
    `INSERT OR REPLACE INTO alCXC_ENC_DEP
       (COD_CIA, COD_BCO, CTA_BCO, NUM_DEP, FEC_DEP, IND_MON, NOTAS, ORIGEN, ENVIADO, CONSEC_DEP, DOC_PRO)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'RECIBO', 1, ?, 'N')`,
    [...llave, fecha, moneda, r.NOTAS ?? null, r.CONSEC_DEP ?? null]
  );
  for (const l of Array.isArray(r.lineas) ? r.lineas : []) {
    const formas = formasDeLinea(l);
    if (!formas.length) continue;
    const res = await db.runAsync(
      `INSERT INTO COBRO_PAGO (COD_CIA, COD_CLT, COD_ZON, COD_TIP_DC, NUM_DOC, MONEDA, FECHA, MONTO, ENVIADO, NUM_REC)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        llave[0] || null,
        t(l.COD_CLT),
        t(l.COD_ZON),
        t(l.COD_TIP_DC),
        t(l.NUM_DOC),
        moneda,
        fecha,
        redondea(formas.reduce((s, f) => s + f.monto, 0)),
        llave[3],
      ]
    );
    let linea = 1;
    for (const f of formas) {
      await db.runAsync(
        `INSERT INTO COBRO_PAGO_DET
           (ID_PAGO, LINEA, FORMA, MONTO, NUM_CHEQUE, NUM_CUENTA, BANCO_CHEQUE, FECHA_CHEQUE, NUM_TRANSACCION,
            COD_CIA, COD_BCO, DEP_CIA, DEP_BCO, DEP_CTA, DEP_NUM)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          res.lastInsertRowId,
          linea++,
          f.forma,
          f.monto,
          f.numeroCheque ?? null,
          f.forma === 'CHEQUE' ? f.cuenta ?? null : llave[2],
          f.forma === 'CHEQUE' ? f.banco ?? null : null,
          f.fecha ?? null,
          f.transaccion ?? null,
          llave[0] || null,
          llave[1],
          ...llave,
        ]
      );
    }
  }
}

// Cuadra los recibos del equipo con los pendientes del servidor, como parte de "Cargar datos" (lo que
// estaba pendiente de enviar ya se envió antes de cargar):
// - Recibo enviado que el servidor manda (DOC_PRO 'N'): se queda (el del equipo tiene más detalle).
// - Recibo enviado que el servidor ya no manda: control lo aplicó ('S'). Se borra del equipo, salvo los
//   de hoy, que se conservan (marcados 'S') para poder reimprimirlos.
// - Recibo del servidor que el equipo no tiene: se agrega.
export async function sincronizarRecibos(db, recibos) {
  const delServidor = new Map(recibos.map((r) => [`${t(r.CTA_BCO)}|${t(r.NUM_DEP)}`, r]));
  const locales = await db.getAllAsync(
    "SELECT COD_CIA, COD_BCO, CTA_BCO, NUM_DEP FROM alCXC_ENC_DEP WHERE ORIGEN = 'RECIBO' AND ENVIADO = 1"
  );
  for (const e of locales) {
    const llave = [e.COD_CIA, e.COD_BCO, e.CTA_BCO, e.NUM_DEP];
    const clave = `${e.CTA_BCO}|${e.NUM_DEP}`;
    if (delServidor.has(clave)) {
      await db.runAsync(`UPDATE alCXC_ENC_DEP SET DOC_PRO = 'N' WHERE ${WHERE_RECIBO}`, llave);
      delServidor.delete(clave);
      continue;
    }
    const deHoy = await db.getFirstAsync(
      `SELECT 1 AS x FROM COBRO_PAGO p JOIN COBRO_PAGO_DET d ON d.ID_PAGO = p.ID
        WHERE d.DEP_CIA = ? AND d.DEP_BCO = ? AND d.DEP_CTA = ? AND d.DEP_NUM = ?
          AND date(p.FECHA) = date('now', 'localtime')
        LIMIT 1`,
      llave
    );
    if (deHoy) await db.runAsync(`UPDATE alCXC_ENC_DEP SET DOC_PRO = 'S' WHERE ${WHERE_RECIBO}`, llave);
    else await borrarRecibo(db, llave);
  }
  for (const r of delServidor.values()) await insertarReciboServidor(db, r);
}

// Marca como enviados los pagos cuyo recibo ya se envió.
export async function marcarPagosEnviados(db) {
  await db.runAsync(
    `UPDATE COBRO_PAGO SET ENVIADO = 1
      WHERE ENVIADO = 0
        AND NOT EXISTS (
          SELECT 1 FROM COBRO_PAGO_DET d
            LEFT JOIN alCXC_ENC_DEP e
                   ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
           WHERE d.ID_PAGO = COBRO_PAGO.ID AND COALESCE(e.ENVIADO, 0) = 0)`
  );
}
