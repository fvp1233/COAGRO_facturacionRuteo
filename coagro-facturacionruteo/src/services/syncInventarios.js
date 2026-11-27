import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

const SQL_ENC = `INSERT OR IGNORE INTO alFAC_ENC_INV
  (COD_CIA, COD_ZON, NUM_INV, COD_CLT, NOM_CLT, HOR_INI, HOR_FIN, FEC_INV, NUM_ITM, DOC_PRO, ENVIADO)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
const SQL_DET = `INSERT OR IGNORE INTO alFAC_DET_INV (COD_CIA, COD_ZON, NUM_INV, NUM_LN, COD_ART, CNT_MAX, CNT_MIN)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

// Descarga los inventarios de clientes de las rutas de la handheld: los pendientes de procesar
// (DOC_PRO 'N') y los de los últimos 30 días.
// Respuesta: { result: { dias, inventarios: [{ encabezado: { COD_CIA, COD_ZON, NUM_INV, COD_CLT, NOM_CLT,
//   HOR_INI, HOR_FIN, FEC_INV, NUM_ITM, DOC_PRO }, lineas: [{ COD_ART, CNT_MAX, CNT_MIN }] }] } }.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga.
// guardar: los inventarios del equipo ya enviados se reemplazan con lo recibido (los que ya no vienen
// se borran); los que aún no se envían NO se tocan (si llega uno con la misma llave, se deja el del
// equipo). Llave: COD_CIA + COD_ZON + NUM_INV.
export async function descargarInventarios() {
  const json = await getJson(PATHS.syncInventarios);
  const data = json?.result;
  if (!data || !Array.isArray(data.inventarios)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (inventarios).');
  }
  const vistas = new Set();
  const inventarios = data.inventarios.filter((inv) => {
    const e = inv?.encabezado;
    if (!e || typeof e !== 'object' || !textOr(e.COD_ZON) || !textOr(e.NUM_INV) || !textOr(e.COD_CLT)) return false;
    const llave = `${textOr(e.COD_CIA)}|${textOr(e.COD_ZON)}|${textOr(e.NUM_INV)}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });
  const omitidos = data.inventarios.length - inventarios.length;

  const guardar = async (db) => {
    await db.runAsync(
      `DELETE FROM alFAC_DET_INV
        WHERE EXISTS (SELECT 1 FROM alFAC_ENC_INV e
                       WHERE e.COD_CIA = alFAC_DET_INV.COD_CIA AND e.COD_ZON = alFAC_DET_INV.COD_ZON
                         AND e.NUM_INV = alFAC_DET_INV.NUM_INV AND e.ENVIADO = 1)`
    );
    await db.runAsync('DELETE FROM alFAC_ENC_INV WHERE ENVIADO = 1');

    const enc = await db.prepareAsync(SQL_ENC);
    let det = null;
    try {
      det = await db.prepareAsync(SQL_DET);
      for (const inv of inventarios) {
        const e = inv.encabezado;
        const cia = textOr(e.COD_CIA);
        const zona = textOr(e.COD_ZON);
        const numero = textOr(e.NUM_INV);
        const lineas = Array.isArray(inv.lineas) ? inv.lineas.filter((l) => l && textOr(l.COD_ART)) : [];
        // Uno sin enviar con la misma llave queda como está (INSERT OR IGNORE no lo pisa).
        const res = await enc.executeAsync([
          cia,
          zona,
          numero,
          textOr(e.COD_CLT),
          text(e.NOM_CLT),
          textOr(e.HOR_INI),
          textOr(e.HOR_FIN),
          textOr(e.FEC_INV),
          e.NUM_ITM == null ? lineas.length : num(e.NUM_ITM),
          text(e.DOC_PRO),
        ]);
        if (!res.changes) continue;
        for (const [i, l] of lineas.entries()) {
          await det.executeAsync([cia, zona, numero, i + 1, textOr(l.COD_ART), num(l.CNT_MAX), num(l.CNT_MIN)]);
        }
      }
    } finally {
      await enc.finalizeAsync();
      await det?.finalizeAsync();
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_inventarios_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { inventarios: inventarios.length, omitidos } };
}
