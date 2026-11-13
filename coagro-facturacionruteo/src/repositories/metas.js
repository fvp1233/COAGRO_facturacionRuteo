import { getDatabase } from '../db/database';

// Estados de pedido del ERP (HISTORIAL_PED_ENC.EST_PED / HISTORIAL_PED_DET.EST_LN) que se toman
// como anulados y no suman a lo vendido. Ajustar si el ERP usa otros códigos.
const ESTADOS_PEDIDO_ANULADO = ['C'];

// Bonificaciones: EST_BON 'B' en el historial (igual que en las consultas de historial) y ART_BON
// distinto de '0' en los pedidos del equipo.
const BONIFICACION = ['B'];
const ART_BON_NORMAL = ['0', 'N', ''];

const lista = (valores) => valores.map((v) => `'${v}'`).join(', ');

// Agentes (alias de ruteo) y vendedores del ERP de la última sincronización de metas (app_meta).
async function leerAgentesSync(db) {
  const filas = await db.getAllAsync(
    "SELECT key, value FROM app_meta WHERE key IN ('sync_metas_agentes', 'sync_metas_vendedores')"
  );
  const leer = (key) => {
    try {
      const v = JSON.parse(filas.find((f) => f.key === key)?.value ?? '[]');
      return Array.isArray(v) ? v.map((c) => String(c ?? '').trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  return { agentes: leer('sync_metas_agentes'), vendedores: leer('sync_metas_vendedores') };
}

export const ESTADOS_META = {
  cumplida: 'cumplida',
  minimo: 'minimo',
  pendiente: 'pendiente',
};

// Periodos con metas guardadas en el equipo, del más reciente al más viejo: [{ anio, mes }].
export async function getPeriodosMetas() {
  const db = await getDatabase();
  const filas = await db.getAllAsync('SELECT DISTINCT ANIO, MES FROM META_VENTA ORDER BY ANIO DESC, MES DESC');
  return filas.map((r) => ({ anio: r.ANIO, mes: r.MES }));
}

// Fecha (ISO) de la última sincronización de metas; null si nunca se descargaron.
export async function getUltimaSyncMetas() {
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_metas_at'");
  return row?.value ?? null;
}

// Unidades vendidas por artículo en el mes (prefijo 'YYYY-MM' de la fecha del documento), con lo que
// ya está en la base local. Map COD_ART -> unidades. No cuenta bonificaciones ni anulados.
//   1. Facturas del historial (HISTORIAL_FAC_*): CANT_FAC - CANT_DEV. Si la factura trae AGENTE,
//      solo las de este vendedor (las rutas pueden tener facturas de otro). AGENTE puede venir como
//      alias de ruteo o como código del ERP: se aceptan los dos (codigos = agentes + vendedores).
//   2. Pedidos del ERP (HISTORIAL_PED_*): solo líneas aún no facturadas (las facturadas ya están en 1).
//   3. Pedidos del equipo (alFAC_*_PED, TIP_DOC 'F'): los que todavía no aparecen en el historial
//      del ERP. Cantidad en unidades de almacén: CNT_MAX + CNT_MIN / FACTOR_VENTA.
async function getVendidoMes(db, anio, mes, codigos) {
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  const filtroAgente = codigos.length
    ? `AND (e.AGENTE IS NULL OR TRIM(e.AGENTE) = '' OR TRIM(e.AGENTE) IN (${codigos.map(() => '?').join(', ')}))`
    : '';

  const [facturas, pedidosErp, pedidosEquipo] = await Promise.all([
    db.getAllAsync(
      `SELECT d.COD_ART, SUM(COALESCE(d.CANT_FAC, 0) - COALESCE(d.CANT_DEV, 0)) AS UNIDADES
         FROM HISTORIAL_FAC_DET d
         JOIN HISTORIAL_FAC_ENC e ON e.COD_CIA = d.COD_CIA AND e.NUM_FAC = d.NUM_FAC
        WHERE e.ANULADA = 0
          AND COALESCE(d.EST_BON, '') NOT IN (${lista(BONIFICACION)})
          AND substr(e.FEC_FAC, 1, 7) = ?
          ${filtroAgente}
        GROUP BY d.COD_ART`,
      [prefijo, ...codigos]
    ),
    db.getAllAsync(
      `SELECT d.COD_ART, SUM(COALESCE(d.CANTIDAD, 0)) AS UNIDADES
         FROM HISTORIAL_PED_DET d
         JOIN HISTORIAL_PED_ENC e ON e.COD_CIA = d.COD_CIA AND e.NUM_PED = d.NUM_PED
        WHERE d.FACTURADA = 0
          AND COALESCE(d.EST_BON, '') NOT IN (${lista(BONIFICACION)})
          AND COALESCE(e.EST_PED, '') NOT IN (${lista(ESTADOS_PEDIDO_ANULADO)})
          AND COALESCE(d.EST_LN, '') NOT IN (${lista(ESTADOS_PEDIDO_ANULADO)})
          AND substr(e.FEC_PED, 1, 7) = ?
        GROUP BY d.COD_ART`,
      [prefijo]
    ),
    db.getAllAsync(
      `SELECT d.COD_ART,
              SUM(COALESCE(d.CNT_MAX, 0) + COALESCE(d.CNT_MIN, 0) /
                  COALESCE((SELECT CASE WHEN a.FACTOR_VENTA > 0 THEN a.FACTOR_VENTA END
                              FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1), 1)) AS UNIDADES
         FROM alFAC_ENC_PED e
         JOIN alFAC_DET_PED d ON d.NUM_PED = e.NUM_PED AND COALESCE(d.COD_CIA, '') = COALESCE(e.COD_CIA, '')
        WHERE e.TIP_DOC = 'F'
          AND COALESCE(TRIM(d.ART_BON), '0') IN (${lista(ART_BON_NORMAL)})
          AND substr(e.FEC_PED, 1, 7) = ?
          AND NOT EXISTS (SELECT 1 FROM HISTORIAL_PED_ENC h
                           WHERE h.NUM_PED = e.NUM_PED AND h.COD_CIA = COALESCE(e.COD_CIA, ''))
        GROUP BY d.COD_ART`,
      [prefijo]
    ),
  ]);

  const vendido = new Map();
  for (const r of [...facturas, ...pedidosErp, ...pedidosEquipo]) {
    const codigo = String(r.COD_ART ?? '').trim();
    if (!codigo) continue;
    vendido.set(codigo, (vendido.get(codigo) ?? 0) + (Number(r.UNIDADES) || 0));
  }
  return vendido;
}

// Estado de una meta: vendido >= meta -> cumplida; vendido >= mínimo -> mínimo alcanzado; si no, pendiente.
export function estadoMeta(vendido, meta, minimo) {
  if (vendido >= meta) return ESTADOS_META.cumplida;
  if (vendido >= minimo) return ESTADOS_META.minimo;
  return ESTADOS_META.pendiente;
}

// Metas del periodo (anio + mes) con su avance. Lo vendido: VENTA_UNIDADES si el servidor lo manda;
// si llega null (hoy siempre), el cálculo local de getVendidoMes.
// Devuelve [{ id, codigo, descripcion, vendedor, codLinea, linea, codLider, lider, codProveedor,
//   proveedor, meta, minimo, incentivo, vendido, avance (null si meta = 0), estado,
//   incentivoEstimado (null si incentivo = 0) }], ordenadas por línea, proveedor y artículo.
export async function getMetasPeriodo(anio, mes) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT ID_META, VENDEDOR, COD_LINEA, LINEA, COD_LIDER, LIDER, COD_ART, DES_ART, COD_PROVEEDOR, PROVEEDOR,
            META_UNIDADES, MINIMO, INCENTIVO, VENTA_UNIDADES
       FROM META_VENTA
      WHERE ANIO = ? AND MES = ?
      ORDER BY COALESCE(LINEA, COD_LINEA, ''), COALESCE(PROVEEDOR, COD_PROVEEDOR, ''), COD_ART`,
    [anio, mes]
  );
  if (!filas.length) return [];

  // Las metas no se filtran por agente (el backend ya manda solo las de este vendedor); los códigos
  // solo sirven para quedarse con las facturas propias al calcular lo vendido.
  const { agentes, vendedores } = await leerAgentesSync(db);
  const codigos = [...new Set([...agentes, ...vendedores, ...filas.map((r) => r.VENDEDOR).filter(Boolean)])];
  const vendidoLocal = await getVendidoMes(db, anio, mes, codigos);

  return filas.map((r) => {
    const meta = Number(r.META_UNIDADES) || 0;
    const minimo = Number(r.MINIMO) || 0;
    const incentivo = Number(r.INCENTIVO) || 0;
    const vendido = r.VENTA_UNIDADES != null ? Number(r.VENTA_UNIDADES) : vendidoLocal.get(r.COD_ART) ?? 0;
    return {
      id: r.ID_META,
      codigo: r.COD_ART,
      descripcion: r.DES_ART ?? '',
      vendedor: r.VENDEDOR,
      codLinea: r.COD_LINEA ?? '',
      linea: r.LINEA || r.COD_LINEA || 'Sin línea',
      codLider: r.COD_LIDER ?? '',
      lider: r.LIDER ?? '',
      codProveedor: r.COD_PROVEEDOR ?? '',
      proveedor: r.PROVEEDOR || r.COD_PROVEEDOR || 'Sin proveedor',
      meta,
      minimo,
      incentivo,
      vendido,
      avance: meta > 0 ? (vendido / meta) * 100 : null,
      estado: estadoMeta(vendido, meta, minimo),
      incentivoEstimado: incentivo > 0 ? vendido * incentivo : null,
    };
  });
}

// Totales de una lista de metas: { meta, vendido, avance (null si meta = 0), cumplidas, minimos,
//   articulos, incentivo (estimado: Σ vendido × INCENTIVO), incentivoMeta (si se cumplen todas:
//   Σ meta × INCENTIVO), conIncentivo (artículos con INCENTIVO > 0) }.
export function totalesMetas(metas) {
  const meta = metas.reduce((s, m) => s + m.meta, 0);
  const vendido = metas.reduce((s, m) => s + m.vendido, 0);
  const conIncentivo = metas.filter((m) => m.incentivo > 0);
  return {
    meta,
    vendido,
    avance: meta > 0 ? (vendido / meta) * 100 : null,
    cumplidas: metas.filter((m) => m.estado === ESTADOS_META.cumplida).length,
    minimos: metas.filter((m) => m.estado === ESTADOS_META.minimo).length,
    articulos: metas.length,
    incentivo: conIncentivo.reduce((s, m) => s + (m.incentivoEstimado ?? 0), 0),
    incentivoMeta: conIncentivo.reduce((s, m) => s + m.meta * m.incentivo, 0),
    conIncentivo: conIncentivo.length,
  };
}

// Trofeos ya celebrados (animación de meta cumplida) por periodo, en app_meta
// 'metas_celebradas:YYYY-MM': COD_ART de las metas cumplidas y '*' para la meta global del mes.
// Así la animación sale una sola vez por meta, la primera vez que se ve cumplida. Si después deja de
// estar cumplida (p. ej. en la web corrigen la meta y Cargar datos la reemplaza) se le quita la marca
// con desmarcarCelebradas y la animación vuelve a salir cuando se cumpla otra vez.
const llaveCelebradas = (anio, mes) => `metas_celebradas:${anio}-${String(mes).padStart(2, '0')}`;
export const META_GLOBAL = '*';

export async function getCelebradas(anio, mes) {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT value FROM app_meta WHERE key = ?', [llaveCelebradas(anio, mes)]);
  try {
    const lista = JSON.parse(row?.value ?? '[]');
    return new Set(Array.isArray(lista) ? lista.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function desmarcarCelebradas(anio, mes, codigos) {
  if (!codigos.length) return;
  const db = await getDatabase();
  const todas = await getCelebradas(anio, mes);
  for (const c of codigos) todas.delete(String(c));
  await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    llaveCelebradas(anio, mes),
    JSON.stringify([...todas]),
  ]);
}

export async function marcarCelebradas(anio, mes, codigos) {
  const db = await getDatabase();
  const todas = await getCelebradas(anio, mes);
  for (const c of codigos) todas.add(String(c));
  await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    llaveCelebradas(anio, mes),
    JSON.stringify([...todas]),
  ]);
  // Solo se guardan los últimos meses (igual que las metas).
  await db.runAsync("DELETE FROM app_meta WHERE key LIKE 'metas_celebradas:%' AND key < ?", [
    llaveCelebradas(mes > 6 ? anio : anio - 1, ((mes + 5) % 12) + 1),
  ]);
}

// Vendedor de este equipo para Metas (encabezado e información). Las metas ya llegan filtradas por
// el backend: aquí solo se muestra a quién corresponden.
//   vendedores: códigos del ERP (result.vendedores de la última sync; si no hay, los VENDEDOR de las
//               metas del periodo).
//   agentes:    [{ codigo, nombre }] alias de ruteo (result.agentes) con su nombre. El nombre sale de
//               lo descargado que trae AGENTE + NOMBRE_AGENTE (cobros del agente, historial de
//               facturas, cobros de las rutas); null si no se encontró.
export async function getVendedorMetas(anio, mes) {
  const db = await getDatabase();
  const { agentes, vendedores: guardados } = await leerAgentesSync(db);
  const vendedores = guardados.length
    ? guardados
    : (
        await db.getAllAsync('SELECT DISTINCT VENDEDOR FROM META_VENTA WHERE ANIO = ? AND MES = ? ORDER BY VENDEDOR', [
          anio ?? 0,
          mes ?? 0,
        ])
      ).map((r) => r.VENDEDOR);
  if (!agentes.length) return { vendedores, agentes: [] };

  const filas = await db.getAllAsync(
    `SELECT v.AGENTE,
            COALESCE(
              (SELECT NULLIF(TRIM(NOMBRE_AGENTE), '') FROM alCXC_PEN_COB_AGENTE WHERE TRIM(AGENTE) = v.AGENTE AND NULLIF(TRIM(NOMBRE_AGENTE), '') IS NOT NULL LIMIT 1),
              (SELECT NULLIF(TRIM(NOMBRE_AGENTE), '') FROM HISTORIAL_FAC_ENC WHERE TRIM(AGENTE) = v.AGENTE AND NULLIF(TRIM(NOMBRE_AGENTE), '') IS NOT NULL LIMIT 1),
              (SELECT NULLIF(TRIM(NOMBRE_AGENTE), '') FROM alCXC_PEN_COB WHERE TRIM(AGENTE) = v.AGENTE AND NULLIF(TRIM(NOMBRE_AGENTE), '') IS NOT NULL LIMIT 1)
            ) AS NOMBRE
       FROM (${agentes.map(() => 'SELECT ? AS AGENTE').join(' UNION ')}) v
      ORDER BY v.AGENTE`,
    agentes
  );
  return { vendedores, agentes: filas.map((r) => ({ codigo: r.AGENTE, nombre: r.NOMBRE ?? null })) };
}

// Usuario y handheld del último login/sesión (app_meta.mobile_sesion): { usuario, handheld } o null.
export async function getDatosSesion() {
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'mobile_sesion'");
  try {
    const sesion = JSON.parse(row?.value ?? 'null');
    return sesion ? { usuario: sesion.usuario ?? null, handheld: sesion.handheld ?? null } : null;
  } catch {
    return null;
  }
}
