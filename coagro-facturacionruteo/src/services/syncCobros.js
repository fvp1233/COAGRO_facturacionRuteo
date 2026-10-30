import { getJson, ApiError } from './api';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Descarga los documentos pendientes de cobro (alCXC_PEN_COB) y los guarda en SQLite en UNA
// transacción: o se guarda todo o no se toca nada. Devuelve un resumen con los conteos.
export function syncCobros() {
  return descargarCobros(PATHS.syncCobros, 'alCXC_PEN_COB', 'sync_cobros_at');
}

// Igual que syncCobros, pero solo los documentos que le toca cobrar al agente (vendedor) del
// token; se guardan aparte en alCXC_PEN_COB_AGENTE (Calendario > Mis documentos vencidos).
export function syncCobrosAgente() {
  return descargarCobros(PATHS.syncCobrosAgente, 'alCXC_PEN_COB_AGENTE', 'sync_cobros_agente_at');
}

// tabla y metaKey son constantes de este archivo (no vienen del usuario).
async function descargarCobros(path, tabla, metaKey) {
  const json = await getJson(path);
  const data = json?.result;
  if (!data || !Array.isArray(data.documentos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (documentos).');
  }
  // Se descartan filas sin sus campos clave (no se guardan códigos vacíos) y se informa cuántas.
  const documentos = data.documentos.filter(
    (fila) =>
      fila && typeof fila === 'object' &&
      ['COD_TIP_DC', 'COD_ZON', 'NUM_DOC', 'COD_CLT'].every((k) => textOr(fila[k]) !== '')
  );
  const omitidos = data.documentos.length - documentos.length;

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Los pendientes se reemplazan completos con lo que manda el servidor.
    await db.runAsync(`DELETE FROM ${tabla}`);

    for (const d of documentos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ${tabla}
           (COD_CIA, COD_ZON, COD_TIP_DC, NUM_DOC, COD_CLT, SALDO_DOLAR, SALDO_LOCAL,
            MONTO_DOLAR, MONTO_LOCAL, FEC_DOC_FT, FEC_PRO, FEC_VEN, IND_MON, IND_ANL, TIP_CMB_DOL,
            CONDICION_PAGO, SUBTOTAL, TIP_CMB_LOC, CLASE_DOCUMENTO, INCOTERMS, FORMAS_PAGO,
            NATURALEZA_OPERACION, CUFE, CODIGOQR, INDICADOR_FACTURACION, AGENTE, NOMBRE_AGENTE)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          text(d.COD_CIA),
          textOr(d.COD_ZON),
          textOr(d.COD_TIP_DC),
          textOr(d.NUM_DOC),
          textOr(d.COD_CLT),
          num(d.SALDO_DOLAR) ?? 0,
          num(d.SALDO_LOCAL) ?? 0,
          num(d.MONTO_DOLAR) ?? 0,
          num(d.MONTO_LOCAL) ?? 0,
          textOr(d.FEC_DOC_FT),
          textOr(d.FEC_PRO),
          textOr(d.FEC_VEN),
          text(d.IND_MON),
          text(d.IND_ANL),
          num(d.TIP_CMB_DOL),
          text(d.CONDICION_PAGO),
          num(d.SUBTOTAL),
          num(d.TIP_CMB_LOC),
          text(d.CLASE_DOCUMENTO),
          text(d.INCOTERMS),
          text(d.FORMAS_PAGO),
          text(d.NATURALEZA_OPERACION),
          text(d.CUFE),
          text(d.CODIGOQR),
          text(d.INDICADOR_FACTURACION),
          text(d.AGENTE),
          text(d.NOMBRE_AGENTE),
        ]
      );
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      [metaKey, new Date().toISOString()]
    );
  });

  return {
    documentos: documentos.length,
    omitidos,
  };
}
