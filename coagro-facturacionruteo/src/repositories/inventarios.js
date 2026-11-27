import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';
import { siguienteConsecutivo } from './pedidos';
import { compararConsecutivos } from './notasCredito';

// Inventario del cliente (Menú Consultar > Inventario > Nuevo inventario): el vendedor cuenta cuánto tiene el cliente de cada
// artículo. Se guarda en alFAC_ENC_INV + alFAC_DET_INV (ver migración v40), se sube en
// POST /fr/sync/enviar (inventarios[], services/enviarDatos) y se descarga con GET /fr/sync/inventarios
// (services/syncInventarios). NUM_INV = consecutivo INVENTARIO de RUTA_CONSECUT_RT de la ruta, que
// avanza aquí igual que PEDIDO, RECIBO y NOTACREDITO.
// - CNT_MAX = cajas (unidad de almacén), CNT_MIN = unidades (detalle); ambos >= 0. Contar 0 es válido
//   (el cliente no tiene el artículo). Un artículo una sola vez por inventario.
// - Solo se guardan los artículos que el vendedor contó (escribió algo, aunque sea 0).

// Largo máximo de NUM_INV en el servidor.
export const LARGO_NUM_INV = 20;

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const r4 = (n) => Math.round((Number(n) || 0) * 1e4) / 1e4;

// Valor capturado: null = vacío (no contado); número >= 0; NaN = inválido.
export function leerConteo(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? r4(n) : NaN;
}

// Conteo de un artículo a partir de la captura { cajas, unidades } (textos). Devuelve
// { contado, cajas, unidades, error }: contado = escribió algo en cajas o unidades.
export function calcularConteo(articulo, captura) {
  const cajas = leerConteo(captura?.cajas);
  const unidades = articulo.factorVenta > 1 ? leerConteo(captura?.unidades) : null;
  const contado = cajas !== null || unidades !== null;
  let error = null;
  if (Number.isNaN(cajas) || Number.isNaN(unidades)) error = 'Escribe un número válido (0 o más).';
  return { contado, cajas: Number.isNaN(cajas) ? 0 : cajas ?? 0, unidades: Number.isNaN(unidades) ? 0 : unidades ?? 0, error };
}

// Artículos que se pueden contar: los del grupo de la ruta activa (los mismos del inventario de la
// ruta), tengan o no existencia en la bodega. [{ codigo, descripcion, empAlm, empDet, factorVenta }]
export async function getArticulosInventario(ruta) {
  if (!ruta?.grupoArticulo) return [];
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT COD_ART, DES_ART, EMP_ALM, EMP_DET, FACTOR_VENTA
       FROM ARTICULO
      WHERE GRP_ART = ?
      ORDER BY ORDEN_ART, DES_ART`,
    [ruta.grupoArticulo]
  );
  return filas.map((r) => ({
    codigo: r.COD_ART,
    descripcion: r.DES_ART ?? r.COD_ART,
    empAlm: String(r.EMP_ALM ?? '').trim(),
    empDet: String(r.EMP_DET ?? '').trim(),
    factorVenta: num(r.FACTOR_VENTA) > 0 ? num(r.FACTOR_VENTA) : 1,
  }));
}

// Guarda un inventario nuevo (ENVIADO = 0) y avanza el consecutivo INVENTARIO de la ruta, en UNA
// transacción. Devuelve el NUM_INV.
//   ruta: COD_ZON. cliente: { codigo, nombre }. articulos: de getArticulosInventario.
//   capturas: { [codigo]: { cajas, unidades } } (textos). inicio / fin: Date (HOR_INI / HOR_FIN; FEC_INV = fin).
export async function guardarInventario({ ruta, cliente, articulos, capturas, inicio, fin }) {
  const lineas = [];
  for (const a of articulos) {
    const c = calcularConteo(a, capturas?.[a.codigo]);
    if (!c.contado) continue;
    if (c.error) throw new Error(`${a.descripcion || a.codigo}: ${c.error}`);
    lineas.push({ codigo: a.codigo, cajas: c.cajas, unidades: c.unidades });
  }
  if (!lineas.length) throw new Error('Cuenta al menos un artículo (escribe 0 si el cliente no lo tiene).');

  const db = await getDatabase();
  let numero = null;
  await db.withTransactionAsync(async () => {
    const consec = await db.getFirstAsync('SELECT INVENTARIO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [ruta]);
    numero = String(consec?.INVENTARIO ?? '').trim();
    if (!numero) {
      throw new Error(`La ruta ${ruta} no tiene consecutivo de inventario. Descárgalo en Datos > Cargar datos.`);
    }
    if (numero.length > LARGO_NUM_INV) {
      throw new Error(`El consecutivo de inventario ${numero} pasa de ${LARGO_NUM_INV} caracteres.`);
    }
    const existe = await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_INV WHERE COD_ZON = ? AND NUM_INV = ?', [ruta, numero]);
    if (existe) throw new Error(`Ya existe un inventario con el número ${numero} en la ruta ${ruta}.`);
    const cc = await db.getFirstAsync('SELECT COD_CIA FROM CLIENTE_CIA WHERE COD_CLT = ?', [cliente.codigo]);
    const cia = String(cc?.COD_CIA ?? '').trim();

    await db.runAsync(
      `INSERT INTO alFAC_ENC_INV (COD_CIA, COD_ZON, NUM_INV, COD_CLT, NOM_CLT, HOR_INI, HOR_FIN, FEC_INV, NUM_ITM, ENVIADO)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [cia, ruta, numero, cliente.codigo, cliente.nombre ?? null, toSqlLocal(inicio ?? fin), toSqlLocal(fin), toSqlLocal(fin), lineas.length]
    );
    for (const [i, l] of lineas.entries()) {
      await db.runAsync(
        'INSERT INTO alFAC_DET_INV (COD_CIA, COD_ZON, NUM_INV, NUM_LN, COD_ART, CNT_MAX, CNT_MIN) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cia, ruta, numero, i + 1, l.codigo, l.cajas, l.unidades]
      );
    }
    await db.runAsync('UPDATE RUTA_CONSECUT_RT SET INVENTARIO = ? WHERE RUTA = ?', [siguienteConsecutivo(numero), ruta]);
    // El consecutivo nuevo también debe llegar al servidor (ver services/enviarDatos).
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  });
  return numero;
}

// ---------------------------------------------------------------------------------------------
// Consulta.

// Estado para mostrar: 'pendiente' (solo en el equipo), 'error' (el servidor lo rechazó), 'enviado'
// (en el servidor, oficina aún no lo procesa) o 'procesado'.
const estadoInventario = (r) => {
  if (r.ENVIADO !== 1) return r.ERROR_ENVIO ? 'error' : 'pendiente';
  return String(r.DOC_PRO ?? 'N').trim().toUpperCase() === 'N' ? 'enviado' : 'procesado';
};

// Inventarios del cliente en el equipo (los hechos aquí y los descargados), los más recientes primero.
export async function getInventariosCliente(cliente) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, COD_ZON, NUM_INV, FEC_INV, HOR_INI, HOR_FIN, NUM_ITM, DOC_PRO, ENVIADO, ERROR_ENVIO
       FROM alFAC_ENC_INV
      WHERE COD_CLT = ?
      ORDER BY FEC_INV DESC, NUM_INV DESC`,
    [cliente]
  );
  return filas.map((r) => ({
    compania: r.COD_CIA,
    ruta: r.COD_ZON,
    numero: r.NUM_INV,
    fecha: r.FEC_INV,
    inicio: r.HOR_INI,
    fin: r.HOR_FIN,
    articulos: r.NUM_ITM ?? 0,
    estado: estadoInventario(r),
    errorEnvio: r.ERROR_ENVIO ?? null,
  }));
}

// Líneas de un inventario con la descripción y empaques del artículo (si está en el equipo).
export async function getLineasInventario(compania, ruta, numero) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT d.COD_ART, d.CNT_MAX, d.CNT_MIN,
            (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS DES_ART,
            (SELECT a.EMP_ALM FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS EMP_ALM,
            (SELECT a.EMP_DET FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS EMP_DET
       FROM alFAC_DET_INV d
      WHERE d.COD_CIA = ? AND d.COD_ZON = ? AND d.NUM_INV = ?
      ORDER BY COALESCE(d.NUM_LN, 0), d.COD_ART`,
    [compania ?? '', ruta, numero]
  );
  return filas.map((r) => ({
    codigo: r.COD_ART,
    descripcion: r.DES_ART ?? null,
    cajas: num(r.CNT_MAX),
    unidades: num(r.CNT_MIN),
    empAlm: String(r.EMP_ALM ?? '').trim(),
    empDet: String(r.EMP_DET ?? '').trim(),
  }));
}

// Borra del equipo un inventario SIN ENVIAR (p. ej. rechazado por el servidor). El consecutivo no
// retrocede: ese número queda sin usar.
export async function descartarInventario(compania, ruta, numero) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const llave = [compania ?? '', ruta, numero];
    const e = await db.getFirstAsync('SELECT ENVIADO FROM alFAC_ENC_INV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?', llave);
    if (!e) return;
    if (e.ENVIADO === 1) throw new Error(`El inventario ${numero} ya está en el servidor: no se puede descartar.`);
    await db.runAsync('DELETE FROM alFAC_DET_INV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?', llave);
    await db.runAsync('DELETE FROM alFAC_ENC_INV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?', llave);
  });
}

// ---------------------------------------------------------------------------------------------
// Envío (services/enviarDatos).

// Inventarios sin enviar con sus líneas, en el formato de POST /fr/sync/enviar (inventarios[]).
// DOC_PRO no se manda (el servidor lo pone 'N'). fechaSql: normaliza a 'YYYY-MM-DD HH:MM:SS'.
export async function leerInventariosPendientes(db, fechaSql) {
  const encabezados = await db.getAllAsync('SELECT * FROM alFAC_ENC_INV WHERE ENVIADO = 0 ORDER BY HOR_FIN');
  const inventarios = [];
  for (const e of encabezados) {
    const lineas = await db.getAllAsync(
      'SELECT COD_ART, CNT_MAX, CNT_MIN FROM alFAC_DET_INV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ? ORDER BY COALESCE(NUM_LN, 0), COD_ART',
      [e.COD_CIA, e.COD_ZON, e.NUM_INV]
    );
    inventarios.push({
      encabezado: {
        COD_CIA: e.COD_CIA,
        COD_ZON: e.COD_ZON,
        COD_CLT: e.COD_CLT,
        NUM_INV: e.NUM_INV,
        HOR_INI: fechaSql(e.HOR_INI),
        HOR_FIN: fechaSql(e.HOR_FIN),
        FEC_INV: fechaSql(e.FEC_INV),
        // Debe coincidir con las líneas que se mandan.
        NUM_ITM: lineas.length,
      },
      lineas: lineas.map((l) => ({ COD_ART: l.COD_ART, CNT_MAX: num(l.CNT_MAX), CNT_MIN: num(l.CNT_MIN) })),
    });
  }
  return inventarios;
}

// Si el servidor tiene el consecutivo INVENTARIO de la ruta más adelante que el equipo, el equipo lo
// toma (evita repetir números). Corre en la transacción del envío.
export async function adoptarConsecutivoInventario(db, ruta, actualServidor) {
  const local = (await db.getFirstAsync('SELECT INVENTARIO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [ruta]))?.INVENTARIO;
  if (compararConsecutivos(actualServidor, local) === 1) {
    await db.runAsync('UPDATE RUTA_CONSECUT_RT SET INVENTARIO = ? WHERE RUTA = ?', [String(actualServidor).trim(), ruta]);
  }
}

// El servidor respondió conflicto: ese NUM_INV ya existe en la ruta. Se le asigna el siguiente número
// libre (el consecutivo del equipo o el del servidor, el mayor; sin chocar con otro del equipo), se
// avanza el consecutivo y queda pendiente para reenviarse. HOR_INI NO cambia (el servidor la usa para
// reconocer reenvíos). Corre en la transacción del envío. Devuelve el número nuevo.
export async function renumerarInventario(db, { COD_CIA, COD_ZON, NUM_INV }, actualServidor = null) {
  const fila = await db.getFirstAsync('SELECT INVENTARIO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [COD_ZON]);
  let nuevo = String(fila?.INVENTARIO ?? '').trim();
  if (!nuevo) throw new Error(`La ruta ${COD_ZON} no tiene consecutivo de inventario.`);
  if (compararConsecutivos(actualServidor, nuevo) === 1) nuevo = String(actualServidor).trim();
  // Nunca hacia atrás ni el mismo número que chocó.
  if (compararConsecutivos(nuevo, NUM_INV) !== 1) nuevo = siguienteConsecutivo(NUM_INV);
  while (await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_INV WHERE COD_ZON = ? AND NUM_INV = ?', [COD_ZON, nuevo])) {
    nuevo = siguienteConsecutivo(nuevo);
  }
  const llave = [COD_CIA ?? '', COD_ZON, NUM_INV];
  await db.runAsync('UPDATE alFAC_DET_INV SET NUM_INV = ? WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?', [nuevo, ...llave]);
  await db.runAsync(
    'UPDATE alFAC_ENC_INV SET NUM_INV = ?, ERROR_ENVIO = ? WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?',
    [nuevo, `El número ${NUM_INV} ya estaba usado en el servidor; se renumeró a ${nuevo}.`, ...llave]
  );
  await db.runAsync('UPDATE RUTA_CONSECUT_RT SET INVENTARIO = ? WHERE RUTA = ?', [siguienteConsecutivo(nuevo), COD_ZON]);
  await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  return nuevo;
}
