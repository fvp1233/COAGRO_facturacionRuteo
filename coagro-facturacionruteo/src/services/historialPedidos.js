import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';
import { getDatabase } from '../db/database';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const ENC = `INSERT OR REPLACE INTO HISTORIAL_PED_ENC
  (COD_CIA, NUM_PED, COD_CLT, COD_ZON, FEC_PED, EST_PED, MON_PED, DESC1, DESC2, MONT_DESC1, MONT_DESC2,
   ACTIVIDAD_COMERCIAL, FACTURAS, HAY_FACTURADAS, TIENE_MONTOS, TOTAL_MERCADERIA, DESCUENTO_VOLUMEN,
   SUBTOTAL, IVA, GRAN_TOTAL, ORDEN)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DET = `INSERT INTO HISTORIAL_PED_DET
  (COD_CIA, NUM_PED, NUM_LN, COD_ART, EST_BON, EST_LN, FACTURADA, CANTIDAD, PRECIO, MONT_DESC, PRC_DESC,
   TOTAL_LINEA)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const esFacturada = (l) => l.facturada === true || text(l.EST_LN) === 'F';

// Pide al servidor el historial de pedidos del cliente (requiere internet) y reemplaza su caché
// local (HISTORIAL_PED_ENC/DET) en UNA transacción: si algo falla, la caché queda como estaba.
// Lanza ApiError si el servidor responde success: false (mensaje = errors[0]) o sin red.
// La pantalla lee después la caché con repositories/historialPedidos.
export async function actualizarHistorialPedidos(cliente) {
  const json = await getJson(PATHS.historialPedidos(cliente));
  const data = json?.result;
  if (!data || !Array.isArray(data.historial)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (historial).');
  }
  // Llave del pedido: COD_CIA + NUM_PED. Se descartan los que no traen NUM_PED y los repetidos.
  const vistos = new Set();
  const historial = data.historial.filter((h) => {
    const numero = textOr(h?.encabezado?.NUM_PED);
    if (!numero) return false;
    const llave = `${textOr(h.encabezado.COD_CIA)}|${numero}`;
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Solo el historial de este cliente (sin merge): primero sus líneas, luego sus encabezados.
    await db.runAsync(
      `DELETE FROM HISTORIAL_PED_DET
        WHERE EXISTS (SELECT 1 FROM HISTORIAL_PED_ENC e
                       WHERE e.COD_CLT = ? AND e.COD_CIA = HISTORIAL_PED_DET.COD_CIA
                         AND e.NUM_PED = HISTORIAL_PED_DET.NUM_PED)`,
      [cliente]
    );
    await db.runAsync('DELETE FROM HISTORIAL_PED_ENC WHERE COD_CLT = ?', [cliente]);

    const enc = await db.prepareAsync(ENC);
    let det = null;
    try {
      det = await db.prepareAsync(DET);
      for (const [orden, h] of historial.entries()) {
        const e = h.encabezado;
        const cia = textOr(e.COD_CIA);
        const numero = textOr(e.NUM_PED);
        const lineas = (Array.isArray(h.lineas) ? h.lineas : []).filter((l) => l && typeof l === 'object');
        const facturas = (Array.isArray(h.facturas) ? h.facturas : []).map(text).filter(Boolean);
        // montos null = todo el pedido está facturado.
        const m = h.montos && typeof h.montos === 'object' ? h.montos : null;
        await enc.executeAsync([
          cia,
          numero,
          // Se guarda con el código consultado: la caché se reemplaza por ese código.
          cliente,
          text(e.COD_ZON),
          text(e.FEC_PED),
          text(e.EST_PED),
          num(e.MON_PED),
          num(e.DESC1),
          num(e.DESC2),
          num(e.MONT_DESC1),
          num(e.MONT_DESC2),
          text(e.ACTIVIDAD_COMERCIAL),
          JSON.stringify(facturas),
          lineas.some(esFacturada) ? 1 : 0,
          m ? 1 : 0,
          m ? num(m.totalMercaderia) ?? 0 : null,
          m ? num(m.descuentoVolumen) ?? 0 : null,
          m ? num(m.subtotal) ?? 0 : null,
          m ? num(m.iva) ?? 0 : null,
          m ? num(m.granTotal) ?? 0 : null,
          orden,
        ]);
        for (const l of lineas) {
          await det.executeAsync([
            cia,
            numero,
            num(l.NUM_LN),
            text(l.COD_ART),
            text(l.EST_BON),
            text(l.EST_LN),
            esFacturada(l) ? 1 : 0,
            num(l.cantidad),
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
      `historial_pedidos_at:${cliente}`,
      new Date().toISOString(),
    ]);
  });
}
