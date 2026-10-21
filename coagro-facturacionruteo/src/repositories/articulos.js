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
