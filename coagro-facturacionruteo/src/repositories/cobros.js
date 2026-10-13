import { getDatabase } from '../db/database';

// Documentos pendientes de cobro de un cliente en una ruta (alCXC_PEN_COB), por fecha de vencimiento.
// El monto a pagar arranca igual al saldo del documento.
// tipo = CLASE_DOCUMENTO (texto que se muestra); codTipo = COD_TIP_DC (código, parte de la llave).
export async function getDocumentosCobro({ cliente, ruta }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT COD_TIP_DC, CLASE_DOCUMENTO, NUM_DOC, IND_MON, SALDO_LOCAL, SALDO_DOLAR, MONTO_LOCAL, MONTO_DOLAR,
            TIP_CMB_DOL, FEC_DOC_FT, FEC_VEN
       FROM alCXC_PEN_COB
      WHERE COD_CLT = ? AND COD_ZON = ?
      ORDER BY FEC_VEN, NUM_DOC`,
    [cliente, ruta]
  );

  return rows.map((r) => ({
    tipo: r.CLASE_DOCUMENTO ?? '',
    codTipo: r.COD_TIP_DC,
    documento: r.NUM_DOC,
    moneda: r.IND_MON ?? '',
    montoAPagarLoc: r.SALDO_LOCAL,
    montoAPagarDolar: r.SALDO_DOLAR,
    saldoDocLocal: r.SALDO_LOCAL,
    saldoDocDolar: r.SALDO_DOLAR,
    tipoCambio: r.TIP_CMB_DOL,
    fecha: r.FEC_DOC_FT,
    vence: r.FEC_VEN,
    montoDocLocal: r.MONTO_LOCAL,
    montoDocDolar: r.MONTO_DOLAR,
  }));
}
