import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const entero = (v) => {
  const n = num(v);
  return Number.isInteger(n) ? n : null;
};

// Meses hacia atrás que se conservan en el equipo; los periodos más viejos se borran al sincronizar.
const MESES_CONSERVAR = 3;

const COLUMNAS = [
  'ID_META', 'ANIO', 'MES', 'VENDEDOR', 'COD_LINEA', 'LINEA', 'COD_LIDER', 'LIDER', 'COD_ART', 'DES_ART',
  'COD_PROVEEDOR', 'PROVEEDOR', 'META_UNIDADES', 'MINIMO', 'INCENTIVO', 'VENTA_UNIDADES', 'VENTA_VALOR',
  'FECHA_MODIFICACION',
];
const SQL = `INSERT OR REPLACE INTO META_VENTA (${COLUMNAS.join(', ')}) VALUES (${COLUMNAS.map(() => '?').join(', ')})`;

// Arma la URL: sin parámetros = mes actual del servidor (uso normal).
function rutaMetas({ anio, mes } = {}) {
  if (anio == null) return PATHS.syncMetas;
  return `${PATHS.syncMetas}?anio=${encodeURIComponent(anio)}${mes != null ? `&mes=${encodeURIComponent(mes)}` : ''}`;
}

// Descarga las metas de venta del vendedor de este equipo (el vendedor NO se manda: el backend lo saca
// de la ruta asignada a la handheld y ya filtra las metas). Respuesta:
//   { result: { agentes: ['AG01'], vendedores: ['VBV'], periodo: { anio, mes|null }, metas: [...] } }
//   agentes    = código de ruteo de la ruta (alias; el AGENTE que traen cobros e historial).
//   vendedores = vendedor del ERP de ese agente; es el que llega en META_VENTA.VENDEDOR.
// El alias y el código del ERP pueden ser distintos (AG01 = VBV): no se cruzan entre sí.
// metas: [] no es un error (el vendedor no tiene metas en el periodo). Un agente sin vendedor del ERP
// asociado (AGENTE_ASOC_RT) llega como success:false: se lanza y las metas locales no se tocan.
// Solo descarga y valida: no toca la base. Si la petición falla (red, success:false) se lanza el
// error y lo que hay en el equipo queda intacto. Devuelve { guardar(db), resumen }.
//   opciones: { anio, mes } para pedir otro periodo (mes omitido = todo el año).
export async function descargarMetas(opciones) {
  const json = await getJson(rutaMetas(opciones));
  const data = json?.result;
  const anio = entero(data?.periodo?.anio);
  const mes = data?.periodo?.mes == null ? null : entero(data.periodo.mes);
  if (!data || !Array.isArray(data.metas) || anio == null || (data.periodo.mes != null && mes == null)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (metas).');
  }

  // Se descartan filas sin sus campos clave o fuera del periodo devuelto (el DELETE de guardar no
  // las cubriría y quedarían duplicadas en una sincronización posterior).
  const metas = data.metas.filter((m) => {
    if (!m || typeof m !== 'object') return false;
    const anioFila = entero(m.ANIO);
    const mesFila = entero(m.MES);
    return (
      entero(m.ID_META) != null &&
      anioFila === anio &&
      mesFila != null &&
      mesFila >= 1 &&
      mesFila <= 12 &&
      (mes == null || mesFila === mes) &&
      textOr(m.VENDEDOR) !== '' &&
      textOr(m.COD_ART) !== ''
    );
  });
  const omitidos = data.metas.length - metas.length;
  const lista = (v) => (Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : []);
  const agentes = lista(data.agentes);
  const vendedores = lista(data.vendedores);

  const guardar = async (db) => {
    // Subir de nuevo el Excel en la web reemplaza el periodo completo y cambia los ID_META:
    // se borra el periodo y se inserta lo recibido (periodo del servidor, no del teléfono).
    await db.runAsync('DELETE FROM META_VENTA WHERE ANIO = ? AND (? IS NULL OR MES = ?)', [anio, mes, mes]);
    const sql = await db.prepareAsync(SQL);
    try {
      for (const m of metas) {
        await sql.executeAsync([
          entero(m.ID_META),
          entero(m.ANIO),
          entero(m.MES),
          textOr(m.VENDEDOR),
          text(m.COD_LINEA),
          text(m.LINEA),
          text(m.COD_LIDER),
          text(m.LIDER),
          textOr(m.COD_ART),
          text(m.DES_ART),
          text(m.COD_PROVEEDOR),
          text(m.PROVEEDOR),
          num(m.META_UNIDADES) ?? 0,
          num(m.MINIMO) ?? 0,
          num(m.INCENTIVO) ?? 0,
          num(m.VENTA_UNIDADES),
          num(m.VENTA_VALOR),
          text(m.FECHA_MODIFICACION),
        ]);
      }
    } finally {
      await sql.finalizeAsync();
    }

    // Limpieza: periodos de más de MESES_CONSERVAR meses antes del periodo del servidor. Solo al
    // pedir un mes (con el año completo no hay un mes de referencia).
    if (mes != null) {
      await db.runAsync('DELETE FROM META_VENTA WHERE ANIO * 12 + MES < ?', [anio * 12 + mes - MESES_CONSERVAR]);
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_metas_at', ?)", [
      new Date().toISOString(),
    ]);
    // Agente (alias de ruta) y vendedor del ERP que el servidor sacó del token: para el encabezado y
    // la información de Metas (aunque no haya metas) y para cruzar las facturas al calcular lo vendido.
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_metas_agentes', ?)", [
      JSON.stringify(agentes),
    ]);
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_metas_vendedores', ?)", [
      JSON.stringify(vendedores),
    ]);
  };

  return { guardar, resumen: { metas: metas.length, omitidos, periodo: { anio, mes }, agentes, vendedores } };
}

// Para trabajar sin conexión: el mes actual del servidor y los MESES_CONSERVAR meses anteriores
// (los que el equipo conserva), cada uno con su propio pedido ?anio=&mes=. Solo descarga; si falla
// cualquiera se lanza el error y no se toca nada. Devuelve { guardar(db), resumen } donde resumen es
// el del mes actual más metasAnteriores (filas de los meses anteriores) y omitidos de todos.
export async function descargarMetasRecientes() {
  const actual = await descargarMetas();
  const { anio, mes } = actual.resumen.periodo;
  const anteriores = [];
  if (mes != null) {
    for (let k = MESES_CONSERVAR; k >= 1; k -= 1) {
      const t = anio * 12 + (mes - 1) - k;
      anteriores.push(await descargarMetas({ anio: Math.floor(t / 12), mes: (t % 12) + 1 }));
    }
  }

  const guardar = async (db) => {
    // Primero los meses anteriores y al final el actual: su limpieza (periodos viejos) usa el mes actual.
    for (const d of anteriores) await d.guardar(db);
    await actual.guardar(db);
  };

  const resumen = {
    ...actual.resumen,
    metasAnteriores: anteriores.reduce((s, d) => s + d.resumen.metas, 0),
    omitidos: [actual, ...anteriores].reduce((s, d) => s + d.resumen.omitidos, 0),
  };
  return { guardar, resumen };
}
