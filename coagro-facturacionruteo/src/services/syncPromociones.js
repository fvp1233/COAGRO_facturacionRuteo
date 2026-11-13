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
const entero = (v) => {
  const n = num(v);
  return Number.isInteger(n) ? n : null;
};
// Fechas de vigencia como 'YYYY-MM-DD' (si llega datetime '2026-11-01T00:00:00' se recorta).
const fecha = (v) => {
  const t = textOr(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
// ACTIVA (bit de SQL Server) -> 1 / 0. Acepta true/false, 1/0 y 'S'/'N'.
const activa = (v) => {
  if (v === null || v === undefined || v === '') return 1;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const t = String(v).trim().toUpperCase();
  return ['0', 'N', 'FALSE', 'NO'].includes(t) ? 0 : 1;
};

// Lista de la respuesta: { result: { <clave>: [...] } }. Se aceptan los nombres probables de la clave
// (o result como arreglo) para no depender del nombre exacto que use el backend.
function lista(json, claves, nombre) {
  const data = json?.result;
  if (Array.isArray(data)) return data;
  for (const k of claves) if (Array.isArray(data?.[k])) return data[k];
  const arreglos = data && typeof data === 'object' ? Object.values(data).filter(Array.isArray) : [];
  if (arreglos.length === 1) return arreglos[0];
  throw new ApiError(`La respuesta del servidor no tiene el formato esperado (${nombre}).`);
}

const insertar = (tabla, columnas) =>
  `INSERT OR REPLACE INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`;

const COL_PROMO = [
  'ID', 'TITULO', 'DESCRIPCION', 'TIPO', 'FECHA_INICIO', 'FECHA_FIN', 'DESTINO', 'ARTICULO_BONIFICADO',
  'CANTIDAD_BONIFICADA', 'ACTIVA', 'CREADO_POR', 'FECHA_CREACION', 'MODIFICADO_POR', 'FECHA_MODIFICACION',
];
const COL_DESTINO = ['PROMOCION_ID', 'TIPO', 'VALOR'];
const COL_PRODUCTO = ['ID', 'PROMOCION_ID', 'ALCANCE', 'VALOR', 'CANTIDAD_MIN', 'DESCUENTO', 'PRECIO_ESPECIAL'];

// Descarga las promociones de la web: encabezados (FR_PROMOCION), productos (FR_PROMOCION_PRODUCTO) y
// destinos (FR_PROMOCION_DESTINO). Solo descarga y valida: no toca la base. Devuelve
// { guardar(db), resumen }; DatosScreen llama guardar dentro de UNA transacción con el resto de la
// carga, que reemplaza las tres tablas completas. Productos y destinos se unen por PROMOCION_ID: los
// que no tienen su promoción se descartan (se cuentan como omitidos).
export async function descargarPromociones() {
  const promosJson = await getJson(PATHS.syncPromociones);
  const productosJson = await getJson(PATHS.syncPromocionesProductos);
  const destinosJson = await getJson(PATHS.syncPromocionesDestinos);

  const promosRaw = lista(promosJson, ['promociones'], 'promociones');
  const productosRaw = lista(productosJson, ['productos', 'promocionesProductos', 'promociones'], 'productos de promociones');
  const destinosRaw = lista(destinosJson, ['destinos', 'promocionesDestinos', 'promociones'], 'destinos de promociones');

  const esFila = (f) => f && typeof f === 'object';
  const promos = promosRaw.filter((p) => esFila(p) && entero(p.ID) != null);
  const ids = new Set(promos.map((p) => entero(p.ID)));
  const productos = productosRaw.filter(
    (p) =>
      esFila(p) &&
      entero(p.ID) != null &&
      ids.has(entero(p.PROMOCION_ID)) &&
      textOr(p.ALCANCE) !== '' &&
      textOr(p.VALOR) !== ''
  );
  const destinos = destinosRaw.filter(
    (d) => esFila(d) && ids.has(entero(d.PROMOCION_ID)) && textOr(d.TIPO) !== ''
  );
  const omitidos =
    promosRaw.length - promos.length +
    (productosRaw.length - productos.length) +
    (destinosRaw.length - destinos.length);

  const guardar = async (db) => {
    await db.execAsync(`
      DELETE FROM FR_PROMOCION_PRODUCTO;
      DELETE FROM FR_PROMOCION_DESTINO;
      DELETE FROM FR_PROMOCION;
    `);

    const sqlPromo = await db.prepareAsync(insertar('FR_PROMOCION', COL_PROMO));
    try {
      for (const p of promos) {
        await sqlPromo.executeAsync([
          entero(p.ID),
          text(p.TITULO),
          text(p.DESCRIPCION),
          text(p.TIPO),
          fecha(p.FECHA_INICIO),
          fecha(p.FECHA_FIN),
          text(p.DESTINO),
          text(p.ARTICULO_BONIFICADO),
          num(p.CANTIDAD_BONIFICADA),
          activa(p.ACTIVA),
          text(p.CREADO_POR),
          text(p.FECHA_CREACION),
          text(p.MODIFICADO_POR),
          text(p.FECHA_MODIFICACION),
        ]);
      }
    } finally {
      await sqlPromo.finalizeAsync();
    }

    const sqlProducto = await db.prepareAsync(insertar('FR_PROMOCION_PRODUCTO', COL_PRODUCTO));
    try {
      for (const p of productos) {
        await sqlProducto.executeAsync([
          entero(p.ID),
          entero(p.PROMOCION_ID),
          textOr(p.ALCANCE).toUpperCase(),
          textOr(p.VALOR),
          num(p.CANTIDAD_MIN),
          num(p.DESCUENTO),
          num(p.PRECIO_ESPECIAL),
        ]);
      }
    } finally {
      await sqlProducto.finalizeAsync();
    }

    const sqlDestino = await db.prepareAsync(insertar('FR_PROMOCION_DESTINO', COL_DESTINO));
    try {
      for (const d of destinos) {
        await sqlDestino.executeAsync([entero(d.PROMOCION_ID), textOr(d.TIPO), textOr(d.VALOR)]);
      }
    } finally {
      await sqlDestino.finalizeAsync();
    }

    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_promociones_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return {
    guardar,
    resumen: { promociones: promos.length, productos: productos.length, destinos: destinos.length, omitidos },
  };
}
