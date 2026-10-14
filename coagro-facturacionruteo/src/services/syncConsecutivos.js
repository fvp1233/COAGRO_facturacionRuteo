import { getJson, ApiError } from './api';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Columnas de RUTA_CONSECUT_RT (mismo nombre que en el servidor). Las terminadas en _SEC son
// enteros; el resto, texto.
const COLUMNAS = [
  'RUTA', 'COMPANIA', 'PEDIDO', 'RECIBO', 'DEVOLUCION', 'FACTURA', 'INVENTARIO', 'PEDIDO_DESCUENTO',
  'NOTACREDITO', 'NCF_CONSUMIDOR_F', 'NCF_ORGANIZADO', 'NCF_REGIMEN_ESP', 'NCF_GUBERNAMENTAL',
  'NCF_DEVOLUCION', 'NCF_RECIBO', 'GARANTIA', 'CONSEC_RESOLUCION_FAC', 'CONSEC_RESOLUCION_DEV',
  'NCF_CONSUMIDOR_F_SEC', 'NCF_ORGANIZADO_SEC', 'NCF_REGIMEN_ESP_SEC', 'NCF_GUBERNAMENTAL_SEC',
  'NCF_DEVOCULION_SEC', 'NCF_RECIBO_SEC', 'NCF_FACTURA_EXP', 'NCF_FACTURA_EXP_SEC',
  'NCF_CONTING_CRDT_FISCAL', 'NCF_CONTING_CRDT_FISCAL_SEC', 'NCF_CONTING_CONSUMO',
  'NCF_CONTING_CONSUMO_SEC', 'NCF_CONTING_GUBERNAMENTAL', 'NCF_CONTING_GUBERNAMENTAL_SEC',
  'NCF_CONTING_REGIMEN_ESP', 'NCF_CONTING_REGIMEN_ESP_SEC', 'NCF_CONTING_DEVOLUCION',
  'NCF_CONTING_DEVOLUCION_SEC', 'NCF_CONTING_FACTURA_EXP', 'NCF_CONTING_FACTURA_EXP_SEC',
  'CREDITO_FISCAL', 'SUBTIPO_CREDITO_FISCAL', 'DTE_CREDITO_FISCAL', 'FACTURA_EXPORTACION',
  'SUBTIPO_FACTURA_EXPORTACION', 'DTE_FACTURA_EXPORTACION', 'SUBTIPO_FACTURA', 'DTE_FACTURA',
  'SUBTIPO_DEVOLUCION', 'DTE_DEVOLUCION', 'SUBTIPO_NOTA_CREDITO', 'DTE_NOTA_CREDITO',
  'SUBTIPO_OTRO_CREDITO', 'DTE_OTRO_CREDITO', 'DEVOLUCION_ANULACION', 'SUBTIPO_DEVOLUCION_ANULACION',
  'DTE_DEVOLUCION_ANULACION',
];

const valor = (fila, col) => {
  if (col === 'RUTA') return textOr(fila.RUTA);
  return col.endsWith('_SEC') ? num(fila[col]) : text(fila[col]);
};

// Descarga los consecutivos de las rutas de la handheld (RUTA_CONSECUT_RT) y los guarda en SQLite
// en UNA transacción: o se guarda todo o no se toca nada. Devuelve un resumen con los conteos.
export async function syncConsecutivos() {
  const json = await getJson(PATHS.syncConsecutivos);
  const data = json?.result;
  if (!data || !Array.isArray(data.consecutivos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (consecutivos).');
  }
  // Se descartan filas sin RUTA (no se guardan códigos vacíos) y se informa cuántas.
  const consecutivos = data.consecutivos.filter(
    (fila) => fila && typeof fila === 'object' && textOr(fila.RUTA) !== ''
  );
  const omitidos = data.consecutivos.length - consecutivos.length;

  const sql = `INSERT OR REPLACE INTO RUTA_CONSECUT_RT (${COLUMNAS.join(', ')})
     VALUES (${COLUMNAS.map(() => '?').join(', ')})`;

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Los consecutivos se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM RUTA_CONSECUT_RT');

    for (const c of consecutivos) {
      await db.runAsync(sql, COLUMNAS.map((col) => valor(c, col)));
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_consecutivos_at', ?)",
      [new Date().toISOString()]
    );
  });

  return {
    consecutivos: consecutivos.length,
    omitidos,
  };
}
