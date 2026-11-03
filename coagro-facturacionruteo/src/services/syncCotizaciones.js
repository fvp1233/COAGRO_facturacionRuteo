import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';
import { COLUMNAS_DET, COLUMNAS_ENC } from '../repositories/pedidos';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;

// Columnas NOT NULL de las tablas locales: si el servidor manda null se usa el mismo valor que
// pondría guardarPedido (un null explícito no toma el DEFAULT de SQLite).
const DEFECTO_ENC = {
  COD_BOD: 'ND', LST_PRE: 0, COD_CND: '', COD_PAIS: '', DOC_PRO: 'N', ESTADO: 'P', TIP_DOC: 'C',
  DESCUENTO_CASCADA: 'N', IMPRESO: 'N', CONSIGNACION: 'N', MON_DSC: 0, MON_IMP_VT: 0, MON_IMP_CS: 0,
  MON_SIV: 0, MON_CIV: 0, HOR_INI: '', HOR_FIN: '', FEC_PED: '', FEC_DES: '',
};
const DEFECTO_DET = { CNT_MAX: 0, CNT_MIN: 0, MON_TOT: 0, MON_DSC: 0, LST_PRE: 0, MON_PRC_MX: 0, POR_DSC_AP: 0 };

const valor = (fila, col, defecto) => {
  const v = fila[col];
  if (v === null || v === undefined) return defecto[col] ?? null;
  return typeof v === 'string' ? v.trim() : v;
};

const insertar = (tabla, columnas) =>
  `INSERT OR REPLACE INTO ${tabla} (${columnas.join(', ')}, ENVIADO) VALUES (${columnas.map(() => '?').join(', ')}, 1)`;

// Descarga las cotizaciones (TIP_DOC 'C') de las rutas de la handheld para poder aprobarlas en el
// equipo. Se guardan en alFAC_ENC_PED + alFAC_DET_PED como ya enviadas (ENVIADO = 1).
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarCotizaciones() {
  const json = await getJson(PATHS.syncCotizaciones);
  const data = json?.result;
  if (!data || !Array.isArray(data.cotizaciones)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (cotizaciones).');
  }
  // Se descartan las que no traen sus campos clave o no tienen líneas, y se informa cuántas.
  const cotizaciones = data.cotizaciones.filter(
    (c) =>
      c?.encabezado &&
      ['COD_ZON', 'NUM_PED', 'COD_CLT'].every((k) => textOr(c.encabezado[k]) !== '') &&
      Array.isArray(c.lineas) &&
      c.lineas.length > 0
  );
  const omitidos = data.cotizaciones.length - cotizaciones.length;

  const guardar = async (db) => {
    // Las enviadas ya se borraron en limpiarEnviados (misma transacción): se vuelven a llenar.
    for (const { encabezado, lineas } of cotizaciones) {
      const numero = textOr(encabezado.NUM_PED);
      await db.runAsync(
        insertar('alFAC_ENC_PED', COLUMNAS_ENC),
        COLUMNAS_ENC.map((col) => valor(encabezado, col, DEFECTO_ENC))
      );
      // alFAC_DET_PED no tiene llave de ruta: se reemplazan las líneas de ese número.
      await db.runAsync('DELETE FROM alFAC_DET_PED WHERE NUM_PED = ?', [numero]);
      for (const l of lineas) {
        const det = { ...l, COD_CIA: encabezado.COD_CIA, NUM_PED: numero };
        await db.runAsync(
          `INSERT OR REPLACE INTO alFAC_DET_PED (${COLUMNAS_DET.join(', ')}) VALUES (${COLUMNAS_DET.map(() => '?').join(', ')})`,
          COLUMNAS_DET.map((col) => {
            const v = valor(det, col, DEFECTO_DET);
            // Localmente PORC_IMPUESTO1/2 son texto (así los guarda guardarPedido).
            return col.startsWith('PORC_IMPUESTO') && v !== null ? String(v) : v;
          })
        );
      }
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_cotizaciones_at', ?)",
      [new Date().toISOString()]
    );
  };

  const resumen = {
    cotizaciones: cotizaciones.length,
    omitidos,
  };
  return { guardar, resumen };
}
