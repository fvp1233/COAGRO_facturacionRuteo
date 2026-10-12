import { getDatabase } from '../db/database';

// Rutas disponibles en el equipo. Si aún no hay catálogo (RUTA_RT), se deducen de los clientes.
export async function getRutas() {
  const db = await getDatabase();
  let rows = await db.getAllAsync('SELECT RUTA, DESCRIPCION FROM RUTA_RT ORDER BY RUTA');
  if (rows.length === 0) {
    rows = await db.getAllAsync('SELECT DISTINCT COD_ZON AS RUTA, NULL AS DESCRIPCION FROM CLIENTE ORDER BY COD_ZON');
  }
  return rows.map((r) => ({
    codigo: r.RUTA,
    label: r.DESCRIPCION ? `${r.RUTA} - ${r.DESCRIPCION}` : r.RUTA,
  }));
}

// Clientes de una ruta. dia: 1 = Lunes ... 7 = Domingo, o null/undefined para TODOS los días
// (cada cliente aparece una sola vez). estado: 'Visitados' | 'No visitados' | 'Todos'
// (según VISITA de hoy).
export async function getClientesRuta({ ruta, dia = null, estado = 'Todos' }) {
  const db = await getDatabase();

  const visitaHoy = `EXISTS (
      SELECT 1 FROM VISITA v
       WHERE v.CLIENTE = c.COD_CLT
         AND v.RUTA = c.COD_ZON
         AND date(v.INICIO) = date('now', 'localtime'))`;
  let filtroEstado = '';
  if (estado === 'Visitados') filtroEstado = `AND ${visitaHoy}`;
  if (estado === 'No visitados') filtroEstado = `AND NOT ${visitaHoy}`;

  const params = [ruta];
  let filtroDia = '';
  if (dia !== null && dia !== undefined) {
    filtroDia = 'AND o.DIA = ?';
    params.push(String(dia));
  }

  const rows = await db.getAllAsync(
    `SELECT c.COD_CLT AS codigo, c.NOM_CLT AS nombre, c.DIR_CLT AS direccion,
            MIN(o.ORDEN) AS orden
       FROM CLIENTE c
       JOIN alFAC_RUTA_ORDEN o ON o.COD_CLT = c.COD_CLT AND o.COD_ZON = c.COD_ZON
      WHERE c.COD_ZON = ?
      ${filtroDia}
      ${filtroEstado}
      GROUP BY c.COD_CLT, c.NOM_CLT, c.DIR_CLT
      ORDER BY MIN(o.DIA), MIN(o.ORDEN)`,
    params
  );

  // El RNC aún no viene del servidor (no existe en el endpoint); la tabla lo muestra si aparece.
  return rows.map((r) => ({ ...r, rnc: null }));
}

export async function getUltimaSincronizacion() {
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_clientes_at'");
  return row?.value ?? null;
}

export async function contarClientes() {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS n FROM CLIENTE');
  return row?.n ?? 0;
}

// Coordenadas guardadas de un cliente en una ruta (tabla CLIENTE_UBICACION). null si no hay.
export async function getUbicacionCliente(ruta, cliente) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT LATITUD, LONGITUD, ALTITUD FROM CLIENTE_UBICACION WHERE RUTA = ? AND CLIENTE = ?',
    [ruta, cliente]
  );
  if (!row || row.LATITUD == null || row.LONGITUD == null) return null;
  return { latitud: row.LATITUD, longitud: row.LONGITUD, altitud: row.ALTITUD };
}

export async function guardarUbicacionCliente(ruta, cliente, { latitud, longitud, altitud = null }) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO CLIENTE_UBICACION (RUTA, CLIENTE, LATITUD, LONGITUD, ALTITUD)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (RUTA, CLIENTE) DO UPDATE SET
       LATITUD = excluded.LATITUD, LONGITUD = excluded.LONGITUD, ALTITUD = excluded.ALTITUD`,
    [ruta, cliente, latitud, longitud, altitud]
  );
}
