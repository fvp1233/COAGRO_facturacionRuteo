import { getJson, ApiError } from './api';
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
  // Flete de la ruta (ver repositories/flete).
  'USA_FLETE', 'MINIMO_FLETE', 'MONTO_FLETE', 'ARTICULO_FLETE',
];

// Columnas numéricas que no terminan en _SEC.
const NUMERICAS = new Set(['MINIMO_FLETE', 'MONTO_FLETE']);

const valor = (fila, col) => {
  if (col === 'RUTA') return textOr(fila.RUTA);
  if (col === 'USA_FLETE') return text(fila.USA_FLETE)?.toUpperCase() ?? null;
  return col.endsWith('_SEC') || NUMERICAS.has(col) ? num(fila[col]) : text(fila[col]);
};

// Columnas de ARTICULO que se guardan del artículo de flete (articulosFlete[]).
const COLUMNAS_ARTICULO = [
  'GRP_ART', 'COD_ART', 'COD_CIA', 'UND_EMP', 'EMP_ALM', 'EMP_DET', 'COD_BAR', 'DES_ART', 'COD_FAM',
  'COD_CLS', 'IMPUESTO', 'USA_LOTES', 'COSTO_LOCAL', 'COSTO_DOLAR', 'FACTOR_PRECIO', 'ORDEN_ART',
  'FACTOR_VENTA', 'ARTICULO_ENVASE', 'TIPO', 'CODIGO_RETENCION', 'RETENCION_VENTA', 'RETENCION_COMPRA',
  'MODELO_RETENCION', 'CLASIFICACION3', 'CLASIFICACION4', 'CLASIFICACION5', 'CLASIFICACION6',
  'TIPO_DOC_IVA', 'NIT', 'CANASTA_BASICA', 'ES_OTRO_CARGO', 'TIPO_VENTA',
];
// Mismos valores por defecto que syncArticulos para las columnas NOT NULL.
const DEFAULTS_ARTICULO = {
  GRP_ART: '', COD_ART: '', DES_ART: '', IMPUESTO: '', USA_LOTES: 'N', UND_EMP: 1, COSTO_LOCAL: 0,
  COSTO_DOLAR: 0, FACTOR_PRECIO: 0, FACTOR_VENTA: 1,
};
const NUMERICAS_ARTICULO = new Set(['UND_EMP', 'COSTO_LOCAL', 'COSTO_DOLAR', 'FACTOR_PRECIO', 'FACTOR_VENTA']);
const valorArticulo = (a, col) => {
  const v = NUMERICAS_ARTICULO.has(col) ? num(a[col]) : text(a[col]);
  return v ?? DEFAULTS_ARTICULO[col] ?? null;
};

// Descarga los consecutivos de las rutas de la handheld (RUTA_CONSECUT_RT, con la configuración
// del flete) y los artículos de flete (articulosFlete[]).
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarConsecutivos() {
  const json = await getJson(PATHS.syncConsecutivos);
  const data = json?.result;
  if (!data || !Array.isArray(data.consecutivos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (consecutivos).');
  }
  // Se descartan filas sin RUTA (no se guardan códigos vacíos) y se informa cuántas.
  const consecutivos = data.consecutivos.filter(
    (fila) => fila && typeof fila === 'object' && textOr(fila.RUTA) !== ''
  );
  // Artículos de flete (ej. 103) con sus datos completos: se guardan en ARTICULO porque por
  // /fr/sync/articulos solo bajan en las rutas de su grupo. Si el servidor no los manda, no se tocan.
  const articulosFlete = Array.isArray(data.articulosFlete)
    ? data.articulosFlete.filter(
        (a) => a && typeof a === 'object' && textOr(a.COD_ART) !== '' && textOr(a.GRP_ART) !== ''
      )
    : [];
  const omitidos =
    data.consecutivos.length - consecutivos.length +
    (Array.isArray(data.articulosFlete) ? data.articulosFlete.length - articulosFlete.length : 0);

  const sql = `INSERT OR REPLACE INTO RUTA_CONSECUT_RT (${COLUMNAS.join(', ')})
     VALUES (${COLUMNAS.map(() => '?').join(', ')})`;

  const guardar = async (db) => {
    // Los consecutivos se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM RUTA_CONSECUT_RT');

    for (const c of consecutivos) {
      await db.runAsync(sql, COLUMNAS.map((col) => valor(c, col)));
    }

    // Se guarda o actualiza sobre lo que dejó syncArticulos (que borra ARTICULO completo): por eso
    // en DatosScreen los consecutivos se guardan DESPUÉS de los artículos.
    for (const a of articulosFlete) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ARTICULO (${COLUMNAS_ARTICULO.join(', ')})
         VALUES (${COLUMNAS_ARTICULO.map(() => '?').join(', ')})`,
        COLUMNAS_ARTICULO.map((col) => valorArticulo(a, col))
      );
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_consecutivos_at', ?)",
      [new Date().toISOString()]
    );
  };

  const resumen = {
    consecutivos: consecutivos.length,
    articulosFlete: articulosFlete.length,
    omitidos,
  };
  return { guardar, resumen };
}
