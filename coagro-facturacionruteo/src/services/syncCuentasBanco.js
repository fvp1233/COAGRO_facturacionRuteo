import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;

// Descarga las cuentas bancarias de la empresa (alCXC_CTA_BCO): donde el vendedor deposita o el
// cliente transfiere lo cobrado. Respuesta: { result: { cuentas: [{ COD_CIA, COD_BCO, CTA_BCO, NOM_CTA, MONEDA }] } }.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarCuentasBanco() {
  const json = await getJson(PATHS.syncCuentasBanco);
  const data = json?.result;
  if (!data || !Array.isArray(data.cuentas)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (cuentas).');
  }
  // Se descartan filas sin sus campos clave y se informa cuántas.
  const cuentas = data.cuentas.filter(
    (fila) => fila && typeof fila === 'object' && ['COD_BCO', 'CTA_BCO'].every((k) => textOr(fila[k]) !== '')
  );
  const omitidos = data.cuentas.length - cuentas.length;

  const guardar = async (db) => {
    // Se reemplazan completas con lo que manda el servidor.
    await db.runAsync('DELETE FROM alCXC_CTA_BCO');
    const sql = await db.prepareAsync(
      'INSERT OR REPLACE INTO alCXC_CTA_BCO (COD_CIA, COD_BCO, CTA_BCO, NOM_CTA, MONEDA) VALUES (?, ?, ?, ?, ?)'
    );
    try {
      for (const c of cuentas) {
        await sql.executeAsync([textOr(c.COD_CIA), textOr(c.COD_BCO), textOr(c.CTA_BCO), text(c.NOM_CTA), text(c.MONEDA)]);
      }
    } finally {
      await sql.finalizeAsync();
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_cuentas_banco_at', ?)",
      [new Date().toISOString()]
    );
  };

  return { guardar, resumen: { cuentas: cuentas.length, omitidos } };
}
