import { getDatabase } from '../db/database';

// Inventario del camión: existencia por artículo (suma de las bodegas descargadas).
// almacen = existencia; detalle = UND_EMP del artículo.
// incluirSinExistencia: si es false, solo artículos con existencia > 0.
export async function getInventario({ incluirSinExistencia = false } = {}) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT a.COD_ART AS codigo, a.DES_ART AS descripcion, MAX(a.UND_EMP) AS undEmp,
            MAX(a.COD_FAM) AS familia, MAX(a.COD_CLS) AS clase,
            COALESCE(e.EXISTENCIA, 0) AS existencia
       FROM ARTICULO a
       LEFT JOIN (SELECT ARTICULO, SUM(EXISTENCIA) AS EXISTENCIA
                    FROM ARTICULO_EXISTENCIA GROUP BY ARTICULO) e ON e.ARTICULO = a.COD_ART
      GROUP BY a.COD_ART, a.DES_ART
      ${incluirSinExistencia ? '' : 'HAVING COALESCE(e.EXISTENCIA, 0) > 0'}
      ORDER BY MIN(a.ORDEN_ART), a.DES_ART`
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

export async function contarArticulos() {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT COUNT(DISTINCT COD_ART) AS n FROM ARTICULO');
  return row?.n ?? 0;
}
