import { getDatabase } from '../db/database';

// Inventario del camión para la ruta activa: solo los artículos de su grupo (GRP_ART) con la
// existencia de SU bodega del ERP (BODEGA_ERP). Nunca se suman existencias de varias bodegas.
// almacen = existencia; detalle = UND_EMP del artículo.
// incluirSinExistencia: si es false, solo artículos con existencia > 0.
export async function getInventario(ruta, { incluirSinExistencia = false } = {}) {
  if (!ruta?.grupoArticulo) return [];
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT a.COD_ART AS codigo, a.DES_ART AS descripcion, a.UND_EMP AS undEmp,
            a.COD_FAM AS familia, a.COD_CLS AS clase,
            COALESCE(e.EXISTENCIA, 0) AS existencia
       FROM ARTICULO a
       LEFT JOIN ARTICULO_EXISTENCIA e ON e.ARTICULO = a.COD_ART AND e.BODEGA = ?
      WHERE a.GRP_ART = ?
      ${incluirSinExistencia ? '' : 'AND COALESCE(e.EXISTENCIA, 0) > 0'}
      ORDER BY a.ORDEN_ART, a.DES_ART`,
    [ruta.bodegaErp, ruta.grupoArticulo]
  );

  return rows.map((r) => ({
    codigo: r.codigo,
    descripcion: r.descripcion,
    familia: r.familia ?? '',
    clase: r.clase ?? '',
    almacen: r.existencia,
    detalle: r.undEmp ?? 0,
  }));
}

// Artículos que se pueden vender en un pedido: los de la ruta (grupo y bodega del ERP, como
// getInventario) que tienen precio vigente hoy en `nivelPrecio`. Si el artículo tiene precio en
// varias monedas se prefiere `moneda` (la del cliente); si no, la que haya. Entre versiones
// vigentes gana la de inicio más reciente. Fechas vacías = sin límite.
// Devuelve { articulos, aviso }: aviso explica una lista vacía (o null).
export async function getArticulosPedido(ruta, nivelPrecio, moneda) {
  const avisoRuta = await getAvisoInventario(ruta);
  if (!ruta?.grupoArticulo) return { articulos: [], aviso: avisoRuta };
  if (!nivelPrecio) return { articulos: [], aviso: 'El cliente no tiene lista de precios asignada.' };

  const db = await getDatabase();
  const nivel = await db.getFirstAsync('SELECT COUNT(*) AS n FROM ARTICULO_PRECIO WHERE NIVEL_PRECIO = ?', [
    nivelPrecio,
  ]);
  if (!nivel?.n) {
    return {
      articulos: [],
      aviso: `La lista de precios ${nivelPrecio} no tiene precios cargados. Descarga los datos en Datos > Cargar datos.`,
    };
  }

  const rows = await db.getAllAsync(
    `WITH vigentes AS (
       SELECT ARTICULO, MONEDA, PRECIO,
              ROW_NUMBER() OVER (
                PARTITION BY ARTICULO
                ORDER BY (MONEDA = ?) DESC, FECHA_INICIO_VERSION_ARTICULO DESC
              ) AS rn
         FROM ARTICULO_PRECIO
        WHERE NIVEL_PRECIO = ?
          AND (FECHA_INICIO_VERSION_ARTICULO = '' OR substr(FECHA_INICIO_VERSION_ARTICULO, 1, 10) <= date('now', 'localtime'))
          AND (FECHA_FINAL_VERSION_ARTICULO = '' OR substr(FECHA_FINAL_VERSION_ARTICULO, 1, 10) >= date('now', 'localtime'))
     )
     SELECT a.COD_ART AS codigo, a.DES_ART AS descripcion, a.UND_EMP AS undEmp,
            a.FACTOR_VENTA AS factorVenta, a.EMP_ALM AS empAlm, a.EMP_DET AS empDet,
            a.COD_FAM AS familia, a.CANASTA_BASICA AS canastaBasica, a.ES_OTRO_CARGO AS esOtroCargo,
            COALESCE(e.EXISTENCIA, 0) AS existencia, p.PRECIO AS precio, p.MONEDA AS moneda,
            COALESCE(i.IMPUESTO1, 0) AS impuesto1, COALESCE(i.IMPUESTO2, 0) AS impuesto2
       FROM ARTICULO a
       JOIN vigentes p ON p.ARTICULO = a.COD_ART AND p.rn = 1
       LEFT JOIN ARTICULO_EXISTENCIA e ON e.ARTICULO = a.COD_ART AND e.BODEGA = ?
       LEFT JOIN IMPUESTO i ON i.IMPUESTO = a.IMPUESTO
      WHERE a.GRP_ART = ?
      ORDER BY a.ORDEN_ART, a.DES_ART`,
    [moneda ?? '', nivelPrecio, ruta.bodegaErp, ruta.grupoArticulo]
  );

  const articulos = rows.map((r) => ({
    codigo: r.codigo,
    descripcion: r.descripcion,
    familia: r.familia ?? '',
    // ARTICULO_EXISTENCIA.EXISTENCIA en la bodega del ERP de la ruta (0 si no tiene fila).
    existencia: r.existencia,
    detalle: r.undEmp ?? 0,
    // Unidades de detalle por unidad de almacén (ej. 200 litros por barril); 1 = no se fracciona.
    factorVenta: r.factorVenta > 0 ? r.factorVenta : 1,
    // Nombres de las unidades de almacén y de detalle (ej. "BARRIL" / "LT").
    empAlm: String(r.empAlm ?? '').trim(),
    empDet: String(r.empDet ?? '').trim(),
    canastaBasica: String(r.canastaBasica ?? '').trim().toUpperCase() === 'S',
    esOtroCargo: r.esOtroCargo ?? null,
    precio: r.precio,
    moneda: r.moneda,
    // % de impuestos (IMPUESTO1 = ventas, IMPUESTO2 = consumo) del código ARTICULO.IMPUESTO;
    // 0 si la tabla IMPUESTO no se ha descargado.
    impuesto1: r.impuesto1,
    impuesto2: r.impuesto2,
  }));
  const aviso =
    avisoRuta ??
    (articulos.length ? null : `Ningún artículo de la ruta tiene precio vigente en la lista ${nivelPrecio}.`);
  return { articulos, aviso };
}

// Aviso para mostrar en lugar de un inventario vacío o en cero sin explicación. null si todo está bien.
export async function getAvisoInventario(ruta) {
  if (!ruta) return 'No hay una ruta activa. Elige con qué ruta trabajas en la pantalla de inicio.';
  const contacto = 'contacta al administrador.';
  if (!ruta.bodegaErp) return `La ruta ${ruta.codigo} no tiene bodega configurada, ${contacto}`;

  const db = await getDatabase();
  // Si aún no se descargaron artículos, no hay nada que avisar sobre la ruta.
  const total = await db.getFirstAsync('SELECT COUNT(*) AS n FROM ARTICULO');
  if (!total?.n) return null;

  const articulos = await db.getFirstAsync('SELECT COUNT(*) AS n FROM ARTICULO WHERE GRP_ART = ?', [
    ruta.grupoArticulo,
  ]);
  if (!articulos?.n) {
    return `La ruta ${ruta.codigo} no tiene artículos configurados (grupo ${ruta.grupoArticulo ?? 'sin grupo'}), ${contacto}`;
  }
  const existencias = await db.getFirstAsync('SELECT COUNT(*) AS n FROM ARTICULO_EXISTENCIA WHERE BODEGA = ?', [
    ruta.bodegaErp,
  ]);
  if (!existencias?.n) {
    return `La ruta ${ruta.codigo} no tiene existencias configuradas en la bodega ${ruta.bodegaErp}, ${contacto}`;
  }
  return null;
}

export async function contarArticulos() {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT COUNT(DISTINCT COD_ART) AS n FROM ARTICULO');
  return row?.n ?? 0;
}
