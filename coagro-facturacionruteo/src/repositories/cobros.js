import { getDatabase } from '../db/database';

// Documentos pendientes de cobro de un cliente en una ruta (alCXC_PEN_COB), por fecha de vencimiento.
// El monto a pagar arranca igual al saldo del documento.
// tipo = CLASE_DOCUMENTO (texto que se muestra); codTipo = COD_TIP_DC (código, parte de la llave).
export async function getDocumentosCobro({ cliente, ruta }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT COD_TIP_DC, CLASE_DOCUMENTO, NUM_DOC, IND_MON, SALDO_LOCAL, SALDO_DOLAR, MONTO_LOCAL, MONTO_DOLAR,
            TIP_CMB_DOL, FEC_DOC_FT, FEC_VEN, AGENTE, NOMBRE_AGENTE
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
    agente: r.AGENTE ?? '',
    nombreAgente: r.NOMBRE_AGENTE ?? '',
  }));
}

// Vencimientos para el Calendario: todos los documentos con saldo pendiente del equipo (todas las
// rutas), con el nombre del cliente. vence = 'YYYY-MM-DD' (FEC_VEN sin hora), ordenados por cliente.
// El nombre se busca solo por código (sin espacios de relleno): el documento puede ser de una ruta
// distinta a la del cliente en CLIENTE.
// Con soloAgente se leen solo los del agente (vendedor) del usuario (alCXC_PEN_COB_AGENTE).
export async function getVencimientos({ soloAgente = false } = {}) {
  const tabla = soloAgente ? 'alCXC_PEN_COB_AGENTE' : 'alCXC_PEN_COB';
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_TIP_DC, p.NUM_DOC, p.COD_CLT, p.COD_ZON, p.CLASE_DOCUMENTO, p.SALDO_LOCAL, p.SALDO_DOLAR,
            p.FEC_VEN, p.AGENTE, p.NOMBRE_AGENTE, c.NOM_CLT
       FROM ${tabla} p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
      WHERE COALESCE(p.SALDO_LOCAL, 0) > 0 OR COALESCE(p.SALDO_DOLAR, 0) > 0
      ORDER BY p.FEC_VEN, c.NOM_CLT, p.NUM_DOC`
  );

  return rows.map((r) => ({
    clave: `${r.COD_TIP_DC}|${r.COD_ZON}|${r.NUM_DOC}|${r.COD_CLT}`,
    tipo: r.CLASE_DOCUMENTO ?? '',
    documento: r.NUM_DOC,
    cliente: r.COD_CLT,
    nombre: r.NOM_CLT ?? r.COD_CLT,
    ruta: r.COD_ZON,
    agente: r.AGENTE ?? '',
    nombreAgente: r.NOMBRE_AGENTE ?? '',
    saldoLocal: r.SALDO_LOCAL,
    saldoDolar: r.SALDO_DOLAR,
    vence: String(r.FEC_VEN ?? '').slice(0, 10),
  }));
}
