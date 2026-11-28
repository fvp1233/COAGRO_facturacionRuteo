import { getDatabase } from '../db/database';
import { getAbonosCliente, getAbonosEquipo } from './pagos';
import { leerAgentesSync } from './metas';
import { getRutasHandheld } from './rutaActiva';

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

// Vencimientos para el Calendario: documentos con saldo de las rutas de la handheld (alCXC_PEN_COB
// con COD_ZON en sus rutas; los de rutas ajenas no se muestran), con el nombre del cliente.
// vence = 'YYYY-MM-DD'. El nombre se busca solo por código (sin espacios de relleno).
// - Un mismo documento puede llegar en más de una ruta (la llave incluye COD_ZON): sale una sola vez,
//   con todas sus rutas, para no duplicarlo ni sumar su saldo dos veces.
// - vendedor = vendedor de la factura (VENDEDOR; para mostrar, si no viene, el dueño de la ruta).
//   esMio = VENDEDOR es el vendedor de la handheld (filtro "Mis documentos"). Solo cuenta VENDEDOR:
//   en una ruta con dos vendedores, las facturas del otro nunca salen como mías.
// - saldoLocal / saldoDolar ya traen descontados los abonos que control aún no aplica: los de este
//   equipo (COBRO_PAGO) y los de otros vendedores (COBRO_OTRO_VENDEDOR). saldoServidorLocal = saldo
//   del ERP. cobrosOtros = abonos de otros vendedores [{ recibo, fecha, vendedor, nombreVendedor,
//   moneda, monto }]; abonadoPorMi = tiene abonos de este equipo sin aplicar; cobrado = ya no queda saldo.
export async function getVencimientos() {
  const abonosEquipo = await getAbonosEquipo();
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_TIP_DC, p.NUM_DOC, p.COD_CLT, p.COD_ZON, p.CLASE_DOCUMENTO, p.IND_MON, p.SALDO_LOCAL,
            p.SALDO_DOLAR, p.TIP_CMB_DOL, p.FEC_VEN, p.AGENTE, p.NOMBRE_AGENTE, p.VENDEDOR,
            p.NOMBRE_VENDEDOR, c.NOM_CLT
       FROM alCXC_PEN_COB p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
      WHERE COALESCE(p.SALDO_LOCAL, 0) > 0 OR COALESCE(p.SALDO_DOLAR, 0) > 0
      ORDER BY p.FEC_VEN, c.NOM_CLT, p.NUM_DOC`
  );
  const filasOtros = await db.getAllAsync(
    `SELECT COD_TIP_DC, NUM_DOC, COD_CLT, NUM_DEP, FEC_DEP, IND_MON, SUM(MONTO) AS MONTO,
            MIN(VENDEDOR) AS VENDEDOR, MIN(NOMBRE_VENDEDOR) AS NOMBRE_VENDEDOR
       FROM COBRO_OTRO_VENDEDOR
      GROUP BY COD_TIP_DC, NUM_DOC, COD_CLT, NUM_DEP, IND_MON
      ORDER BY FEC_DEP`
  );
  const misCodigos = await codigosVendedorHandheld(db);
  const t = (v) => String(v ?? '').trim();
  // Rutas de la handheld; si aún no hay ninguna guardada no se filtra (el servidor ya manda solo las suyas).
  const misRutas = new Set((await getRutasHandheld()).map((r) => t(r.codigo)).filter(Boolean));

  const claveDe = (codTipo, documento, cliente) => `${t(codTipo)}|${t(documento)}|${t(cliente)}`;

  // Abonos de este equipo, por documento (sin la ruta: el documento se muestra una sola vez).
  const propios = new Map();
  for (const [k, lista] of abonosEquipo) {
    const [, cliente, codTipo, documento] = k.split('|');
    const clave = claveDe(codTipo, documento, cliente);
    propios.set(clave, [...(propios.get(clave) ?? []), ...lista]);
  }
  const otros = new Map();
  for (const a of filasOtros) {
    const clave = claveDe(a.COD_TIP_DC, a.NUM_DOC, a.COD_CLT);
    const lista = otros.get(clave) ?? [];
    lista.push({
      recibo: a.NUM_DEP,
      fecha: a.FEC_DEP,
      vendedor: t(a.VENDEDOR),
      nombreVendedor: t(a.NOMBRE_VENDEDOR),
      moneda: t(a.IND_MON).toUpperCase().startsWith('D') ? 'D' : 'L',
      monto: Number(a.MONTO ?? 0),
    });
    otros.set(clave, lista);
  }

  const porDocumento = new Map();
  for (const r of rows) {
    const clave = claveDe(r.COD_TIP_DC, r.NUM_DOC, r.COD_CLT);
    const ruta = t(r.COD_ZON);
    if (misRutas.size && !misRutas.has(ruta)) continue;
    const previo = porDocumento.get(clave);
    if (previo) {
      if (ruta && !previo.rutas.includes(ruta)) previo.rutas.push(ruta);
      continue;
    }
    const vendedor = t(r.VENDEDOR) || t(r.AGENTE);
    const nombreVendedor = t(r.VENDEDOR) ? t(r.NOMBRE_VENDEDOR) : t(r.NOMBRE_AGENTE);
    const listaPropios = (propios.get(clave) ?? []).filter((a) => !a.aplicado);
    const cobrosOtros = otros.get(clave) ?? [];
    const d = conAbonos(
      { moneda: r.IND_MON ?? '', saldoDocLocal: r.SALDO_LOCAL, saldoDocDolar: r.SALDO_DOLAR, tipoCambio: r.TIP_CMB_DOL },
      [...listaPropios, ...cobrosOtros.map((a) => ({ moneda: a.moneda, monto: a.monto, aplicado: false }))]
    );
    const enDolar = String(r.IND_MON ?? '').toUpperCase().startsWith('D');
    porDocumento.set(clave, {
      clave,
      tipo: r.CLASE_DOCUMENTO ?? '',
      documento: r.NUM_DOC,
      cliente: r.COD_CLT,
      nombre: r.NOM_CLT ?? r.COD_CLT,
      rutas: ruta ? [ruta] : [],
      vendedor,
      nombreVendedor,
      // formatVendedor (utils/formato) lee agente / nombreAgente.
      agente: vendedor,
      nombreAgente: nombreVendedor,
      esMio: Boolean(t(r.VENDEDOR)) && misCodigos.has(t(r.VENDEDOR)),
      saldoServidorLocal: d.saldoServidorLocal,
      saldoLocal: d.saldoDocLocal,
      saldoDolar: d.saldoDocDolar,
      cobrosOtros,
      abonadoPorMi: listaPropios.length > 0,
      cobrado: (enDolar ? d.saldoDocDolar : d.saldoDocLocal) <= EPS,
      vence: String(r.FEC_VEN ?? '').slice(0, 10),
    });
  }
  return [...porDocumento.values()].map((d) => ({ ...d, ruta: d.rutas.join(' / ') }));
}

// Códigos del vendedor de la handheld: los que manda /fr/sync/cobros (result.vendedores) y, si no
// vienen, los de la última sincronización de metas (alias de ruteo y vendedor del ERP).
async function codigosVendedorHandheld(db) {
  const fila = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_cobros_vendedores'");
  let deCobros = [];
  try {
    const v = JSON.parse(fila?.value ?? '[]');
    if (Array.isArray(v)) deCobros = v.map((c) => String(c ?? '').trim()).filter(Boolean);
  } catch {
    deCobros = [];
  }
  const { agentes, vendedores } = await leerAgentesSync(db);
  return new Set([...deCobros, ...agentes, ...vendedores]);
}

// Lo que faltó cobrar hoy (Reportes > Cierre de Cobro): documentos con saldo pendiente (descontados
// los abonos del equipo que control aún no aplica) que vencen hoy o ya vencieron y que no recibieron
// ningún abono hoy. Los más atrasados primero.
// [{ clave, tipo, documento, cliente, nombre, ruta, moneda, saldo, vence, dias }] — dias: días de
// atraso (0 = vence hoy). saldo en la moneda del documento.
export async function getNoCobradosHoy() {
  const abonos = await getAbonosEquipo();
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT p.COD_TIP_DC, p.CLASE_DOCUMENTO, p.NUM_DOC, p.COD_CLT, p.COD_ZON, p.IND_MON, p.SALDO_LOCAL,
            p.SALDO_DOLAR, p.TIP_CMB_DOL, p.FEC_VEN, c.NOM_CLT,
            CAST(julianday(date('now', 'localtime')) - julianday(date(p.FEC_VEN)) AS INTEGER) AS DIAS
       FROM alCXC_PEN_COB p
       LEFT JOIN (SELECT TRIM(COD_CLT) AS COD_CLT, MIN(NOM_CLT) AS NOM_CLT FROM CLIENTE GROUP BY TRIM(COD_CLT)) c
              ON c.COD_CLT = TRIM(p.COD_CLT)
      WHERE p.FEC_VEN IS NOT NULL AND date(p.FEC_VEN) <= date('now', 'localtime')
      ORDER BY date(p.FEC_VEN), c.NOM_CLT, p.NUM_DOC`
  );

  const resultado = [];
  for (const r of rows) {
    const lista = abonos.get(`${r.COD_ZON}|${r.COD_CLT}|${r.COD_TIP_DC}|${r.NUM_DOC}`);
    if (lista?.some((a) => a.hoy)) continue; // se cobró (o abonó) hoy
    const d = conAbonos(
      { moneda: r.IND_MON ?? '', saldoDocLocal: r.SALDO_LOCAL, saldoDocDolar: r.SALDO_DOLAR, tipoCambio: r.TIP_CMB_DOL },
      lista
    );
    const saldo = String(d.moneda).toUpperCase().startsWith('D') ? d.saldoDocDolar : d.saldoDocLocal;
    if (saldo <= EPS) continue;
    resultado.push({
      clave: `${r.COD_TIP_DC}|${r.COD_ZON}|${r.NUM_DOC}|${r.COD_CLT}`,
      tipo: r.CLASE_DOCUMENTO ?? '',
      documento: r.NUM_DOC,
      cliente: r.COD_CLT,
      nombre: r.NOM_CLT ?? r.COD_CLT,
      ruta: r.COD_ZON,
      moneda: d.moneda,
      saldo,
      vence: String(r.FEC_VEN ?? '').slice(0, 10),
      dias: Math.max(0, Number(r.DIAS ?? 0)),
    });
  }
  return resultado;
}
