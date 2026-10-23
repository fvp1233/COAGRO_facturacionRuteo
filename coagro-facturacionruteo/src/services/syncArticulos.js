import { getJson, ApiError } from './api';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Descarga rutas (grupo y bodegas), artículos, existencias, precios e impuestos y los guarda en SQLite en UNA transacción:
// o se guarda todo o no se toca nada. Devuelve un resumen con los conteos.
export async function syncArticulos() {
  const json = await getJson(PATHS.syncArticulos);
  const data = json?.result;
  if (!data || !Array.isArray(data.articulos) || !Array.isArray(data.existencias)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (articulos / existencias).');
  }
  // Se descartan filas sin sus campos clave (no se guardan códigos vacíos) y se informa cuántas.
  const conClaves = (lista, claves) =>
    lista.filter((fila) => fila && typeof fila === 'object' && claves.every((k) => textOr(fila[k]) !== ''));
  const articulos = conClaves(data.articulos, ['COD_ART', 'GRP_ART']);
  // existencias.BODEGA es la bodega del ERP: se cruza con RUTA_ARTICULO_RT.BODEGA_ERP.
  const existencias = conClaves(data.existencias, ['ARTICULO', 'BODEGA']);
  // Rutas de la handheld (grupo de artículos y bodegas). Si el servidor no las manda, no se tocan.
  const traeRutas = Array.isArray(data.rutas);
  const rutas = traeRutas ? conClaves(data.rutas, ['RUTA']) : [];
  // Precios de erpadmin.ARTICULO_PRECIO (todos los niveles). Si el servidor no los manda, no se tocan.
  // Se cruzan con el artículo por ARTICULO = COD_ART y NIVEL_PRECIO; nunca por COMPANIA.
  const traePrecios = Array.isArray(data.precios);
  const precios = traePrecios
    ? conClaves(data.precios, ['ARTICULO', 'NIVEL_PRECIO', 'MONEDA', 'VERSION', 'VERSION_ARTICULO'])
    : [];
  // Impuestos de erpadmin.IMPUESTO (se cruzan por ARTICULO.IMPUESTO). Si no vienen, no se tocan.
  const traeImpuestos = Array.isArray(data.impuestos);
  const impuestos = traeImpuestos ? conClaves(data.impuestos, ['IMPUESTO']) : [];
  const omitidos =
    data.articulos.length - articulos.length + data.existencias.length - existencias.length +
    (traeRutas ? data.rutas.length - rutas.length : 0) +
    (traePrecios ? data.precios.length - precios.length : 0) +
    (traeImpuestos ? data.impuestos.length - impuestos.length : 0);

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Los maestros se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM ARTICULO');
    await db.runAsync('DELETE FROM ARTICULO_EXISTENCIA');
    if (traeRutas) {
      await db.runAsync('DELETE FROM RUTA_ARTICULO_RT');
      for (const r of rutas) {
        await db.runAsync(
          'INSERT OR REPLACE INTO RUTA_ARTICULO_RT (RUTA, GRUPO_ARTICULO, BODEGA, BODEGA_ERP) VALUES (?, ?, ?, ?)',
          [textOr(r.RUTA), text(r.GRUPO_ARTICULO), text(r.BODEGA), text(r.BODEGA_ERP) || null]
        );
      }
      // Si la ruta activa ya no está asignada a la handheld, se quita (habrá que elegir otra).
      await db.runAsync(
        `DELETE FROM app_meta
          WHERE key = 'ruta_activa'
            AND value NOT IN (SELECT RUTA FROM RUTA_ARTICULO_RT)`
      );
    }

    for (const a of articulos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ARTICULO
           (GRP_ART, COD_ART, COD_CIA, UND_EMP, EMP_ALM, EMP_DET, COD_BAR, DES_ART,
            COD_FAM, COD_CLS, IMPUESTO, USA_LOTES, COSTO_LOCAL, COSTO_DOLAR, FACTOR_PRECIO, ORDEN_ART,
            FACTOR_VENTA, ARTICULO_ENVASE, TIPO, CODIGO_RETENCION, RETENCION_VENTA, RETENCION_COMPRA,
            MODELO_RETENCION, CLASIFICACION3, CLASIFICACION4, CLASIFICACION5, CLASIFICACION6,
            TIPO_DOC_IVA, NIT, CANASTA_BASICA, ES_OTRO_CARGO, TIPO_VENTA)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          textOr(a.GRP_ART),
          textOr(a.COD_ART),
          text(a.COD_CIA),
          num(a.UND_EMP) ?? 1,
          text(a.EMP_ALM),
          text(a.EMP_DET),
          text(a.COD_BAR),
          textOr(a.DES_ART),
          text(a.COD_FAM),
          text(a.COD_CLS),
          textOr(a.IMPUESTO),
          textOr(a.USA_LOTES, 'N'),
          num(a.COSTO_LOCAL) ?? 0,
          num(a.COSTO_DOLAR) ?? 0,
          num(a.FACTOR_PRECIO) ?? 0,
          text(a.ORDEN_ART),
          num(a.FACTOR_VENTA) ?? 1,
          text(a.ARTICULO_ENVASE),
          text(a.TIPO),
          text(a.CODIGO_RETENCION),
          text(a.RETENCION_VENTA),
          text(a.RETENCION_COMPRA),
          text(a.MODELO_RETENCION),
          text(a.CLASIFICACION3),
          text(a.CLASIFICACION4),
          text(a.CLASIFICACION5),
          text(a.CLASIFICACION6),
          text(a.TIPO_DOC_IVA),
          text(a.NIT),
          text(a.CANASTA_BASICA),
          text(a.ES_OTRO_CARGO),
          text(a.TIPO_VENTA),
        ]
      );
    }

    // INICIAL = existencia al momento de la carga (base para la liquidación de inventario).
    for (const e of existencias) {
      const existencia = num(e.EXISTENCIA) ?? 0;
      await db.runAsync(
        'INSERT OR REPLACE INTO ARTICULO_EXISTENCIA (ARTICULO, COMPANIA, BODEGA, EXISTENCIA, INICIAL) VALUES (?, ?, ?, ?, ?)',
        [textOr(e.ARTICULO), text(e.COMPANIA), textOr(e.BODEGA), existencia, existencia]
      );
    }

    if (traePrecios) {
      await db.runAsync('DELETE FROM ARTICULO_PRECIO');
      for (const p of precios) {
        await db.runAsync(
          `INSERT OR REPLACE INTO ARTICULO_PRECIO
             (ARTICULO, COMPANIA, NIVEL_PRECIO, MONEDA, PRECIO, MARGEN_UTILIDAD, VERSION, VERSION_ARTICULO,
              FECHA_INICIO_VERSION_ARTICULO, FECHA_FINAL_VERSION_ARTICULO)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            textOr(p.ARTICULO),
            text(p.COMPANIA),
            textOr(p.NIVEL_PRECIO),
            textOr(p.MONEDA),
            num(p.PRECIO) ?? 0,
            num(p.MARGEN_UTILIDAD) ?? 0,
            textOr(p.VERSION),
            textOr(p.VERSION_ARTICULO),
            // Vacío = sin límite de vigencia (ver getArticulosPedido).
            textOr(p.FECHA_INICIO_VERSION_ARTICULO),
            textOr(p.FECHA_FINAL_VERSION_ARTICULO),
          ]
        );
      }
    }

    if (traeImpuestos) {
      await db.runAsync('DELETE FROM IMPUESTO');
      for (const i of impuestos) {
        await db.runAsync(
          `INSERT OR REPLACE INTO IMPUESTO
             (COMPANIA, IMPUESTO, IMPUESTO1, IMPUESTO2, TIPO_TARIFA1, TIPO_TARIFA2, TIPO_IMPUESTO1,
              TIPO_IMPUESTO2, USA_IMPUESTO2_CANTIDAD, IMPUESTO2_CANTIDAD)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            text(i.COMPANIA),
            textOr(i.IMPUESTO),
            num(i.IMPUESTO1) ?? 0,
            num(i.IMPUESTO2) ?? 0,
            text(i.TIPO_TARIFA1),
            text(i.TIPO_TARIFA2),
            text(i.TIPO_IMPUESTO1),
            text(i.TIPO_IMPUESTO2),
            text(i.USA_IMPUESTO2_CANTIDAD),
            num(i.IMPUESTO2_CANTIDAD) ?? 0,
          ]
        );
      }
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_articulos_at', ?)",
      [new Date().toISOString()]
    );
  });

  return {
    rutas: rutas.length,
    articulos: articulos.length,
    existencias: existencias.length,
    precios: precios.length,
    omitidos,
  };
}
