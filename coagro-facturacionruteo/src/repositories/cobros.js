import { getDatabase } from '../db/database';
import { getAbonosCliente } from './pagos';

const EPS = 0.005;

// Saldo con los abonos del equipo que control aún no aplica descontados (DOC_PRO del recibo distinto
// de 'S': los pagos los aplica una persona en el ERP; mientras tanto el servidor manda el saldo viejo). Un abono en dólares baja
// también el saldo local (y al revés) con el tipo de cambio del documento. Nunca queda negativo.
// saldoServidorLocal/Dolar = saldo tal como llegó del servidor (se guarda con cada abono).
const conAbonos = (doc, lista) => {
  const base = {
    ...doc,
    saldoServidorLocal: Number(doc.saldoDocLocal ?? 0),
    saldoServidorDolar: Number(doc.saldoDocDolar ?? 0),
    abonadoLocal: 0,
    abonadoDolar: 0,
  };
  const pendientes = (lista ?? []).filter((a) => !a.aplicado);
  if (!pendientes.length) return base;
  const tc = Number(doc.tipoCambio) > 0 ? Number(doc.tipoCambio) : 1;
  const local = pendientes.filter((a) => a.moneda !== 'D').reduce((s, a) => s + a.monto, 0);
  const dolar = pendientes.filter((a) => a.moneda === 'D').reduce((s, a) => s + a.monto, 0);
  const abonadoLocal = local + dolar * tc;
  const abonadoDolar = dolar + local / tc;
  const saldoLocal = Math.max(0, base.saldoServidorLocal - abonadoLocal);
  const saldoDolar = Math.max(0, base.saldoServidorDolar - abonadoDolar);
  return {
    ...base,
    abonadoLocal,
    abonadoDolar,
    saldoDocLocal: saldoLocal,
    saldoDocDolar: saldoDolar,
    montoAPagarLoc: saldoLocal,
    montoAPagarDolar: saldoDolar,
  };
};

// Ya pagado por completo con abonos del equipo (en la moneda del documento).
const pagadoCompleto = (d) =>
  (String(d.moneda).toUpperCase().startsWith('D') ? d.saldoDocDolar : d.saldoDocLocal) <= EPS &&
  (d.abonadoLocal > 0 || d.abonadoDolar > 0);

// Documentos pendientes de cobro de un cliente en una ruta (alCXC_PEN_COB), por fecha de vencimiento.
// El saldo (y el monto a pagar) ya trae descontados los abonos registrados en el equipo que control
// aún no aplica en el ERP (COBRO_PAGO); los documentos que quedaron pagados por completo no se devuelven.
// tipo = CLASE_DOCUMENTO (texto que se muestra); codTipo = COD_TIP_DC (código, parte de la llave).
export async function getDocumentosCobro({ cliente, ruta }) {
  const abonos = await getAbonosCliente({ cliente, ruta });
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT COD_CIA, COD_TIP_DC, CLASE_DOCUMENTO, NUM_DOC, IND_MON, SALDO_LOCAL, SALDO_DOLAR, MONTO_LOCAL, MONTO_DOLAR,
            TIP_CMB_DOL, FEC_DOC_FT, FEC_VEN, AGENTE, NOMBRE_AGENTE
       FROM alCXC_PEN_COB
      WHERE COD_CLT = ? AND COD_ZON = ?
      ORDER BY FEC_VEN, NUM_DOC`,
    [cliente, ruta]
  );

  return rows
    .map((r) => ({
      compania: r.COD_CIA ?? '',
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
    }))
    .map((d) => conAbonos(d, abonos.get(`${d.codTipo}|${d.documento}`)))
    .filter((d) => !pagadoCompleto(d));
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
