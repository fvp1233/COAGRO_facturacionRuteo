import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';
import {
  COLUMNAS_DET_SERVIDOR,
  COLUMNAS_ENC_SERVIDOR,
  SQL_INSERT_DET,
  SQL_INSERT_ENC,
} from '../repositories/notasCredito';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Columnas numéricas (el resto se guarda como texto).
const NUMERICAS_ENC = new Set([
  'NUM_ITM', 'LST_PRE', 'MON_SIV', 'MON_DSC', 'POR_DSC_AP', 'MON_IMP_VT', 'MON_IMP_CS', 'CONSEC_RESOLUCION',
  'POR_DESC_AP2', 'MONT_DESC2', 'SUBTIPO',
]);
const NUMERICAS_DET = new Set([
  'MON_TOT', 'MON_PRC_MX', 'MON_PRC_MN', 'CNT_MAX', 'CNT_MIN', 'LST_PRE', 'MON_DSC', 'POR_DSC_AP',
  'PORC_EXONERACION', 'MONTO_EXONERACION', 'PORC_IMPUESTO1', 'PORC_IMPUESTO2',
]);
// Valores para las columnas NOT NULL de la tabla local si el servidor las manda null.
const DEFAULTS_ENC = {
  HOR_INI: '', HOR_FIN: '', FEC_DEV: '', NUM_ITM: 0, LST_PRE: 0, EST_DEV: '', MON_SIV: 0, MON_DSC: 0,
  POR_DSC_AP: 0, MON_IMP_VT: 0, MON_IMP_CS: 0, COD_BOD: 'ND', IMPRESO: 'N', CONSIGNACION: 'N',
};
const DEFAULTS_DET = {
  IND_DEV: '', ART_BON: '0', LOTE: '', LOTE_HIST: '', CNT_MAX: 0, CNT_MIN: 0, MON_TOT: 0, MON_PRC_MX: 0,
  MON_PRC_MN: 0, MON_DSC: 0, POR_DSC_AP: 0, LST_PRE: 0,
};

const COLS_ENC = ['COD_CIA', 'COD_ZON', 'NUM_DEV', 'DOC_PRO', 'NOM_CLT', ...COLUMNAS_ENC_SERVIDOR, 'ENVIADO'];
const COLS_DET = ['COD_CIA', 'COD_ZON', 'NUM_DEV', 'NUM_LN', ...COLUMNAS_DET_SERVIDOR];

const valorEnc = (e, col) => {
  if (col === 'ENVIADO') return 1;
  if (col === 'COD_CIA') return textOr(e.COD_CIA);
  const v = NUMERICAS_ENC.has(col) ? num(e[col]) : text(e[col]);
  return v ?? DEFAULTS_ENC[col] ?? null;
};
const valorDet = (l, col) => {
  const v = NUMERICAS_DET.has(col) ? num(l[col]) : text(l[col]);
  return v ?? DEFAULTS_DET[col] ?? null;
};

// Descarga las NC de las rutas de la handheld (pendientes de procesar y las de los últimos 30 días).
// Respuesta: { result: { dias, notasCredito: [{ encabezado: {...}, lineas: [...] }] } }.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga.
// guardar: las NC del equipo ya enviadas se reemplazan con lo recibido (las que ya no vienen se
// borran); las que aún no se envían NO se tocan (si llega una con la misma llave, se deja la del equipo).
// Llave: COD_CIA + COD_ZON + NUM_DEV.
export async function descargarNotasCredito() {
  const json = await getJson(PATHS.syncNotasCredito);
  const data = json?.result;
  if (!data || !Array.isArray(data.notasCredito)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (notas de crédito).');
  }
  const vistas = new Set();
  const notas = data.notasCredito.filter((n) => {
    const e = n?.encabezado;
    if (!e || typeof e !== 'object' || !textOr(e.COD_ZON) || !textOr(e.NUM_DEV) || !textOr(e.COD_CLT)) return false;
    const llave = `${textOr(e.COD_CIA)}|${textOr(e.COD_ZON)}|${textOr(e.NUM_DEV)}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });
  const omitidos = data.notasCredito.length - notas.length;

  const guardar = async (db) => {
    await db.runAsync(
      `DELETE FROM alFAC_DET_DEV
        WHERE EXISTS (SELECT 1 FROM alFAC_ENC_DEV e
                       WHERE e.COD_CIA = alFAC_DET_DEV.COD_CIA AND e.COD_ZON = alFAC_DET_DEV.COD_ZON
                         AND e.NUM_DEV = alFAC_DET_DEV.NUM_DEV AND e.ENVIADO = 1)`
    );
    await db.runAsync('DELETE FROM alFAC_ENC_DEV WHERE ENVIADO = 1');

    const enc = await db.prepareAsync(`${SQL_INSERT_ENC(COLS_ENC).replace('INSERT', 'INSERT OR IGNORE')}`);
    let det = null;
    try {
      det = await db.prepareAsync(SQL_INSERT_DET(COLS_DET).replace('INSERT', 'INSERT OR IGNORE'));
      for (const n of notas) {
        const e = n.encabezado;
        // Una NC sin enviar con la misma llave queda como está (INSERT OR IGNORE no la pisa).
        const res = await enc.executeAsync(COLS_ENC.map((col) => valorEnc(e, col)));
        if (!res.changes) continue;
        const lineas = Array.isArray(n.lineas) ? n.lineas.filter((l) => l && textOr(l.COD_ART)) : [];
        for (const [i, l] of lineas.entries()) {
          await det.executeAsync(
            COLS_DET.map((col) => {
              if (col === 'COD_CIA') return textOr(e.COD_CIA);
              if (col === 'COD_ZON') return textOr(e.COD_ZON);
              if (col === 'NUM_DEV') return textOr(e.NUM_DEV);
              if (col === 'NUM_LN') return i + 1;
              return valorDet(l, col);
            })
          );
        }
      }
    } finally {
      await enc.finalizeAsync();
      await det?.finalizeAsync();
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_notas_credito_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { notasCredito: notas.length, omitidos } };
}
