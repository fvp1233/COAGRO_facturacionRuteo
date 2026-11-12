import { ApiError, postJson } from './api';
import { getDatabase } from '../db/database';
import { toSqlLocal } from '../repositories/visitas';
import { leerDepositosPendientes, marcarPagosEnviados } from '../repositories/depositos';
import { PATHS, TIMEOUT_ENVIO_MS } from '../config/api';

// Envío al servidor (POST /fr/sync/enviar) de lo registrado en el equipo: ubicaciones de clientes,
// visitas (con su GPS), pedidos (encabezado + líneas), aprobaciones de cotizaciones y el consecutivo
// de pedidos de cada ruta.
// "Cargar datos" borra las tablas locales y las vuelve a llenar, así que esto va ANTES de cargar.
// El servidor no duplica: reenviar lo mismo es seguro.

// Largos máximos de las columnas en el servidor: se recortan aquí.
const corta = (v, max) => (v == null ? null : String(v).slice(0, max));
// El servidor exige 'YYYY-MM-DD HH:MM:SS'; las fechas sin hora se mandan a medianoche.
const fechaSql = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v} 00:00:00` : v ?? null);
const numero = (v) => (v == null || v === '' ? null : Number(v));

// Cantidad de registros pendientes de enviar ({ ubicaciones, visitas, pedidos, aprobaciones, depositos, consecutivos, total }).
// Depósitos = alCXC_ENC_DEP sin enviar (el efectivo y los cheques aún sin depositar no cuentan).
export async function contarPendientes() {
  const db = await getDatabase();
  const cuenta = async (tabla) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ENVIADO = 0`))?.n ?? 0;
  const ubicaciones = await cuenta('CLIENTE_UBICACION');
  const visitas = await cuenta('VISITA');
  const pedidos = await cuenta('alFAC_ENC_PED');
  const aprobaciones = await cuenta('COTIZACION_APROBACION');
  const depositos = (await leerDepositosPendientes(db)).length;
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos = flag?.value === '1' ? 1 : 0;
  return {
    ubicaciones,
    visitas,
    pedidos,
    aprobaciones,
    depositos,
    consecutivos,
    total: ubicaciones + visitas + pedidos + aprobaciones + depositos + consecutivos,
  };
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
        // El backend lo usa en otro proceso: nunca null (pedidos guardados antes del cambio).
        DOC_PRO: e.DOC_PRO ?? 'N',
        ESTADO: e.ESTADO,
        // 'C' = cotización; el resto es pedido 'F' (los guardados antes del cambio tienen 'FAC').
        TIP_DOC: e.TIP_DOC === 'C' ? 'C' : 'F',
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

  // Cotizaciones aprobadas en el equipo (TIP_DOC 'C' -> 'F'). El servidor las procesa después de
  // los pedidos, así que también sirven para una cotización que se envía en este mismo request.
  const filasAprobacion = await db.getAllAsync(
    'SELECT COD_CIA, COD_ZON, NUM_PED, FEC_PED, FEC_DES FROM COTIZACION_APROBACION WHERE ENVIADO = 0'
  );
  const aprobaciones = filasAprobacion.map((a) => ({
    COD_CIA: a.COD_CIA,
    COD_ZON: a.COD_ZON,
    NUM_PED: a.NUM_PED,
    FEC_PED: fechaSql(a.FEC_PED),
    FEC_DES: fechaSql(a.FEC_DES),
  }));

  // Consecutivos SIGUIENTES de cada ruta (ya incrementados en el equipo): PEDIDO de pedidos y FACTURA
  // de cotizaciones. Solo si se guardaron documentos desde el último envío correcto.
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos =
    flag?.value === '1'
      ? await db.getAllAsync(
          `SELECT RUTA, PEDIDO, FACTURA, RECIBO FROM RUTA_CONSECUT_RT
            WHERE COALESCE(PEDIDO, '') <> '' OR COALESCE(FACTURA, '') <> '' OR COALESCE(RECIBO, '') <> ''`
        )
      : [];

  // Depósitos (alCXC_ENC_DEP + alCXC_DET_DEP): agrupados por cuenta + boleta y por documento.
  const depositos = (await leerDepositosPendientes(db)).map((d) => ({
    ...d,
    encabezado: { ...d.encabezado, FEC_DEP: fechaSql(d.encabezado.FEC_DEP), NOTAS: corta(d.encabezado.NOTAS, 80) },
  }));

  return { ubicaciones, visitas, pedidos, aprobaciones, depositos, consecutivos };
}

// Envía todo lo pendiente y marca como enviado lo que el servidor guardó (ok, o duplicado de un envío
// anterior). Lo que falla queda pendiente con su ERROR_ENVIO.
// Devuelve { enviados, errores: [{ tipo, registro, error }] }; errores vacío = todo quedó en el servidor.
// Lanza ApiError si el request entero falla (sin red, timeout, 5xx, success: false): no se marca nada.
export async function enviarPendientes() {
  const db = await getDatabase();
  const datos = await leerPendientes(db);
  const total =
    datos.ubicaciones.length +
    datos.visitas.length +
    datos.pedidos.length +
    datos.aprobaciones.length +
    datos.depositos.length +
    datos.consecutivos.length;
  if (!total) return { enviados: 0, errores: [] };

  const json = await postJson(PATHS.syncEnviar, datos, { timeout: TIMEOUT_ENVIO_MS });
  const r = json?.result;
  const claves = ['ubicaciones', 'visitas', 'pedidos', 'aprobaciones', 'consecutivos'];
  if (datos.depositos.length) claves.push('depositos');
  if (!r || !claves.every((k) => Array.isArray(r[k]))) {
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
    await procesar(
      'Aprobación',
      datos.aprobaciones,
      r.aprobaciones,
      (a) => `Cotización ${a.NUM_PED}`,
      marcarEn('COTIZACION_APROBACION', 'COD_ZON = ? AND NUM_PED = ?', (a) => [a.COD_ZON, a.NUM_PED])
    );
    // Depósito ok (o duplicado de un envío anterior): queda enviado con su CONSEC_DEP del servidor.
    await procesar(
      'Depósito',
      datos.depositos,
      r.depositos ?? [],
      (d) => `Recibo ${d.encabezado.NUM_DEP} (cuenta ${d.encabezado.CTA_BCO})`,
      (d, error) => {
        const { COD_CIA, COD_BCO, CTA_BCO, NUM_DEP } = d.encabezado;
        const llave = [COD_CIA, COD_BCO, CTA_BCO, NUM_DEP];
        const where = 'COD_CIA = ? AND COD_BCO = ? AND CTA_BCO = ? AND NUM_DEP = ?';
        if (error) return db.runAsync(`UPDATE alCXC_ENC_DEP SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...llave]);
        const res = (r.depositos ?? []).find((x) => x?.CTA_BCO === CTA_BCO && String(x?.NUM_DEP) === NUM_DEP);
        return db.runAsync(
          `UPDATE alCXC_ENC_DEP SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL, CONSEC_DEP = ? WHERE ${where}`,
          [ahora, res?.CONSEC_DEP ?? null, ...llave]
        );
      }
    );
    if (datos.depositos.length) await marcarPagosEnviados(db);
    let consecutivosOk = true;
    await procesar(
      'Consecutivo',
      datos.consecutivos,
      r.consecutivos,
      (c) => `Ruta ${c.RUTA} (${[c.PEDIDO, c.FACTURA, c.RECIBO].filter(Boolean).join(', ')})`,
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

// Borra del equipo lo que ya está en el servidor, como parte de "Cargar datos" (solo se llama cuando
// no queda nada pendiente): pedidos y cotizaciones enviados (encabezado + líneas; las cotizaciones
// se vuelven a descargar), aprobaciones enviadas y visitas enviadas de días
// anteriores con su GPS. Las visitas de hoy se conservan porque marcan a los clientes como
// visitados en la tabla de Validar. Corre dentro de la transacción de la carga (db la da DatosScreen).
export async function limpiarEnviados(db) {
  // alFAC_DET_PED no tiene COD_ZON: no se borran líneas de un NUM_PED que siga pendiente en otra ruta.
  await db.runAsync(
    `DELETE FROM alFAC_DET_PED
      WHERE NUM_PED IN (SELECT NUM_PED FROM alFAC_ENC_PED WHERE ENVIADO = 1)
        AND NUM_PED NOT IN (SELECT NUM_PED FROM alFAC_ENC_PED WHERE ENVIADO = 0)`
  );
  await db.runAsync('DELETE FROM alFAC_ENC_PED WHERE ENVIADO = 1');
  await db.runAsync('DELETE FROM COTIZACION_APROBACION WHERE ENVIADO = 1');
  await db.runAsync("DELETE FROM VISITA WHERE ENVIADO = 1 AND date(INICIO) < date('now', 'localtime')");
  await db.runAsync(
    `DELETE FROM VISITA_UBICACION
      WHERE NOT EXISTS (SELECT 1 FROM VISITA v
                         WHERE v.CLIENTE = VISITA_UBICACION.CLIENTE
                           AND v.RUTA = VISITA_UBICACION.RUTA
                           AND v.INICIO = VISITA_UBICACION.INICIO)`
  );
}
