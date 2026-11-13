import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Fechas como 'YYYY-MM-DD' (si el servidor manda datetime '2026-11-01T00:00:00' se recorta).
const fecha = (v) => {
  const t = textOr(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};

const COLUMNAS = ['COMPANIA', 'ARTICULO', 'CLIENTE', 'CANT_MIN', 'CANT_MAX', 'FECHA_INICIO', 'FECHA_FIN', 'TIPO', 'MONTO'];
const SQL = `INSERT OR REPLACE INTO DESCUENTO_CLIART (${COLUMNAS.join(', ')}) VALUES (${COLUMNAS.map(() => '?').join(', ')})`;

// Descarga los descuentos por cliente y artículo (erpadmin.DESCUENTO_CLIART) para pedidos y
// cotizaciones. Respuesta:
//   { result: { descuentos: [{ COMPANIA, CLIENTE, ARTICULO, CANT_MIN, CANT_MAX, FECHA_INICIO,
//                              FECHA_FIN, TIPO, MONTO }] } }
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarDescuentos() {
  const json = await getJson(PATHS.syncDescuentos);
  const data = json?.result;
  if (!data || !Array.isArray(data.descuentos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (descuentos).');
  }
  // Se descartan filas sin sus campos obligatorios (todas las columnas son NOT NULL salvo COMPANIA).
  const descuentos = data.descuentos.filter(
    (d) =>
      d &&
      typeof d === 'object' &&
      textOr(d.ARTICULO) !== '' &&
      textOr(d.CLIENTE) !== '' &&
      textOr(d.TIPO) !== '' &&
      num(d.CANT_MIN) != null &&
      num(d.CANT_MAX) != null &&
      num(d.MONTO) != null &&
      fecha(d.FECHA_INICIO) != null &&
      fecha(d.FECHA_FIN) != null
  );
  const omitidos = data.descuentos.length - descuentos.length;

  const guardar = async (db) => {
    // Se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM DESCUENTO_CLIART');
    const sql = await db.prepareAsync(SQL);
    try {
      for (const d of descuentos) {
        await sql.executeAsync([
          textOr(d.COMPANIA),
          textOr(d.ARTICULO),
          textOr(d.CLIENTE),
          num(d.CANT_MIN),
          num(d.CANT_MAX),
          fecha(d.FECHA_INICIO),
          fecha(d.FECHA_FIN),
          textOr(d.TIPO),
          num(d.MONTO),
        ]);
      }
    } finally {
      await sql.finalizeAsync();
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_descuentos_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { descuentos: descuentos.length, omitidos } };
}
