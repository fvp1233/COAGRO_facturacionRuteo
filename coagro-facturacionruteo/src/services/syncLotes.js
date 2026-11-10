import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const SQL = `INSERT OR REPLACE INTO ARTICULO_EXISTENCIA_LOTE
  (COMPANIA, BODEGA, ARTICULO, LOCALIZACION, LOTE, FECHA_VENCIMIENTO, EXISTENCIA, TIPO_INGRESO)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

// Descarga las existencias por lote (ARTICULO_EXISTENCIA_LOTE). BODEGA es la bodega del ERP: se
// cruza con RUTA_ARTICULO_RT.BODEGA_ERP, igual que ARTICULO_EXISTENCIA.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarLotes() {
  const json = await getJson(PATHS.syncLotes);
  const data = json?.result;
  if (!data || !Array.isArray(data.lotes)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (lotes).');
  }
  // Se descartan filas sin sus campos clave (no se guardan códigos vacíos) y se informa cuántas.
  const lotes = data.lotes.filter(
    (fila) => fila && typeof fila === 'object' && ['BODEGA', 'ARTICULO', 'LOTE'].every((k) => textOr(fila[k]) !== '')
  );
  const omitidos = data.lotes.length - lotes.length;

  const guardar = async (db) => {
    // Se reemplazan completas con lo que manda el servidor.
    await db.runAsync('DELETE FROM ARTICULO_EXISTENCIA_LOTE');

    const sql = await db.prepareAsync(SQL);
    try {
      for (const l of lotes) {
        await sql.executeAsync([
          text(l.COMPANIA),
          textOr(l.BODEGA),
          textOr(l.ARTICULO),
          textOr(l.LOCALIZACION),
          textOr(l.LOTE),
          textOr(l.FECHA_VENCIMIENTO),
          num(l.EXISTENCIA) ?? 0,
          textOr(l.TIPO_INGRESO, 'P'),
        ]);
      }
    } finally {
      await sql.finalizeAsync();
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_lotes_at', ?)",
      [new Date().toISOString()]
    );
  };

  const resumen = {
    lotes: lotes.length,
    omitidos,
  };
  return { guardar, resumen };
}
