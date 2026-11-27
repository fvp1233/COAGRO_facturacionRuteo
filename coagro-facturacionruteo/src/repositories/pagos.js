import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';
import { siguienteConsecutivo } from './pedidos';
import { ACTIVIDAD, anotarActividad, quitarActividad } from './actividad';

// Pagos (abonos) a documentos pendientes de cobro, guardados en el equipo (COBRO_PAGO + COBRO_PAGO_DET).
// Un documento se puede pagar en varios abonos (100 → abona 20 → quedan 80 → ...) y cada abono
// puede combinar varias formas de pago (pago híbrido).

export const FORMAS_PAGO = {
  CHEQUE: 'Cheque',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
};

// Cuenta de banco de cada forma de pago. Un recibo puede repartirse entre varias cuentas: se guarda
// (y se envía) un depósito por cuenta con el MISMO número de recibo (NUM_DEP).
// - Transferencia y depósito del cliente: cada una lleva su cuenta (forma.cuentaDeposito).
// - Efectivo y cheques: van a la cuenta principal del recibo, donde el cobrador los deposita después.
// PENDIENTE confirmar con el negocio si efectivo y cheques también se reparten: si es así, se quitan
// de FORMAS_CUENTA_PRINCIPAL y la pantalla les pide su cuenta como a las transferencias.
export const FORMAS_CUENTA_PRINCIPAL = ['EFECTIVO', 'CHEQUE'];
export const usaCuentaPrincipal = (forma) => FORMAS_CUENTA_PRINCIPAL.includes(forma);
// cuenta: { compania, banco, cuenta, ... } de alCXC_CTA_BCO o null.
export const cuentaDeForma = (f, cuentaPrincipal) =>
  (usaCuentaPrincipal(f.forma) ? cuentaPrincipal : f.cuentaDeposito) ?? null;
export const claveCuenta = (c) => `${c?.compania ?? ''}|${c?.banco ?? ''}|${c?.cuenta ?? ''}`;

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

// DOC_PRO del recibo de un pago (alias p de COBRO_PAGO): 'S' = control aplicó TODAS sus partes (una
// por cuenta), 'N' = alguna sigue pendiente, null si el pago no tiene recibo.
const SQL_DOC_PRO = `(
    SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                WHEN SUM(CASE WHEN e.DOC_PRO = 'S' THEN 1 ELSE 0 END) = COUNT(*) THEN 'S'
                ELSE 'N' END
      FROM COBRO_PAGO_DET d
      JOIN alCXC_ENC_DEP e
        ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
     WHERE d.ID_PAGO = p.ID)`;

// Parte del pago (alias p) que control aún no aplica: suma de sus formas de pago cuya parte del
// recibo (cuenta) no está aplicada ('S'). Si control aplicó solo la parte de una cuenta, el saldo del
// servidor ya la trae descontada y aquí ya no se cuenta. Un pago sin formas cuenta completo.
const SQL_MONTO_PENDIENTE = `(
    CASE WHEN EXISTS (SELECT 1 FROM COBRO_PAGO_DET x WHERE x.ID_PAGO = p.ID)
         THEN (SELECT COALESCE(SUM(d.MONTO), 0) FROM COBRO_PAGO_DET d
                 LEFT JOIN alCXC_ENC_DEP e
                        ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA
                       AND e.NUM_DEP = d.DEP_NUM
                WHERE d.ID_PAGO = p.ID AND COALESCE(e.DOC_PRO, '') <> 'S')
         ELSE p.MONTO END)`;

// Abono para el cálculo de saldo (repositories/cobros): monto = lo que aún no aplica control;
// aplicado = ya no queda nada por descontar.
const abonoSaldo = (r) => {
  const pendiente = Number(r.PENDIENTE ?? 0);
  return { moneda: r.MONEDA, monto: pendiente, aplicado: pendiente <= 0.005 };
};

// Abonos de los documentos de un cliente en una ruta, agrupados por documento.
// Devuelve Map clave 'codTipo|documento' → [{ moneda: 'L'|'D', monto, aplicado }].
// monto = parte del abono que control aún no aplica en el ERP (la que se descuenta del saldo);
// aplicado = control ya aplicó todo el abono: ya no se descuenta. Un recibo repartido en varias
// cuentas es UN pago por documento: se descuenta una sola vez.
export async function getAbonosCliente({ cliente, ruta }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_TIP_DC, p.NUM_DOC, p.MONEDA, ${SQL_MONTO_PENDIENTE} AS PENDIENTE
       FROM COBRO_PAGO p
      WHERE p.COD_CLT = ? AND p.COD_ZON = ?
      ORDER BY p.ID`,
    [cliente, ruta]
  );
  const abonos = new Map();
  for (const r of rows) {
    const clave = claveDoc(r.COD_TIP_DC, r.NUM_DOC);
    const lista = abonos.get(clave) ?? [];
    lista.push(abonoSaldo(r));
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
// - alCXC_ENC_DEP: UNO POR CUENTA de banco del recibo, todos con el mismo NUM_DEP (así los une el
//   servidor: NUM_DEP + CTA_BCO). Cada forma de pago apunta al de su cuenta (cuentaDeForma). Con una
//   sola cuenta queda un encabezado, como siempre.
//   compania: COD_CIA del documento. cuentaPrincipal: { compania, banco, cuenta } de alCXC_CTA_BCO (la
//   del efectivo y los cheques; puede ser null si el pago no lleva ninguno de los dos).
//   formas: [{ forma: 'CHEQUE'|'EFECTIVO'|'TRANSFERENCIA'|'DEPOSITO', monto, numeroCheque?, cuenta?,
//              banco?, fecha?, transaccion?, cuentaDeposito? }] (solo las que tienen monto; en cheques
//              cuenta y banco son los del cliente; en transferencia/depósito, transaccion es el número
//              o la boleta y cuentaDeposito la cuenta de la empresa a la que entró).
//   saldoServidor: saldo del documento en el servidor (sin abonos del equipo), moneda del cobro.
// Devuelve { id, recibo }.
export async function registrarPago({
  cliente,
  ruta,
  codTipo,
  documento,
  compania,
  moneda,
  cuentaPrincipal,
  saldoAnterior,
  saldoServidor,
  formas,
  notas,
}) {
  // Cuenta de cada forma y partes del recibo (una por cuenta, en el orden en que aparecen).
  const conCuenta = formas.map((f) => ({ ...f, cuentaRecibo: cuentaDeForma(f, cuentaPrincipal) }));
  const sinCuenta = conCuenta.find((f) => !f.cuentaRecibo?.cuenta || !f.cuentaRecibo?.banco);
  if (sinCuenta) {
    throw new Error(
      usaCuentaPrincipal(sinCuenta.forma)
        ? 'Selecciona la cuenta principal del recibo (donde se depositarán el efectivo y los cheques).'
        : `Selecciona la cuenta de banco de cada ${FORMAS_PAGO[sinCuenta.forma]?.toLowerCase() ?? 'forma de pago'}.`
    );
  }
  const partes = new Map();
  for (const f of conCuenta) {
    if (!partes.has(claveCuenta(f.cuentaRecibo))) partes.set(claveCuenta(f.cuentaRecibo), f.cuentaRecibo);
  }

  const monto = formas.reduce((s, f) => s + f.monto, 0);
  const mon = codigoMoneda(moneda);
  const notasRecibo = String(notas ?? '').trim().slice(0, MAX_NOTAS_RECIBO) || null;
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
    // El número es del recibo completo (todas sus cuentas): no puede existir en ninguna cuenta.
    const repetido = await db.getFirstAsync(
      "SELECT CTA_BCO FROM alCXC_ENC_DEP WHERE NUM_DEP = ? AND ORIGEN = 'RECIBO' LIMIT 1",
      [recibo]
    );
    if (repetido) throw new Error(`Ya existe el recibo ${recibo} (cuenta ${repetido.CTA_BCO}).`);

    // Una parte por cuenta, con la misma fecha, moneda y notas. DOC_PRO 'N': pendiente hasta que
    // control la aplique (lo confirma GET /fr/sync/recibosPendientes, por parte).
    for (const c of partes.values()) {
      await db.runAsync(
        `INSERT INTO alCXC_ENC_DEP (COD_CIA, COD_BCO, CTA_BCO, NUM_DEP, FEC_DEP, IND_MON, NOTAS, ORIGEN, DOC_PRO)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'RECIBO', 'N')`,
        [c.compania ?? '', c.banco, c.cuenta, recibo, ahora, mon, notasRecibo]
      );
    }

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
    for (const f of conCuenta) {
      const c = f.cuentaRecibo;
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
          f.forma === 'CHEQUE' ? f.cuenta ?? null : c.cuenta,
          f.forma === 'CHEQUE' ? f.banco ?? null : null,
          f.fecha ?? null,
          f.transaccion ?? null,
          c.compania ?? null,
          c.banco,
          c.compania ?? '',
          c.banco,
          c.cuenta,
          recibo,
        ]
      );
    }

    // Bitácora del reporte Mi día: monto por forma de pago.
    const porForma = {};
    for (const f of formas) porForma[f.forma] = (porForma[f.forma] ?? 0) + f.monto;
    await anotarActividad(db, {
      tipo: ACTIVIDAD.cobro,
      clave: id,
      cliente,
      ruta,
      documento,
      monto,
      detalle: { recibo, moneda: mon, cancelado: saldoAnterior - monto <= 0.005, formas: porForma },
    });

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
    await quitarActividad(db, ACTIVIDAD.cobro, idPago);
    await db.runAsync(
      `DELETE FROM alCXC_ENC_DEP
        WHERE ORIGEN <> 'RECIBO' AND ENVIADO = 0
          AND NOT EXISTS (SELECT 1 FROM COBRO_PAGO_DET d
                           WHERE d.DEP_CIA = alCXC_ENC_DEP.COD_CIA AND d.DEP_BCO = alCXC_ENC_DEP.COD_BCO
                             AND d.DEP_CTA = alCXC_ENC_DEP.CTA_BCO AND d.DEP_NUM = alCXC_ENC_DEP.NUM_DEP)`
    );
  });
}

// Formas de pago (COBRO_PAGO_DET) de varios pagos con la cuenta de la empresa a la que entró cada
// una (DEP_BCO + DEP_CTA) y el nombre de esa cuenta. Map ID_PAGO -> filas, en orden de LINEA.
async function leerFormasConCuenta(db, ids) {
  if (!ids.length) return new Map();
  const filas = await db.getAllAsync(
    `SELECT d.ID_PAGO, d.FORMA, d.MONTO, d.NUM_CHEQUE, d.NUM_CUENTA, d.BANCO_CHEQUE, d.FECHA_CHEQUE,
            d.NUM_TRANSACCION, d.DEP_BCO, d.DEP_CTA, b.NOM_CTA
       FROM COBRO_PAGO_DET d
       -- Nombre de la cuenta (no depende de la compañía: el número de cuenta + banco basta).
       LEFT JOIN (SELECT COD_BCO, CTA_BCO, MIN(NOM_CTA) AS NOM_CTA FROM alCXC_CTA_BCO GROUP BY COD_BCO, CTA_BCO) b
              ON b.COD_BCO = d.DEP_BCO AND b.CTA_BCO = d.DEP_CTA
      WHERE d.ID_PAGO IN (${ids.map(() => '?').join(',')})
      ORDER BY d.ID_PAGO, d.LINEA`,
    ids
  );
  const porPago = new Map();
  for (const f of filas) {
    if (!porPago.has(f.ID_PAGO)) porPago.set(f.ID_PAGO, []);
    porPago.get(f.ID_PAGO).push(f);
  }
  return porPago;
}

// Cuentas y formas de pago de un recibo a partir de sus filas (leerFormasConCuenta). Mismo formato
// que arma el backend para el PDF (controllers/fr/reciboPdf.js):
//   cuentas: [{ banco, cuenta, nombreCuenta, monto }], una por cuenta, en el orden en que aparecen.
//   formas: [{ forma, monto, numeroCheque, cuenta, banco, fecha, transaccion, cuentaDeposito? }];
//           con VARIAS cuentas, transferencias y depósitos llevan cuentaDeposito (nombre de su cuenta).
//   banco / cuenta / nombreCuenta: los de la primera cuenta (un recibo de una cuenta queda como antes).
function cuentasDelRecibo(filas) {
  const cuentas = new Map();
  for (const f of filas ?? []) {
    if (!f.DEP_CTA) continue;
    const clave = `${f.DEP_BCO}|${f.DEP_CTA}`;
    const c = cuentas.get(clave) ?? { banco: f.DEP_BCO ?? '', cuenta: f.DEP_CTA, nombreCuenta: f.NOM_CTA ?? '', monto: 0 };
    c.monto = Math.round((c.monto + Number(f.MONTO ?? 0)) * 100) / 100;
    cuentas.set(clave, c);
  }
  const lista = [...cuentas.values()];
  const varias = lista.length > 1;
  const primera = lista[0];
  return {
    banco: primera?.banco ?? '',
    cuenta: primera?.cuenta ?? '',
    nombreCuenta: primera?.nombreCuenta ?? '',
    cuentas: lista,
    formas: (filas ?? []).map((f) => ({
      forma: f.FORMA,
      monto: Number(f.MONTO ?? 0),
      numeroCheque: f.NUM_CHEQUE,
      cuenta: f.NUM_CUENTA,
      banco: f.BANCO_CHEQUE,
      fecha: f.FECHA_CHEQUE,
      transaccion: f.NUM_TRANSACCION,
      ...(varias && (f.FORMA === 'TRANSFERENCIA' || f.FORMA === 'DEPOSITO') && f.DEP_CTA
        ? { cuentaDeposito: f.NOM_CTA || f.DEP_CTA }
        : {}),
    })),
  };
}

// Datos para mostrar / imprimir el recibo de un pago. Un recibo repartido en varias cuentas trae
// todas en `cuentas` (ver cuentasDelRecibo); monto = total de todas.
export async function getRecibo(idPago) {
  const db = await getDatabase();
  const p = await db.getFirstAsync(
    `SELECT p.*, ${SQL_NUM_REC} AS NUM_REC_RECIBO, ${SQL_DOC_PRO} AS DOC_PRO_RECIBO,
            (SELECT e.NOTAS FROM COBRO_PAGO_DET d
               JOIN alCXC_ENC_DEP e
                 ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
              WHERE d.ID_PAGO = p.ID LIMIT 1) AS NOTAS_RECIBO,
            c.NOM_CLT, pc.AGENTE, pc.NOMBRE_AGENTE
       FROM COBRO_PAGO p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
       LEFT JOIN alCXC_PEN_COB pc
              ON pc.COD_TIP_DC = p.COD_TIP_DC AND pc.NUM_DOC = p.NUM_DOC AND pc.COD_CLT = p.COD_CLT AND pc.COD_ZON = p.COD_ZON
      WHERE p.ID = ?`,
    [idPago]
  );
  if (!p) return null;
  const formas = await leerFormasConCuenta(db, [p.ID]);
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
    enviado: p.ENVIADO === 1,
    // Control ya aplicó todas sus partes en el ERP (DOC_PRO 'S'): el servidor ya no puede
    // reconstruir sus saldos.
    aplicado: p.DOC_PRO_RECIBO === 'S',
    ...cuentasDelRecibo(formas.get(p.ID)),
  };
}

// Cierre de cobro del día (Reportes > Cierre de Cobro): recibos registrados hoy en el equipo con sus
// formas de pago (detalle de cheques y transferencias / depósitos) y sus cuentas de banco (un recibo
// puede repartirse en varias: `cuentas`, cada una con lo que entró en ella). Más reciente primero.
// [{ id, recibo, fecha, cliente, nombreCliente, ruta, documento, monto, cancelado, enviado, aplicado,
//    banco, cuenta, nombreCuenta, cuentas: [{ banco, cuenta, nombreCuenta, monto }],
//    formas: [{ forma, monto, numeroCheque, cuenta, banco, fecha, transaccion, cuentaDeposito? }] }]
export async function getCierreCobroDia() {
  const db = await getDatabase();
  const pagos = await db.getAllAsync(
    `SELECT p.ID, ${SQL_NUM_REC} AS NUM_REC, ${SQL_DOC_PRO} AS DOC_PRO, p.FECHA, p.COD_CLT, p.COD_ZON, p.NUM_DOC,
            p.MONTO, p.SALDO_NUEVO, p.ENVIADO, c.NOM_CLT
       FROM COBRO_PAGO p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
      WHERE date(p.FECHA) = date('now', 'localtime')
      ORDER BY p.FECHA DESC, p.ID DESC`
  );
  if (!pagos.length) return [];
  const formas = await leerFormasConCuenta(db, pagos.map((p) => p.ID));

  return pagos.map((p) => ({
    id: p.ID,
    recibo: p.NUM_REC,
    fecha: p.FECHA,
    cliente: p.COD_CLT,
    nombreCliente: p.NOM_CLT ?? p.COD_CLT,
    ruta: p.COD_ZON,
    documento: p.NUM_DOC,
    monto: Number(p.MONTO ?? 0),
    cancelado: p.SALDO_NUEVO != null && p.SALDO_NUEVO <= 0.005,
    enviado: p.ENVIADO === 1,
    aplicado: p.DOC_PRO === 'S',
    ...cuentasDelRecibo(formas.get(p.ID)),
  }));
}

// Abonos de todos los documentos del equipo, agrupados por documento (para reportes de toda la ruta).
// Devuelve Map clave 'ruta|cliente|codTipo|documento' → [{ moneda, monto, aplicado, hoy }].
// hoy = el abono se registró hoy.
export async function getAbonosEquipo() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_ZON, p.COD_CLT, p.COD_TIP_DC, p.NUM_DOC, p.MONEDA, ${SQL_MONTO_PENDIENTE} AS PENDIENTE,
            date(p.FECHA) = date('now', 'localtime') AS HOY
       FROM COBRO_PAGO p
      ORDER BY p.ID`
  );
  const abonos = new Map();
  for (const r of rows) {
    const clave = `${r.COD_ZON}|${r.COD_CLT}|${r.COD_TIP_DC}|${r.NUM_DOC}`;
    const lista = abonos.get(clave) ?? [];
    lista.push({ ...abonoSaldo(r), hoy: r.HOY === 1 });
    abonos.set(clave, lista);
  }
  return abonos;
}
