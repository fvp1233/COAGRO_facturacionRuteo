import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';
import { getDatabase } from '../db/database';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const ENC = `INSERT OR REPLACE INTO HISTORIAL_FAC_ENC
  (COD_CIA, NUM_FAC, NUM_PED, COD_CLT, COD_ZON, FEC_FAC, MON_FAC, ANULADA, NCF, COD_CND, DESC1, DESC2,
   MONT_DESC1, MONT_DESC2, ACTIVIDAD_COMERCIAL, ESTADO_COMPROBANTE, TOTAL_MERCADERIA, DESCUENTO_VOLUMEN,
   SUBTOTAL, IVA, GRAN_TOTAL, ORDEN)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DET = `INSERT INTO HISTORIAL_FAC_DET
  (COD_CIA, NUM_FAC, NUM_LN, COD_ART, EST_BON, CANT_FAC, CANT_DEV, PRECIO, MONT_DESC, PRC_DESC, TOTAL_LINEA)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// Pide al servidor el historial de facturas del cliente (requiere internet) y reemplaza su caché
// local (HISTORIAL_FAC_ENC/DET) en UNA transacción: si algo falla, la caché queda como estaba.
// Lanza ApiError si el servidor responde success: false (mensaje = errors[0]) o sin red.
// La pantalla lee después la caché con repositories/historialFacturas.
export async function actualizarHistorialCliente(cliente) {
  const json = await getJson(PATHS.historialFacturas(cliente));
  const data = json?.result;
  if (!data || !Array.isArray(data.historial)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (historial).');
  }
  // Llave de la factura: COD_CIA + NUM_FAC. Se descartan las que no traen NUM_FAC y las repetidas.
  const vistas = new Set();
  const historial = data.historial.filter((h) => {
    const numero = textOr(h?.encabezado?.NUM_FAC);
    if (!numero) return false;
    const llave = `${textOr(h.encabezado.COD_CIA)}|${numero}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Solo el historial de este cliente (sin merge): primero sus líneas, luego sus encabezados.
    await db.runAsync(
      `DELETE FROM HISTORIAL_FAC_DET
        WHERE EXISTS (SELECT 1 FROM HISTORIAL_FAC_ENC e
                       WHERE e.COD_CLT = ? AND e.COD_CIA = HISTORIAL_FAC_DET.COD_CIA
                         AND e.NUM_FAC = HISTORIAL_FAC_DET.NUM_FAC)`,
      [cliente]
    );
    await db.runAsync('DELETE FROM HISTORIAL_FAC_ENC WHERE COD_CLT = ?', [cliente]);

    const enc = await db.prepareAsync(ENC);
    let det = null;
    try {
      det = await db.prepareAsync(DET);
      for (const [orden, h] of historial.entries()) {
        const e = h.encabezado;
        const cia = textOr(e.COD_CIA);
        const numero = textOr(e.NUM_FAC);
        const m = h.montos ?? {};
        await enc.executeAsync([
          cia,
          numero,
          text(e.NUM_PED),
          // Se guarda con el código consultado: la caché se reemplaza por ese código.
          cliente,
          text(e.COD_ZON),
          text(e.FEC_FAC),
          num(e.MON_FAC),
          h.anulada === true || text(e.ANULAR) === 'S' ? 1 : 0,
          text(e.NCF),
          text(e.COD_CND),
          num(e.DESC1),
          num(e.DESC2),
          num(e.MONT_DESC1),
          num(e.MONT_DESC2),
          text(e.ACTIVIDAD_COMERCIAL),
          text(e.ESTADO_COMPROBANTE),
          num(m.totalMercaderia) ?? 0,
          num(m.descuentoVolumen) ?? 0,
          num(m.subtotal) ?? 0,
          num(m.iva) ?? 0,
          num(m.granTotal) ?? 0,
          orden,
        ]);
        for (const l of Array.isArray(h.lineas) ? h.lineas : []) {
          if (!l || typeof l !== 'object') continue;
          await det.executeAsync([
            cia,
            numero,
            num(l.NUM_LN),
            text(l.COD_ART),
            text(l.EST_BON),
            num(l.CANT_FAC),
            num(l.CANT_DEV),
            num(l.precio),
            num(l.MONT_DESC),
            num(l.PRC_DESC),
            num(l.totalLinea),
          ]);
        }
      }
    } finally {
      await enc.finalizeAsync();
      await det?.finalizeAsync();
    }

    await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
      `historial_facturas_at:${cliente}`,
      new Date().toISOString(),
    ]);
  });
}
