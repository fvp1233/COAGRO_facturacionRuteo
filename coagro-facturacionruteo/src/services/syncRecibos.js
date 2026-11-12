import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';
import { sincronizarRecibos } from '../repositories/depositos';

const textOr = (v) => (v == null ? '' : String(v).trim());

// Descarga los recibos de cobro de esta handheld que control aún no aplica en el ERP (DOC_PRO = 'N').
// Respuesta: { result: { recibos: [{ NUM_DEP, COD_CIA, COD_BCO, CTA_BCO, NOM_CTA, MON_DEP, FEC_DEP,
// IND_MON, NOTAS, DOC_PRO, CONSEC_DEP, lineas: [{ NUM_DOC, COD_TIP_DC, CLASE_DOCUMENTO, COD_CLT, NOM_CLT,
// COD_ZON, MON_EFE, MON_CHE, MON_DEP, MON_TRA, REF }] }] } }.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga. guardar cuadra los recibos del equipo
// con estos (ver sincronizarRecibos): los que ya no vienen fueron aplicados por control.
export async function descargarRecibosPendientes() {
  const json = await getJson(PATHS.syncRecibosPendientes);
  const data = json?.result;
  if (!data || !Array.isArray(data.recibos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (recibos).');
  }
  // Se descartan filas sin su llave (cuenta + número de recibo) y se informa cuántas.
  const recibos = data.recibos.filter(
    (r) => r && typeof r === 'object' && textOr(r.CTA_BCO) !== '' && textOr(r.NUM_DEP) !== ''
  );
  const omitidos = data.recibos.length - recibos.length;

  const guardar = async (db) => {
    await sincronizarRecibos(db, recibos);
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_recibos_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { recibos: recibos.length, omitidos } };
}
