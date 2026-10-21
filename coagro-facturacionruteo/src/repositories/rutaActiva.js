import { getDatabase } from '../db/database';

const text = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

// Rutas de la handheld del último login/sesión (app_meta.mobile_sesion). [] si no hay.
async function getRutasSesion(db) {
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'mobile_sesion'");
  try {
    const rutas = JSON.parse(row?.value ?? 'null')?.rutas;
    return Array.isArray(rutas) ? rutas.filter((r) => text(r?.RUTA)) : [];
  } catch {
    return [];
  }
}

// Rutas de la handheld con su grupo de artículos y bodegas:
//   { codigo, descripcion, label, grupoArticulo, bodega, bodegaErp }
// bodega = código de ruteo (alias); bodegaErp = bodega real del ERP (la que se cruza con existencias).
// Salen de RUTA_ARTICULO_RT (Cargar datos); si aún no se cargaron, del último login/sesión.
export async function getRutasHandheld() {
  const db = await getDatabase();
  const sesion = await getRutasSesion(db);
  const descripcionSesion = new Map(sesion.map((r) => [text(r.RUTA), text(r.DESCRIPCION)]));

  let rows = await db.getAllAsync(
    `SELECT r.RUTA, r.GRUPO_ARTICULO, r.BODEGA, r.BODEGA_ERP, rt.DESCRIPCION
       FROM RUTA_ARTICULO_RT r
       LEFT JOIN RUTA_RT rt ON rt.RUTA = r.RUTA
      ORDER BY r.RUTA`
  );
  if (rows.length === 0) {
    rows = [...sesion].sort((a, b) => String(a.RUTA).localeCompare(String(b.RUTA)));
  }

  return rows.map((r) => {
    const codigo = text(r.RUTA);
    const descripcion = text(r.DESCRIPCION) ?? descripcionSesion.get(codigo) ?? null;
    return {
      codigo,
      descripcion,
      label: descripcion ? `${codigo} - ${descripcion}` : codigo,
      grupoArticulo: text(r.GRUPO_ARTICULO),
      bodega: text(r.BODEGA),
      bodegaErp: text(r.BODEGA_ERP),
    };
  });
}

// Ruta con la que trabaja el vendedor (una a la vez). Si la handheld tiene una sola ruta, es esa.
// null si hay varias y aún no se eligió, o si no hay rutas en el equipo.
// Los documentos que se generen (pedidos, facturas) deben llevar codigo y bodegaErp de esta ruta.
export async function getRutaActiva(rutas) {
  const lista = rutas ?? (await getRutasHandheld());
  if (lista.length === 1) return lista[0];
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'ruta_activa'");
  return lista.find((r) => r.codigo === row?.value) ?? null;
}

export async function setRutaActiva(codigo) {
  const db = await getDatabase();
  await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('ruta_activa', ?)", [codigo]);
}
