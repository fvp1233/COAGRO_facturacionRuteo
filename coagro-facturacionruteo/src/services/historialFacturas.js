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
   SUBTOTAL, IVA, GRAN_TOTAL, ORDEN, AGENTE, NOMBRE_AGENTE)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DET = `INSERT INTO HISTORIAL_FAC_DET
  (COD_CIA, NUM_FAC, NUM_LN, COD_ART, EST_BON, CANT_FAC, CANT_DEV, PRECIO, MONT_DESC, PRC_DESC, TOTAL_LINEA)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// Valida la respuesta y descarta las facturas sin NUM_FAC y las repetidas (llave COD_CIA + NUM_FAC).
function leerHistorial(json) {
  const data = json?.result;
  if (!data || !Array.isArray(data.historial)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (historial de facturas).');
  }
  const vistas = new Set();
  const historial = data.historial.filter((h) => {
    const numero = textOr(h?.encabezado?.NUM_FAC);
    if (!numero) return false;
    const llave = `${textOr(h.encabezado.COD_CIA)}|${numero}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });
  return { historial, omitidos: data.historial.length - historial.length };
}

// Inserta las facturas (ya validadas) en HISTORIAL_FAC_ENC/DET. ORDEN = posición en que llegaron.
// cliente: código con que se guardan (consulta por cliente); null = el COD_CLT de cada encabezado.
async function insertarFacturas(db, historial, cliente = null) {
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
        cliente ?? text(e.COD_CLT),
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
        // Vendedor de la factura (mismos nombres que en los documentos de cobro).
        text(e.AGENTE),
        text(e.NOMBRE_AGENTE),
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
          // El endpoint manda PRE_UNI y total/MONT_LN; se aceptan también precio/totalLinea.
          num(l.precio ?? l.PRE_UNI),
          num(l.MONT_DESC),
          num(l.PRC_DESC),
          num(l.totalLinea ?? l.total ?? l.MONT_LN),
        ]);
      }
    }
  } finally {
    await enc.finalizeAsync();
    await det?.finalizeAsync();
  }
}

// Pide al servidor el historial de facturas del cliente (requiere internet) y reemplaza su caché
// local (HISTORIAL_FAC_ENC/DET) en UNA transacción: si algo falla, la caché queda como estaba.
// Lanza ApiError si el servidor responde success: false (mensaje = errors[0]) o sin red.
// La pantalla lee después la caché con repositories/historialFacturas.
export async function actualizarHistorialCliente(cliente) {
  const { historial } = leerHistorial(await getJson(PATHS.historialFacturas(cliente)));

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
    // Se guarda con el código consultado: la caché se reemplaza por ese código.
    await insertarFacturas(db, historial, cliente);
    await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
      `historial_facturas_at:${cliente}`,
      new Date().toISOString(),
    ]);
  });
}

// Historial de facturas de TODOS los clientes de las rutas de la handheld (últimos meses), para
// Cargar datos. Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen };
// DatosScreen llama guardar dentro de UNA transacción con el resto de la carga.
export async function descargarHistorialFacturasRuta() {
  const { historial, omitidos } = leerHistorial(await getJson(PATHS.syncHistorialFacturasRuta));

  const guardar = async (db) => {
    // Foto completa: reemplaza la caché de todos los clientes (también lo consultado en línea).
    await db.runAsync('DELETE FROM HISTORIAL_FAC_DET');
    await db.runAsync('DELETE FROM HISTORIAL_FAC_ENC');
    await insertarFacturas(db, historial);
    await db.runAsync("DELETE FROM app_meta WHERE key LIKE 'historial_facturas_at:%'");
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_historial_facturas_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { facturas: historial.length, omitidos } };
}
