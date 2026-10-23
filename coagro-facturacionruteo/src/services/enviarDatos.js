import { ApiError, postJson } from './api';
import { getDatabase } from '../db/database';
import { toSqlLocal } from '../repositories/visitas';
import { PATHS, TIMEOUT_ENVIO_MS } from '../config/api';

// Envío al servidor (POST /fr/sync/enviar) de lo registrado en el equipo: ubicaciones de clientes,
// visitas (con su GPS), pedidos (encabezado + líneas) y el consecutivo de pedidos de cada ruta.
// "Cargar datos" borra las tablas locales y las vuelve a llenar, así que esto va ANTES de cargar.
// El servidor no duplica: reenviar lo mismo es seguro.

// Largos máximos de las columnas en el servidor: se recortan aquí.
const corta = (v, max) => (v == null ? null : String(v).slice(0, max));
// El servidor exige 'YYYY-MM-DD HH:MM:SS'; las fechas sin hora se mandan a medianoche.
const fechaSql = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v} 00:00:00` : v ?? null);
const numero = (v) => (v == null || v === '' ? null : Number(v));

// Cantidad de registros pendientes de enviar ({ ubicaciones, visitas, pedidos, consecutivos, total }).
export async function contarPendientes() {
  const db = await getDatabase();
  const cuenta = async (tabla) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ENVIADO = 0`))?.n ?? 0;
  const ubicaciones = await cuenta('CLIENTE_UBICACION');
  const visitas = await cuenta('VISITA');
  const pedidos = await cuenta('alFAC_ENC_PED');
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos = flag?.value === '1' ? 1 : 0;
  return { ubicaciones, visitas, pedidos, consecutivos, total: ubicaciones + visitas + pedidos + consecutivos };
}

async function leerPendientes(db) {
  const ubicaciones = await db.getAllAsync(
    'SELECT RUTA, CLIENTE, LATITUD, LONGITUD, ALTITUD FROM CLIENTE_UBICACION WHERE ENVIADO = 0'
  );

  const filasVisita = await db.getAllAsync(
    `SELECT v.CLIENTE, v.RUTA, v.INICIO, v.FIN, v.FECHA_PLAN, v.NOTAS, v.TIPO, v.RAZON,
            u.LATITUD, u.LONGITUD, u.ALTITUD, u.TIEMPO_GPS, u.TIEMPO_PDA
       FROM VISITA v
       LEFT JOIN VISITA_UBICACION u ON u.CLIENTE = v.CLIENTE AND u.RUTA = v.RUTA AND u.INICIO = v.INICIO
      WHERE v.ENVIADO = 0
      ORDER BY v.INICIO`
  );
  const visitas = filasVisita.map((v) => ({
    CLIENTE: v.CLIENTE,
    RUTA: v.RUTA,
    INICIO: fechaSql(v.INICIO),
    FIN: fechaSql(v.FIN),
    FECHA_PLAN: fechaSql(v.FECHA_PLAN),
    NOTAS: corta(v.NOTAS, 512),
    TIPO: corta(v.TIPO, 1),
    RAZON: corta(v.RAZON, 2),
    ubicacion:
      v.LATITUD == null || v.LONGITUD == null
        ? null
        : {
            LATITUD: v.LATITUD,
            LONGITUD: v.LONGITUD,
            ALTITUD: v.ALTITUD,
            TIEMPO_GPS: fechaSql(v.TIEMPO_GPS),
            TIEMPO_PDA: fechaSql(v.TIEMPO_PDA),
          },
  }));

  const encabezados = await db.getAllAsync('SELECT * FROM alFAC_ENC_PED WHERE ENVIADO = 0 ORDER BY HOR_FIN');
  const pedidos = [];
  for (const e of encabezados) {
    const lineas = await db.getAllAsync('SELECT * FROM alFAC_DET_PED WHERE NUM_PED = ? ORDER BY NUM_LN', [e.NUM_PED]);
    pedidos.push({
      encabezado: {
        COD_CIA: e.COD_CIA,
        COD_ZON: e.COD_ZON,
        COD_CLT: e.COD_CLT,
        NUM_PED: e.NUM_PED,
        COD_BOD: corta(e.COD_BOD, 4),
        LST_PRE: e.LST_PRE,
        COD_CND: e.COD_CND,
        CLASE: e.CLASE,
        COD_PAIS: e.COD_PAIS,
        NUM_ITM: lineas.length,
        ESTADO: e.ESTADO,
        DESCUENTO_CASCADA: e.DESCUENTO_CASCADA,
        IMPRESO: e.IMPRESO,
        CONSIGNACION: e.CONSIGNACION,
        DESC1: e.DESC1,
        DESC2: e.DESC2,
        MONT_DESC1: e.MONT_DESC1,
        MONT_DESC2: e.MONT_DESC2,
        MON_DSC: e.MON_DSC,
        MON_IMP_VT: e.MON_IMP_VT,
        MON_IMP_CS: e.MON_IMP_CS,
        MON_SIV: e.MON_SIV,
        MON_CIV: e.MON_CIV,
        HOR_INI: fechaSql(e.HOR_INI),
        HOR_FIN: fechaSql(e.HOR_FIN),
        FEC_PED: fechaSql(e.FEC_PED),
        FEC_DES: fechaSql(e.FEC_DES),
        OBS_PED: corta(e.OBS_PED, 60),
        DIR_ENT: corta(e.DIR_ENT, 8),
        NIVEL_PRECIO: corta(e.NIVEL_PRECIO, 12),
        MONEDA: corta(e.MONEDA, 1),
        COD_GEO1: e.COD_GEO1,
        COD_GEO2: e.COD_GEO2,
        ACTIVIDAD_COMERCIAL: e.ACTIVIDAD_COMERCIAL,
        SUBTIPO_DOC: corta(e.SUBTIPO_DOC, 25),
      },
      lineas: lineas.map((l) => ({
        NUM_LN: l.NUM_LN,
        COD_ART: l.COD_ART,
        CNT_MAX: l.CNT_MAX,
        CNT_MIN: l.CNT_MIN,
        MON_TOT: l.MON_TOT,
        MON_DSC: l.MON_DSC,
        LST_PRE: l.LST_PRE,
        MON_PRC_MX: l.MON_PRC_MX,
        MON_PRC_MN: l.MON_PRC_MN,
        POR_DSC_AP: l.POR_DSC_AP,
        ART_BON: l.ART_BON ?? '0',
        PORC_IMPUESTO1: numero(l.PORC_IMPUESTO1),
        PORC_IMPUESTO2: numero(l.PORC_IMPUESTO2),
        PORCENTAJE_IMP1: l.PORCENTAJE_IMP1,
        PORCENTAJE_IMP2: l.PORCENTAJE_IMP2,
        PORC_EXONERACION: l.PORC_EXONERACION,
        MONTO_EXONERACION: l.MONTO_EXONERACION,
        ES_CANASTA_BASICA: l.ES_CANASTA_BASICA,
        ES_OTRO_CARGO: l.ES_OTRO_CARGO,
      })),
    });
  }

  // Consecutivo SIGUIENTE de cada ruta (ya incrementado en el equipo). Solo si se guardaron pedidos
  // desde el último envío correcto.
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos =
    flag?.value === '1'
      ? await db.getAllAsync("SELECT RUTA, PEDIDO FROM RUTA_CONSECUT_RT WHERE COALESCE(PEDIDO, '') <> ''")
      : [];

  return { ubicaciones, visitas, pedidos, consecutivos };
}

// Envía todo lo pendiente y marca como enviado lo que el servidor guardó (ok, o duplicado de un envío
// anterior). Lo que falla queda pendiente con su ERROR_ENVIO.
// Devuelve { enviados, errores: [{ tipo, registro, error }] }; errores vacío = todo quedó en el servidor.
// Lanza ApiError si el request entero falla (sin red, timeout, 5xx, success: false): no se marca nada.
export async function enviarPendientes() {
  const db = await getDatabase();
  const datos = await leerPendientes(db);
  const total = datos.ubicaciones.length + datos.visitas.length + datos.pedidos.length + datos.consecutivos.length;
  if (!total) return { enviados: 0, errores: [] };

  const json = await postJson(PATHS.syncEnviar, datos, { timeout: TIMEOUT_ENVIO_MS });
  const r = json?.result;
  if (!r || !['ubicaciones', 'visitas', 'pedidos', 'consecutivos'].every((k) => Array.isArray(r[k]))) {
    throw new ApiError('La respuesta del servidor al envío no tiene el formato esperado.');
  }

  const ahora = toSqlLocal(new Date());
  const errores = [];
  let enviados = 0;

  // Resultado por registro, en el mismo orden en que se mandó.
  const procesar = async (tipo, enviadosTipo, resultados, describir, marcar) => {
    for (const [i, reg] of enviadosTipo.entries()) {
      const res = resultados[i];
      const error = res?.ok ? null : res?.error || 'El servidor no devolvió resultado para este registro.';
      await marcar(reg, error);
      if (error) errores.push({ tipo, registro: describir(reg), error });
      else enviados += 1;
    }
  };
  const marcarEn = (tabla, where, valores) => (reg, error) =>
    error
      ? db.runAsync(`UPDATE ${tabla} SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...valores(reg)])
      : db.runAsync(`UPDATE ${tabla} SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL WHERE ${where}`, [
          ahora,
          ...valores(reg),
        ]);

  await db.withTransactionAsync(async () => {
    await procesar(
      'Ubicación',
      datos.ubicaciones,
      r.ubicaciones,
      (u) => `Cliente ${u.CLIENTE} (ruta ${u.RUTA})`,
      marcarEn('CLIENTE_UBICACION', 'RUTA = ? AND CLIENTE = ?', (u) => [u.RUTA, u.CLIENTE])
    );
    // INICIO siempre se guarda con hora ('YYYY-MM-DD HH:MM:SS'): es el mismo valor que se envió.
    await procesar(
      'Visita',
      datos.visitas,
      r.visitas,
      (v) => `Cliente ${v.CLIENTE} (${v.INICIO})`,
      marcarEn('VISITA', 'CLIENTE = ? AND RUTA = ? AND INICIO = ?', (v) => [v.CLIENTE, v.RUTA, v.INICIO])
    );
    await procesar(
      'Pedido',
      datos.pedidos,
      r.pedidos,
      (p) => `${p.encabezado.NUM_PED} (cliente ${p.encabezado.COD_CLT})`,
      marcarEn('alFAC_ENC_PED', 'COD_ZON = ? AND NUM_PED = ?', (p) => [p.encabezado.COD_ZON, p.encabezado.NUM_PED])
    );
    let consecutivosOk = true;
    await procesar(
      'Consecutivo',
      datos.consecutivos,
      r.consecutivos,
      (c) => `Ruta ${c.RUTA} (${c.PEDIDO})`,
      async (c, error) => {
        if (error) consecutivosOk = false;
      }
    );
    if (datos.consecutivos.length && consecutivosOk) {
      await db.runAsync("DELETE FROM app_meta WHERE key = 'consecutivos_pendientes'");
    }
  });

  return { enviados, errores };
}
