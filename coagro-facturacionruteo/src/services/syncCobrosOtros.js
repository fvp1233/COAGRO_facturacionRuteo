import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v) => text(v) ?? '';
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Abonos que OTRAS handhelds (otros vendedores) ya registraron a documentos de los clientes de las
// rutas de esta y que control aún no aplica en el ERP (recibo con DOC_PRO = 'N'). Sirven para que el
// Calendario muestre "Cobrado por <vendedor>" antes de que el saldo baje en el ERP.
// Respuesta: { result: { abonos: [{ COD_CIA, COD_TIP_DC, NUM_DOC, COD_CLT, COD_ZON, CTA_BCO, NUM_DEP,
// FEC_DEP, IND_MON, MONTO, VENDEDOR, NOMBRE_VENDEDOR }] } }.
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }.
export async function descargarCobrosOtros() {
  const json = await getJson(PATHS.syncCobrosOtros);
  const data = json?.result;
  if (!data || !Array.isArray(data.abonos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (abonos).');
  }
  const abonos = data.abonos.filter(
    (a) =>
      a && typeof a === 'object' &&
      ['COD_TIP_DC', 'NUM_DOC', 'COD_CLT', 'CTA_BCO', 'NUM_DEP'].every((k) => textOr(a[k]) !== '') &&
      Number.isFinite(num(a.MONTO))
  );
  const omitidos = data.abonos.length - abonos.length;

  const guardar = async (db) => {
    await db.runAsync('DELETE FROM COBRO_OTRO_VENDEDOR');
    for (const a of abonos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO COBRO_OTRO_VENDEDOR
           (COD_CIA, COD_TIP_DC, NUM_DOC, COD_CLT, COD_ZON, CTA_BCO, NUM_DEP, FEC_DEP, IND_MON, MONTO,
            VENDEDOR, NOMBRE_VENDEDOR)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          text(a.COD_CIA),
          textOr(a.COD_TIP_DC),
          textOr(a.NUM_DOC),
          textOr(a.COD_CLT),
          text(a.COD_ZON),
          textOr(a.CTA_BCO),
          textOr(a.NUM_DEP),
          text(a.FEC_DEP),
          text(a.IND_MON),
          num(a.MONTO),
          text(a.VENDEDOR),
          text(a.NOMBRE_VENDEDOR),
        ]
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_cobros_otros_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { abonos: abonos.length, omitidos } };
}

// Si el servidor no responde bien (p. ej. el endpoint aún no existe) se vacía la tabla: es mejor no
// marcar nada que mostrar como cobrado algo que quizá ya cambió.
export const sinCobrosOtros = {
  guardar: async (db) => {
    await db.runAsync('DELETE FROM COBRO_OTRO_VENDEDOR');
  },
  resumen: { abonos: null, omitidos: 0 },
};
