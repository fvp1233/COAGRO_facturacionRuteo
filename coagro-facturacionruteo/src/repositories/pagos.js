import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';
import { siguienteConsecutivo } from './pedidos';

// Pagos (abonos) a documentos pendientes de cobro, guardados en el equipo (COBRO_PAGO + COBRO_PAGO_DET).
// Un documento se puede pagar en varios abonos (100 → abona 20 → quedan 80 → ...) y cada abono
// puede combinar varias formas de pago (pago híbrido).

export const FORMAS_PAGO = {
  CHEQUE: 'Cheque',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
};

// 'Local' | 'Dólar' (moneda del cobro) → 'L' | 'D'.
export const codigoMoneda = (moneda) => (String(moneda).toUpperCase().startsWith('D') ? 'D' : 'L');

const claveDoc = (codTipo, documento) => `${codTipo}|${documento}`;

// Número de recibo de un pago (alias p de COBRO_PAGO): NUM_REC o, si quedó vacío, el NUM_DEP del
// recibo (alCXC_ENC_DEP con ORIGEN 'RECIBO') al que apuntan sus formas de pago. Es el mismo correlativo.
// Notas del recibo: van en alCXC_ENC_DEP.NOTAS (varchar(80) en el servidor).
export const MAX_NOTAS_RECIBO = 80;

const SQL_NUM_REC = `COALESCE(NULLIF(p.NUM_REC, ''), (
    SELECT e.NUM_DEP FROM COBRO_PAGO_DET d
      JOIN alCXC_ENC_DEP e
        ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
     WHERE d.ID_PAGO = p.ID AND e.ORIGEN = 'RECIBO'
     LIMIT 1))`;

// Número de recibo (NUM_DEP): letras, dígitos, '_' o '-', terminado en el correlativo numérico
// (RERT_01_00001). El backend valida lo mismo.
const FORMATO_RECIBO = /^[A-Za-z0-9_-]{0,29}\d$/;

// DOC_PRO del recibo de un pago (alias p de COBRO_PAGO): 'N' pendiente, 'S' aplicado por control,
// null si el pago no tiene recibo.
const SQL_DOC_PRO = `(
    SELECT e.DOC_PRO FROM COBRO_PAGO_DET d
      JOIN alCXC_ENC_DEP e
        ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
     WHERE d.ID_PAGO = p.ID
     LIMIT 1)`;

// Abonos de los documentos de un cliente en una ruta, agrupados por documento.
// Devuelve Map clave 'codTipo|documento' → [{ moneda: 'L'|'D', monto, aplicado }].
// aplicado = control ya lo aplicó en el ERP (DOC_PRO 'S'): ya no se descuenta del saldo.
export async function getAbonosCliente({ cliente, ruta }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_TIP_DC, p.NUM_DOC, p.MONEDA, p.MONTO, ${SQL_DOC_PRO} AS DOC_PRO
       FROM COBRO_PAGO p
      WHERE p.COD_CLT = ? AND p.COD_ZON = ?
      ORDER BY p.ID`,
    [cliente, ruta]
  );
  const abonos = new Map();
  for (const r of rows) {
    const clave = claveDoc(r.COD_TIP_DC, r.NUM_DOC);
    const lista = abonos.get(clave) ?? [];
    lista.push({ moneda: r.MONEDA, monto: Number(r.MONTO ?? 0), aplicado: r.DOC_PRO === 'S' });
    abonos.set(clave, lista);
  }
  return abonos;
}

// Abonos registrados a un documento (más reciente primero), con sus formas de pago.
// [{ id, recibo, fecha, moneda, monto, saldoAnterior, saldoNuevo, enviado, formas: [{ forma, monto, ... }] }]
export async function getPagosDocumento({ cliente, ruta, codTipo, documento }) {
  const db = await getDatabase();
  const pagos = await db.getAllAsync(
    `SELECT p.ID, p.FECHA, p.MONEDA, p.MONTO, p.SALDO_ANTERIOR, p.SALDO_NUEVO, p.ENVIADO, ${SQL_NUM_REC} AS NUM_REC
       FROM COBRO_PAGO p
      WHERE p.COD_CLT = ? AND p.COD_ZON = ? AND p.COD_TIP_DC = ? AND p.NUM_DOC = ?
      ORDER BY p.ID DESC`,
    [cliente, ruta, codTipo, documento]
  );
  if (!pagos.length) return [];

  const detalle = await db.getAllAsync(
    `SELECT ID_PAGO, FORMA, MONTO, NUM_CHEQUE, NUM_CUENTA, FECHA_CHEQUE, NUM_TRANSACCION, COD_BCO
       FROM COBRO_PAGO_DET
      WHERE ID_PAGO IN (${pagos.map(() => '?').join(',')})
      ORDER BY ID_PAGO, LINEA`,
    pagos.map((p) => p.ID)
  );

  return pagos.map((p) => ({
    id: p.ID,
    fecha: p.FECHA,
    moneda: p.MONEDA,
    monto: Number(p.MONTO ?? 0),
    saldoAnterior: p.SALDO_ANTERIOR,
    saldoNuevo: p.SALDO_NUEVO,
    enviado: p.ENVIADO === 1,
    recibo: p.NUM_REC,
    formas: detalle
      .filter((d) => d.ID_PAGO === p.ID)
      .map((d) => ({
        forma: d.FORMA,
        monto: Number(d.MONTO ?? 0),
        numeroCheque: d.NUM_CHEQUE,
        cuenta: d.NUM_CUENTA,
        fecha: d.FECHA_CHEQUE,
        transaccion: d.NUM_TRANSACCION,
        banco: d.COD_BCO,
      })),
  }));
}

// Registra un pago (abono) a un documento como un RECIBO, en una sola transacción:
// - Número: RUTA_CONSECUT_RT.RECIBO de la ruta, formato RERT_<ruta>_<correlativo> (RERT_01_00001); es
//   el NUM_DEP del servidor tal cual (texto). Si todo
//   se guarda, el consecutivo avanza en 1 y se marca para enviarse (como el de pedidos).
// - COBRO_PAGO (encabezado, NUM_REC) + COBRO_PAGO_DET (una fila por forma de pago).
// - alCXC_ENC_DEP con la cuenta de banco del recibo; todas las formas de pago apuntan a él.
//   compania: COD_CIA del documento. cuenta: { compania, banco, cuenta } de alCXC_CTA_BCO.
//   formas: [{ forma: 'CHEQUE'|'EFECTIVO'|'TRANSFERENCIA'|'DEPOSITO', monto, numeroCheque?, cuenta?,
//              banco?, fecha?, transaccion? }] (solo las que tienen monto; en cheques cuenta y banco
//              son los del cliente; en transferencia/depósito, transaccion es el número o la boleta).
//   saldoServidor: saldo del documento en el servidor (sin abonos del equipo), moneda del cobro.
// Devuelve { id, recibo }.
export async function registrarPago({
  cliente,
  ruta,
  codTipo,
  documento,
  compania,
  moneda,
  cuenta,
  saldoAnterior,
  saldoServidor,
  formas,
  notas,
}) {
  if (!cuenta) throw new Error('Selecciona la cuenta de banco del recibo.');
  const monto = formas.reduce((s, f) => s + f.monto, 0);
  const mon = codigoMoneda(moneda);
  const db = await getDatabase();
  let id = null;
  let recibo = null;
  const ahora = toSqlLocal(new Date());
  await db.withTransactionAsync(async () => {
    const consec = await db.getFirstAsync('SELECT RECIBO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [ruta]);
    recibo = String(consec?.RECIBO ?? '').trim();
    if (!recibo) {
      throw new Error(`La ruta ${ruta} no tiene consecutivo de recibo. Descárgalo en Datos > Cargar datos.`);
    }
    if (!FORMATO_RECIBO.test(recibo)) {
      throw new Error(
        `El consecutivo de recibo de la ruta ${ruta} ("${recibo}") no es válido: debe ser como RERT_01_00001.`
      );
    }
    const repetido = await db.getFirstAsync('SELECT 1 AS x FROM alCXC_ENC_DEP WHERE CTA_BCO = ? AND NUM_DEP = ?', [
      cuenta.cuenta,
      recibo,
    ]);
    if (repetido) throw new Error(`Ya existe el recibo ${recibo} en la cuenta ${cuenta.cuenta}.`);

    await db.runAsync(
      // DOC_PRO 'N': pendiente hasta que control lo aplique (lo confirma GET /fr/sync/recibosPendientes).
      `INSERT INTO alCXC_ENC_DEP (COD_CIA, COD_BCO, CTA_BCO, NUM_DEP, FEC_DEP, IND_MON, NOTAS, ORIGEN, DOC_PRO)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'RECIBO', 'N')`,
      [cuenta.compania ?? '', cuenta.banco, cuenta.cuenta, recibo, ahora, mon, String(notas ?? '').trim().slice(0, MAX_NOTAS_RECIBO) || null]
    );

    const res = await db.runAsync(
      `INSERT INTO COBRO_PAGO
         (COD_CIA, COD_CLT, COD_ZON, COD_TIP_DC, NUM_DOC, MONEDA, FECHA, MONTO, SALDO_ANTERIOR, SALDO_NUEVO,
          SALDO_SERVIDOR, NUM_REC)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compania || null,
        cliente,
        ruta,
        codTipo,
        documento,
        mon,
        ahora,
        monto,
        saldoAnterior,
        saldoAnterior - monto,
        saldoServidor ?? null,
        recibo,
      ]
    );
    id = res.lastInsertRowId;
    let linea = 1;
    for (const f of formas) {
      await db.runAsync(
        `INSERT INTO COBRO_PAGO_DET
           (ID_PAGO, LINEA, FORMA, MONTO, NUM_CHEQUE, NUM_CUENTA, BANCO_CHEQUE, FECHA_CHEQUE, NUM_TRANSACCION,
            COD_CIA, COD_BCO, DEP_CIA, DEP_BCO, DEP_CTA, DEP_NUM)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          linea++,
          f.forma,
          f.monto,
          f.numeroCheque ?? null,
          f.forma === 'CHEQUE' ? f.cuenta ?? null : cuenta.cuenta,
          f.forma === 'CHEQUE' ? f.banco ?? null : null,
          f.fecha ?? null,
          f.transaccion ?? null,
          cuenta.compania ?? null,
          cuenta.banco,
          cuenta.compania ?? '',
          cuenta.banco,
          cuenta.cuenta,
          recibo,
        ]
      );
    }

    await db.runAsync('UPDATE RUTA_CONSECUT_RT SET RECIBO = ? WHERE RUTA = ?', [siguienteConsecutivo(recibo), ruta]);
    // El consecutivo nuevo también debe llegar al servidor (ver services/enviarDatos).
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  });
  return { id, recibo };
}

// Recibos (abonos) registrados en el equipo a los documentos de un cliente en una ruta, más reciente
// primero. Incluye los de documentos ya cancelados (que ya no salen en la lista de pendientes).
// [{ id, recibo, fecha, documento, moneda, monto, saldoNuevo, cancelado, enviado, formas: ['EFECTIVO', ...] }]
export async function getRecibosCliente({ cliente, ruta }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.ID, ${SQL_NUM_REC} AS NUM_REC, p.FECHA, p.NUM_DOC, p.MONEDA, p.MONTO, p.SALDO_NUEVO, p.ENVIADO,
            ${SQL_DOC_PRO} AS DOC_PRO,
            EXISTS (SELECT 1 FROM alCXC_PEN_COB c
                     WHERE c.COD_TIP_DC = p.COD_TIP_DC AND c.NUM_DOC = p.NUM_DOC
                       AND c.COD_CLT = p.COD_CLT AND c.COD_ZON = p.COD_ZON) AS EN_PENDIENTES,
            (SELECT GROUP_CONCAT(DISTINCT d.FORMA) FROM COBRO_PAGO_DET d WHERE d.ID_PAGO = p.ID) AS FORMAS
       FROM COBRO_PAGO p
      WHERE p.COD_CLT = ? AND p.COD_ZON = ?
      ORDER BY p.ID DESC`,
    [cliente, ruta]
  );
  return rows.map((r) => ({
    id: r.ID,
    recibo: r.NUM_REC,
    fecha: r.FECHA,
    documento: r.NUM_DOC,
    moneda: r.MONEDA,
    monto: Number(r.MONTO ?? 0),
    saldoNuevo: r.SALDO_NUEVO,
    // Canceló el documento: su saldo quedó en 0 o (recibo bajado del servidor) el documento ya no
    // está entre los pendientes.
    cancelado: r.SALDO_NUEVO != null ? r.SALDO_NUEVO <= 0.005 : !r.EN_PENDIENTES,
    enviado: r.ENVIADO === 1,
    aplicado: r.DOC_PRO === 'S',
    formas: String(r.FORMAS ?? '').split(',').filter(Boolean),
  }));
}

// Elimina del equipo un pago de prueba registrado antes de los recibos: sin número de recibo y sin
// enviar (nunca se envía y seguía descontándose del saldo). Los pagos con recibo no se pueden borrar
// (romperían el correlativo o ya están en el servidor). Borra también los depósitos del diseño
// anterior (ORIGEN distinto de 'RECIBO', sin enviar) que hayan quedado sin pagos.
export async function eliminarPagoSinRecibo(idPago) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync(`SELECT p.ID, p.ENVIADO, ${SQL_NUM_REC} AS NUM_REC FROM COBRO_PAGO p WHERE p.ID = ?`, [
      idPago,
    ]);
    if (!p) return;
    if (p.NUM_REC) throw new Error(`El pago tiene el recibo ${p.NUM_REC}: los recibos no se pueden eliminar.`);
    if (p.ENVIADO === 1) throw new Error('El pago ya se envió al servidor: no se puede eliminar.');
    await db.runAsync('DELETE FROM COBRO_PAGO_DET WHERE ID_PAGO = ?', [idPago]);
    await db.runAsync('DELETE FROM COBRO_PAGO WHERE ID = ?', [idPago]);
    await db.runAsync(
      `DELETE FROM alCXC_ENC_DEP
        WHERE ORIGEN <> 'RECIBO' AND ENVIADO = 0
          AND NOT EXISTS (SELECT 1 FROM COBRO_PAGO_DET d
                           WHERE d.DEP_CIA = alCXC_ENC_DEP.COD_CIA AND d.DEP_BCO = alCXC_ENC_DEP.COD_BCO
                             AND d.DEP_CTA = alCXC_ENC_DEP.CTA_BCO AND d.DEP_NUM = alCXC_ENC_DEP.NUM_DEP)`
    );
  });
}

// Datos para mostrar / imprimir el recibo de un pago.
export async function getRecibo(idPago) {
  const db = await getDatabase();
  const p = await db.getFirstAsync(
    `SELECT p.*, ${SQL_NUM_REC} AS NUM_REC_RECIBO,
            (SELECT e.NOTAS FROM COBRO_PAGO_DET d
               JOIN alCXC_ENC_DEP e
                 ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
              WHERE d.ID_PAGO = p.ID LIMIT 1) AS NOTAS_RECIBO,
            c.NOM_CLT, d1.DEP_BCO, d1.DEP_CTA, b.NOM_CTA,
            pc.AGENTE, pc.NOMBRE_AGENTE
       FROM COBRO_PAGO p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
       -- Cuenta del recibo: la guarda cada forma de pago (DEP_BCO + DEP_CTA); se toma la primera que la tenga.
       LEFT JOIN (SELECT ID_PAGO, DEP_BCO, DEP_CTA FROM COBRO_PAGO_DET
                   WHERE DEP_CTA IS NOT NULL AND ID_PAGO = ? ORDER BY LINEA LIMIT 1) d1
              ON d1.ID_PAGO = p.ID
       -- Nombre de la cuenta (no depende de la compañía: el número de cuenta + banco basta).
       LEFT JOIN (SELECT COD_BCO, CTA_BCO, MIN(NOM_CTA) AS NOM_CTA FROM alCXC_CTA_BCO GROUP BY COD_BCO, CTA_BCO) b
              ON b.COD_BCO = d1.DEP_BCO AND b.CTA_BCO = d1.DEP_CTA
       LEFT JOIN alCXC_PEN_COB pc
              ON pc.COD_TIP_DC = p.COD_TIP_DC AND pc.NUM_DOC = p.NUM_DOC AND pc.COD_CLT = p.COD_CLT AND pc.COD_ZON = p.COD_ZON
      WHERE p.ID = ?`,
    [idPago, idPago]
  );
  if (!p) return null;
  const formas = await db.getAllAsync(
    `SELECT FORMA, MONTO, NUM_CHEQUE, NUM_CUENTA, BANCO_CHEQUE, FECHA_CHEQUE, NUM_TRANSACCION
       FROM COBRO_PAGO_DET WHERE ID_PAGO = ? ORDER BY LINEA`,
    [idPago]
  );
  return {
    id: p.ID,
    recibo: p.NUM_REC_RECIBO,
    notas: p.NOTAS_RECIBO ?? '',
    fecha: p.FECHA,
    cliente: p.COD_CLT,
    nombreCliente: p.NOM_CLT ?? p.COD_CLT,
    ruta: p.COD_ZON,
    tecnico: p.AGENTE || p.COD_ZON,
    nombreTecnico: p.NOMBRE_AGENTE ?? '',
    documento: p.NUM_DOC,
    moneda: p.MONEDA,
    monto: Number(p.MONTO ?? 0),
    saldoAnterior: p.SALDO_ANTERIOR,
    saldoNuevo: p.SALDO_NUEVO,
    cancelado: p.SALDO_NUEVO != null && p.SALDO_NUEVO <= 0.005,
    banco: p.DEP_BCO ?? '',
    cuenta: p.DEP_CTA ?? '',
    nombreCuenta: p.NOM_CTA ?? '',
    enviado: p.ENVIADO === 1,
    formas: formas.map((f) => ({
      forma: f.FORMA,
      monto: Number(f.MONTO ?? 0),
      numeroCheque: f.NUM_CHEQUE,
      cuenta: f.NUM_CUENTA,
      banco: f.BANCO_CHEQUE,
      fecha: f.FECHA_CHEQUE,
      transaccion: f.NUM_TRANSACCION,
    })),
  };
}
