import { ApiError, postJson } from './api';
import { getDatabase } from '../db/database';
import { toSqlLocal } from '../repositories/visitas';
import { leerDepositosPendientes, marcarPagosEnviados } from '../repositories/depositos';
import { PATHS, TIMEOUT_ENVIO_MS } from '../config/api';
import { CAMPOS_CLIENTE } from '../repositories/clienteCambios';
import {
  adoptarConsecutivoServidor,
  leerNotasCreditoPendientes,
  renumerarNotaCredito,
} from '../repositories/notasCredito';
import {
  adoptarConsecutivoInventario,
  leerInventariosPendientes,
  renumerarInventario,
} from '../repositories/inventarios';

// Envío al servidor (POST /fr/sync/enviar) de lo registrado en el equipo: ubicaciones de clientes,
// visitas (con su GPS), pedidos (encabezado + líneas), aprobaciones de cotizaciones, notas de crédito,
// inventarios de clientes, cambios a los datos de clientes (Consultar > Cliente) y los consecutivos de
// cada ruta.
// "Cargar datos" borra las tablas locales y las vuelve a llenar, así que esto va ANTES de cargar.
// El servidor no duplica: reenviar lo mismo es seguro.

// Largos máximos de las columnas en el servidor: se recortan aquí.
const corta = (v, max) => (v == null ? null : String(v).slice(0, max));
// El servidor exige 'YYYY-MM-DD HH:MM:SS'; las fechas sin hora se mandan a medianoche.
const fechaSql = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v} 00:00:00` : v ?? null);
const numero = (v) => (v == null || v === '' ? null : Number(v));

// Cantidad de registros pendientes de enviar ({ ubicaciones, visitas, pedidos, aprobaciones, notasCredito,
// depositos, promocionales, cambiosCliente, consecutivos, total }).
// Depósitos = recibos con alguna parte sin enviar (alCXC_ENC_DEP; un recibo repartido en varias
// cuentas cuenta una vez).
export async function contarPendientes() {
  const db = await getDatabase();
  const cuenta = async (tabla) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ENVIADO = 0`))?.n ?? 0;
  const ubicaciones = await cuenta('CLIENTE_UBICACION');
  const visitas = await cuenta('VISITA');
  const pedidos = await cuenta('alFAC_ENC_PED');
  const aprobaciones = await cuenta('COTIZACION_APROBACION');
  const notasCredito = await cuenta('alFAC_ENC_DEV');
  const inventarios = await cuenta('alFAC_ENC_INV');
  const depositos = new Set((await leerDepositosPendientes(db)).map((d) => d.encabezado.NUM_DEP)).size;
  const promocionales = await cuenta('PROMOCIONAL');
  const cambiosCliente = await cuenta('CLIENTE_CAMBIO');
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos = flag?.value === '1' ? 1 : 0;
  return {
    ubicaciones,
    visitas,
    pedidos,
    aprobaciones,
    notasCredito,
    inventarios,
    depositos,
    promocionales,
    cambiosCliente,
    consecutivos,
    total:
      ubicaciones +
      visitas +
      pedidos +
      aprobaciones +
      notasCredito +
      inventarios +
      depositos +
      promocionales +
      cambiosCliente +
      consecutivos,
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

  // Notas de crédito (alFAC_ENC_DEV + alFAC_DET_DEV) creadas en el equipo.
  const notasCredito = await leerNotasCreditoPendientes(db, fechaSql);

  // Inventarios de clientes (alFAC_ENC_INV + alFAC_DET_INV) hechos en el equipo.
  const inventarios = await leerInventariosPendientes(db, fechaSql);

  // Consecutivos SIGUIENTES de cada ruta (ya incrementados en el equipo): PEDIDO de pedidos, FACTURA
  // de cotizaciones, RECIBO de cobros, NOTACREDITO de notas de crédito e INVENTARIO de inventarios.
  // Solo si se guardaron documentos desde el último envío correcto.
  const flag = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'consecutivos_pendientes'");
  const consecutivos =
    flag?.value === '1'
      ? await db.getAllAsync(
          `SELECT RUTA, PEDIDO, FACTURA, RECIBO, NOTACREDITO, INVENTARIO FROM RUTA_CONSECUT_RT
            WHERE COALESCE(PEDIDO, '') <> '' OR COALESCE(FACTURA, '') <> '' OR COALESCE(RECIBO, '') <> ''
               OR COALESCE(NOTACREDITO, '') <> '' OR COALESCE(INVENTARIO, '') <> ''`
        )
      : [];

  // Depósitos (alCXC_ENC_DEP + alCXC_DET_DEP): agrupados por cuenta + boleta y por documento.
  const depositos = (await leerDepositosPendientes(db)).map((d) => ({
    ...d,
    encabezado: { ...d.encabezado, FEC_DEP: fechaSql(d.encabezado.FEC_DEP), NOTAS: corta(d.encabezado.NOTAS, 80) },
  }));

  // Solicitudes de promocionales creadas en el equipo (Validar > Promocionales). La llave en el
  // servidor es CLIENTE + FECHA_SOLICITUD (reenviar la misma no la duplica); ID lo asigna el servidor.
  const filasPromocional = await db.getAllAsync(
    `SELECT CLIENTE, FECHA_SOLICITUD, RUTA, NOM_CLT, AGENTE, NOTAS, FECHA_REQUERIDA
       FROM PROMOCIONAL WHERE ENVIADO = 0 ORDER BY FECHA_SOLICITUD`
  );
  const promocionales = filasPromocional.map((p) => ({
    CLIENTE: p.CLIENTE,
    FECHA_SOLICITUD: fechaSql(p.FECHA_SOLICITUD),
    RUTA: p.RUTA,
    NOM_CLT: p.NOM_CLT,
    AGENTE: p.AGENTE,
    NOTAS: p.NOTAS,
    FECHA_REQUERIDA: fechaSql(p.FECHA_REQUERIDA),
  }));

  // Cambios a datos de clientes (Consultar > Cliente): uno por cliente + campo.
  // VALOR va con su tipo: número en los numéricos, texto en el resto ('' = vaciar el dato). FECHA identifica la versión: si se vuelve a editar mientras se envía,
  // el cambio nuevo queda pendiente.
  const filasCambio = await db.getAllAsync(
    `SELECT COD_CLT, CAMPO, RUTA, COD_CIA, TABLA, VALOR_ANTERIOR, VALOR_NUEVO, FECHA
       FROM CLIENTE_CAMBIO WHERE ENVIADO = 0
      ORDER BY FECHA`
  );
  const valorEnvio = (campo, v) => {
    const tipo = CAMPOS_CLIENTE[campo]?.tipo;
    if (v == null) return null;
    if (tipo === 'entero' || tipo === 'numero' || tipo === 'porcentaje') return numero(v);
    return v;
  };
  const cambiosCliente = filasCambio.map((c) => ({
    COD_CLT: c.COD_CLT,
    COD_CIA: c.COD_CIA,
    RUTA: c.RUTA || null,
    TABLA: c.TABLA,
    CAMPO: c.CAMPO,
    VALOR: valorEnvio(c.CAMPO, c.VALOR_NUEVO),
    VALOR_ANTERIOR: valorEnvio(c.CAMPO, c.VALOR_ANTERIOR),
    FECHA: fechaSql(c.FECHA),
  }));

  return {
    ubicaciones,
    visitas,
    pedidos,
    aprobaciones,
    notasCredito,
    inventarios,
    depositos,
    promocionales,
    cambiosCliente,
    consecutivos,
  };
}

// Envía todo lo pendiente y marca como enviado lo que el servidor guardó (ok, o duplicado de un envío
// anterior). Lo que falla queda pendiente con su ERROR_ENVIO.
// Devuelve { enviados, errores: [{ tipo, registro, error }] }; errores vacío = todo quedó en el servidor.
// Lanza ApiError si el request entero falla (sin red, timeout, 5xx, success: false): no se marca nada.
// solo: nombre de un arreglo (p. ej. 'cambiosCliente'), o lista de nombres, para enviar únicamente eso;
// el resto va vacío y queda pendiente para Datos > Enviar datos.
// Una nota de crédito o un inventario con conflicto de número (otro ya lo usa en el servidor) se
// renumera con el consecutivo y se reenvía solo una vez (reintento).
export async function enviarPendientes({ solo, reintento = false } = {}) {
  const db = await getDatabase();
  const datos = await leerPendientes(db);
  if (solo) {
    const permitidos = [].concat(solo);
    for (const k of Object.keys(datos)) if (!permitidos.includes(k)) datos[k] = [];
  }
  const total =
    datos.ubicaciones.length +
    datos.visitas.length +
    datos.pedidos.length +
    datos.aprobaciones.length +
    datos.notasCredito.length +
    datos.inventarios.length +
    datos.depositos.length +
    datos.promocionales.length +
    datos.cambiosCliente.length +
    datos.consecutivos.length;
  if (!total) return { enviados: 0, errores: [] };

  const json = await postJson(PATHS.syncEnviar, datos, { timeout: TIMEOUT_ENVIO_MS });
  const r = json?.result;
  const claves = ['ubicaciones', 'visitas', 'pedidos', 'aprobaciones', 'consecutivos'];
  if (datos.depositos.length) claves.push('depositos');
  // Como depositos: solo se exige en la respuesta si se mandó alguna (un backend sin promocionales
  // sigue funcionando mientras no haya solicitudes nuevas).
  if (datos.promocionales.length) claves.push('promocionales');
  if (datos.cambiosCliente.length) claves.push('cambiosCliente');
  if (datos.notasCredito.length) claves.push('notasCredito');
  if (datos.inventarios.length) claves.push('inventarios');
  if (!r || !claves.every((k) => Array.isArray(r[k]))) {
    throw new ApiError('La respuesta del servidor al envío no tiene el formato esperado.');
  }

  const ahora = toSqlLocal(new Date());
  const errores = [];
  let enviados = 0;
  // Notas de crédito e inventarios renumerados por conflicto ({ tipo, registro, error }), para avisar
  // si no se reenvían.
  const renumeradas = [];

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
    // Nota de crédito ok (o duplicado de un reenvío: el servidor no la sobrescribe) -> enviada.
    // conflicto -> su número ya lo usa otra NC: se renumera con el consecutivo y se reenvía.
    // error -> queda pendiente con el mensaje.
    // actualNotaCredito: consecutivo del servidor cuando ignoró el del equipo (el servidor va adelante).
    const actualServidor = (ruta) =>
      (r.consecutivos ?? []).find((c) => c?.RUTA === ruta && c?.ignoradoNotaCredito)?.actualNotaCredito ?? null;
    for (const [i, n] of datos.notasCredito.entries()) {
      const res = (r.notasCredito ?? [])[i];
      const { COD_CIA, COD_ZON, NUM_DEV, COD_CLT } = n.encabezado;
      const llave = [COD_CIA ?? '', COD_ZON, NUM_DEV];
      const where = 'COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?';
      const registro = `${NUM_DEV} (cliente ${COD_CLT})`;
      if (res?.ok) {
        await db.runAsync(
          `UPDATE alFAC_ENC_DEV SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL, DOC_PRO = COALESCE(DOC_PRO, 'N') WHERE ${where}`,
          [ahora, ...llave]
        );
        enviados += 1;
      } else if (res?.conflicto) {
        const nuevo = await renumerarNotaCredito(db, n.encabezado, actualServidor(COD_ZON));
        renumeradas.push({
          tipo: 'Nota de crédito',
          registro,
          error: `${res.error || 'El número ya está usado en el servidor'}. Se renumeró a ${nuevo}; vuelve a enviar.`,
        });
      } else {
        const error = res?.error || 'El servidor no devolvió resultado para este registro.';
        await db.runAsync(`UPDATE alFAC_ENC_DEV SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...llave]);
        errores.push({ tipo: 'Nota de crédito', registro, error });
      }
    }

    // Inventario ok (o ok + duplicado: ya estaba de un reenvío con el mismo cliente y HOR_INI) -> enviado.
    // conflicto -> ese NUM_INV ya existe en la ruta: se renumera con el consecutivo y se reenvía.
    // error -> queda pendiente con el mensaje.
    const actualInventario = (ruta) =>
      (r.consecutivos ?? []).find((c) => c?.RUTA === ruta && c?.ignoradoInventario)?.actualInventario ?? null;
    for (const [i, inv] of datos.inventarios.entries()) {
      const res = (r.inventarios ?? [])[i];
      const { COD_CIA, COD_ZON, NUM_INV, COD_CLT } = inv.encabezado;
      const llave = [COD_CIA ?? '', COD_ZON, NUM_INV];
      const where = 'COD_CIA = ? AND COD_ZON = ? AND NUM_INV = ?';
      const registro = `${NUM_INV} (cliente ${COD_CLT})`;
      if (res?.ok) {
        await db.runAsync(
          `UPDATE alFAC_ENC_INV SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL, DOC_PRO = COALESCE(DOC_PRO, 'N') WHERE ${where}`,
          [ahora, ...llave]
        );
        enviados += 1;
      } else if (res?.conflicto) {
        const nuevo = await renumerarInventario(db, inv.encabezado, actualInventario(COD_ZON));
        renumeradas.push({
          tipo: 'Inventario',
          registro,
          error: `${res.error || 'El número ya está usado en el servidor'}. Se renumeró a ${nuevo}; vuelve a enviar.`,
        });
      } else {
        const error = res?.error || 'El servidor no devolvió resultado para este registro.';
        await db.runAsync(`UPDATE alFAC_ENC_INV SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...llave]);
        errores.push({ tipo: 'Inventario', registro, error });
      }
    }

    // Depósito = una parte del recibo (una por cuenta, mismo NUM_DEP). El servidor responde una
    // entrada por parte; se empareja por CTA_BCO + NUM_DEP (y por posición solo si la respuesta no trae
    // esos datos). Parte ok (o duplicado de un envío anterior): queda enviada con su CONSEC_DEP. Una
    // parte con error queda pendiente con su mensaje; el recibo cuenta como enviado (marcarPagosEnviados)
    // solo cuando TODAS sus partes lo están.
    const mismoTexto = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
    const resultadoDeposito = (d, i) => {
      const lista = r.depositos ?? [];
      const porLlave = lista.find(
        (x) => mismoTexto(x?.CTA_BCO, d.encabezado.CTA_BCO) && mismoTexto(x?.NUM_DEP, d.encabezado.NUM_DEP)
      );
      if (porLlave) return porLlave;
      const enPosicion = lista[i];
      return enPosicion && enPosicion.CTA_BCO == null && enPosicion.NUM_DEP == null ? enPosicion : undefined;
    };
    const resultadosDeposito = datos.depositos.map(resultadoDeposito);
    await procesar(
      'Depósito',
      datos.depositos,
      resultadosDeposito,
      (d) => `Recibo ${d.encabezado.NUM_DEP} (cuenta ${d.encabezado.CTA_BCO})`,
      (d, error) => {
        const { COD_CIA, COD_BCO, CTA_BCO, NUM_DEP } = d.encabezado;
        const llave = [COD_CIA, COD_BCO, CTA_BCO, NUM_DEP];
        const where = 'COD_CIA = ? AND COD_BCO = ? AND CTA_BCO = ? AND NUM_DEP = ?';
        if (error) return db.runAsync(`UPDATE alCXC_ENC_DEP SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...llave]);
        const res = resultadosDeposito[datos.depositos.indexOf(d)];
        return db.runAsync(
          `UPDATE alCXC_ENC_DEP SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL, CONSEC_DEP = ? WHERE ${where}`,
          [ahora, res?.CONSEC_DEP ?? null, ...llave]
        );
      }
    );
    if (datos.depositos.length) await marcarPagosEnviados(db);
    // Promocional ok (o duplicado de un envío anterior): queda enviado con el ID del servidor.
    await procesar(
      'Promocional',
      datos.promocionales,
      r.promocionales ?? [],
      (p) => `Solicitud de ${p.CLIENTE} (${p.FECHA_SOLICITUD})`,
      (p, error) => {
        // FECHA_SOLICITUD siempre se guarda con hora: fechaSql no la cambia y sirve de llave tal cual.
        const where = 'CLIENTE = ? AND FECHA_SOLICITUD = ?';
        const llave = [p.CLIENTE, p.FECHA_SOLICITUD];
        if (error) return db.runAsync(`UPDATE PROMOCIONAL SET ERROR_ENVIO = ? WHERE ${where}`, [error, ...llave]);
        const res = r.promocionales?.[datos.promocionales.indexOf(p)];
        const id = Number.isInteger(Number(res?.ID)) && res?.ID != null ? Number(res.ID) : null;
        return db.runAsync(
          `UPDATE PROMOCIONAL SET ENVIADO = 1, FECHA_ENVIO = ?, ERROR_ENVIO = NULL, ID = COALESCE(?, ID) WHERE ${where}`,
          [ahora, id, ...llave]
        );
      }
    );
    await procesar(
      'Cambio de cliente',
      datos.cambiosCliente,
      r.cambiosCliente ?? [],
      (c) => `Cliente ${c.COD_CLT}: ${CAMPOS_CLIENTE[c.CAMPO]?.etiqueta ?? c.CAMPO}`,
      marcarEn('CLIENTE_CAMBIO', "COD_CLT = ? AND CAMPO = ? AND RUTA = ? AND FECHA = ?", (c) => [
        c.COD_CLT,
        c.CAMPO,
        c.RUTA ?? '',
        c.FECHA,
      ])
    );
    let consecutivosOk = true;
    await procesar(
      'Consecutivo',
      datos.consecutivos,
      r.consecutivos,
      (c) => `Ruta ${c.RUTA} (${[c.PEDIDO, c.FACTURA, c.RECIBO, c.NOTACREDITO, c.INVENTARIO].filter(Boolean).join(', ')})`,
      async (c, error) => {
        if (error) consecutivosOk = false;
      }
    );
    // Si el servidor ya iba más adelante en NOTACREDITO o INVENTARIO, el equipo continúa desde su número.
    for (const c of r.consecutivos ?? []) {
      if (c?.ok && c.ignoradoNotaCredito && c.actualNotaCredito && c.RUTA) {
        await adoptarConsecutivoServidor(db, c.RUTA, c.actualNotaCredito);
      }
      if (c?.ok && c.ignoradoInventario && c.actualInventario && c.RUTA) {
        await adoptarConsecutivoInventario(db, c.RUTA, c.actualInventario);
      }
    }
    if (datos.consecutivos.length && consecutivosOk) {
      await db.runAsync("DELETE FROM app_meta WHERE key = 'consecutivos_pendientes'");
    }
    // La renumeración deja otra vez el consecutivo por enviar.
    if (renumeradas.length) {
      await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
    }
  });

  // Reenvío inmediato de las NC e inventarios renumerados (con su consecutivo). Si falla, quedan pendientes.
  if (renumeradas.length) {
    if (reintento) return { enviados, errores: [...errores, ...renumeradas] };
    try {
      const otra = await enviarPendientes({ solo: ['notasCredito', 'inventarios', 'consecutivos'], reintento: true });
      return { enviados: enviados + otra.enviados, errores: [...errores, ...otra.errores] };
    } catch {
      return { enviados, errores: [...errores, ...renumeradas] };
    }
  }

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
  // Los cambios de clientes ya enviados vienen aplicados en la descarga de /fr/sync/clientes.
  await db.runAsync('DELETE FROM CLIENTE_CAMBIO WHERE ENVIADO = 1');
  await db.runAsync("DELETE FROM VISITA WHERE ENVIADO = 1 AND date(INICIO) < date('now', 'localtime')");
  await db.runAsync(
    `DELETE FROM VISITA_UBICACION
      WHERE NOT EXISTS (SELECT 1 FROM VISITA v
                         WHERE v.CLIENTE = VISITA_UBICACION.CLIENTE
                           AND v.RUTA = VISITA_UBICACION.RUTA
                           AND v.INICIO = VISITA_UBICACION.INICIO)`
  );
}
