import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';
import { ACTIVIDAD, anotarActividad, diaISO, quitarActividad } from './actividad';

// Tipo de documento de los subtipos que se ofrecen en el pedido (SUBTIPO_DOC.TIPO).
const TIPO_FACTURA = 'FAC';

// Documentos que se capturan con las pantallas de pedido. Mismo proceso y mismas tablas
// (alFAC_ENC_PED + alFAC_DET_PED); solo cambia TIP_DOC: 'F' = pedido, 'C' = cotización.
// El resto son los textos que muestran las pantallas.
export const TIPOS_PEDIDO = {
  pedido: { tipoDoc: 'F', titulo: 'Pedido', nombre: 'pedido', el: 'el pedido', del: 'del pedido', guardado: 'Pedido guardado' },
  cotizacion: {
    tipoDoc: 'C',
    titulo: 'Cotización',
    nombre: 'cotización',
    el: 'la cotización',
    del: 'de la cotización',
    guardado: 'Cotización guardada',
  },
};

// Datos para abrir un pedido: valores del cliente (CLIENTE_CIA, se descargan en Datos > Cargar
// datos desde /fr/sync/clientes) y los catálogos para elegirlos. Cada opción es
// { codigo, descripcion }; las divisiones llevan además `pais` (y `division1` municipios y distritos;
// los distritos también `division2`). Ver utils/divisiones.
// cliente.division1 = departamento, division2 = municipio y division3 = distrito.
// `cliente` es null si el cliente no tiene fila en CLIENTE_CIA.
// Nivel de precio: CLIENTE.NIVEL_PRECIO del cliente en la ruta (llega en /fr/sync/clientes).
export async function getDatosPedido(codigoCliente, ruta) {
  const db = await getDatabase();
  const cc = await db.getFirstAsync(
    `SELECT cc.COD_PAIS, cc.DIVISION_GEOGRAFICA1, cc.DIVISION_GEOGRAFICA2, cc.DIVISION_GEOGRAFICA3, cc.COD_CND,
            cc.SUBTIPODOC, cc.CODIGO, cc.IND_MON, cc.DESCUENTO, cc.POR_EXC_VT, cc.POR_EXC_CS, c.NIVEL_PRECIO,
            cc.COD_CIA, cc.LST_PRE, cc.DIR_EMB_DEFAULT
       FROM CLIENTE_CIA cc
       LEFT JOIN CLIENTE c ON c.COD_CLT = cc.COD_CLT AND c.COD_ZON = ?
      WHERE cc.COD_CLT = ?`,
    [ruta, codigoCliente]
  );

  // Divisiones (catálogos de Softland, utils/divisiones): departamentos, municipios y distritos.
  const [paises, divisiones1, municipios, distritos, condiciones, niveles, subtipos, actividades] = await Promise.all([
    db.getAllAsync(
      `SELECT COD_PAIS AS codigo, NOMBRE AS descripcion, ETIQUETA_DIV_GEO1 AS etiqueta1,
              ETIQUETA_DIV_GEO2 AS etiqueta2
         FROM alFAC_PAIS ORDER BY NOMBRE`
    ),
    db.getAllAsync(
      `SELECT PAIS AS pais, DIVISION_GEOGRAFICA1 AS codigo, NOMBRE AS descripcion
         FROM DIVISION_GEOGRAFICA1 ORDER BY NOMBRE`
    ),
    db.getAllAsync(
      `SELECT PAIS AS pais, DIVISION_GEOGRAFICA1 AS division1, DIVISION_GEOGRAFICA2 AS codigo, NOMBRE AS descripcion
         FROM DIVISION_GEOGRAFICA2 ORDER BY NOMBRE`
    ),
    db.getAllAsync(
      `SELECT PAIS AS pais, DIVISION_GEOGRAFICA1 AS division1, DIVISION_GEOGRAFICA2 AS division2,
              DIVISION_GEOGRAFICA3 AS codigo, NOMBRE AS descripcion
         FROM DIVISION_GEOGRAFICA3 ORDER BY NOMBRE`
    ),
    db.getAllAsync('SELECT COD_CND AS codigo, DES_CND AS descripcion FROM alFAC_CND_PAG ORDER BY DES_CND'),
    // El nivel se identifica por nombre (NIVEL_PRECIO); un nombre con varias monedas sale una vez.
    db.getAllAsync(
      'SELECT DISTINCT NIVEL_PRECIO AS codigo, NIVEL_PRECIO AS descripcion FROM NIVEL_LISTA ORDER BY NIVEL_PRECIO'
    ),
    db.getAllAsync(
      `SELECT DISTINCT SUBTIPO AS codigo, DESCRIPCION AS descripcion
         FROM SUBTIPO_DOC WHERE TRIM(TIPO) = ? ORDER BY SUBTIPO`,
      [TIPO_FACTURA]
    ),
    db.getAllAsync(
      'SELECT codigo, descripcion FROM ACTIVIDAD_COMERCIAL ORDER BY descripcion'
    ),
  ]);

  return {
    cliente: cc
      ? {
          pais: cc.COD_PAIS,
          division1: cc.DIVISION_GEOGRAFICA1,
          division2: cc.DIVISION_GEOGRAFICA2,
          division3: cc.DIVISION_GEOGRAFICA3,
          condicionPago: cc.COD_CND,
          nivelPrecio: cc.NIVEL_PRECIO,
          subtipo: cc.SUBTIPODOC,
          actividadComercial: cc.CODIGO,
          moneda: cc.IND_MON,
          descuento: cc.DESCUENTO ?? 0,
          exentoVentas: cc.POR_EXC_VT ?? 0,
          exentoConsumo: cc.POR_EXC_CS ?? 0,
          // Para guardar el pedido (alFAC_ENC_PED): compañía, lista (LST_PRE) y dirección de entrega.
          compania: cc.COD_CIA,
          lstPre: cc.LST_PRE,
          direccionEntrega: cc.DIR_EMB_DEFAULT,
        }
      : null,
    paises,
    divisiones1,
    municipios,
    distritos,
    condiciones,
    niveles,
    subtipos,
    actividades,
  };
}

// Campos obligatorios del encabezado (nombres para el aviso). valores: lo elegido en el encabezado.
export function faltantesEncabezado(valores) {
  return [
    [valores.pais, 'País'],
    [valores.condicionPago, 'Condición de pago'],
    [valores.nivelPrecio, 'Lista de precio'],
    [valores.subtipo, 'Subtipo de factura'],
  ]
    .filter(([v]) => !v)
    .map(([, nombre]) => nombre);
}

// Encabezado que recibe PedidoArticulosView. datos = getDatosPedido; valores = lo elegido en
// PedidoView (pais, division1, division2, division3, condicionPago, nivelPrecio, subtipo, actividadComercial,
// creditoFiscal, sugeridoVenta, inicio).
export function armarEncabezado(datos, valores) {
  const c = datos.cliente;
  return {
    pais: valores.pais,
    division1: valores.division1,
    // Municipio -> COD_GEO2 (como DIVISION_GEOGRAFICA2 del cliente). El distrito se elige en la
    // pantalla pero alFAC_ENC_PED no tiene columna para guardarlo.
    division2: valores.division2,
    division3: valores.division3 ?? null,
    condicionPago: valores.condicionPago,
    nivelPrecio: valores.nivelPrecio,
    subtipo: valores.subtipo,
    actividadComercial: valores.actividadComercial,
    // Moneda preferida para los precios de los artículos (IND_MON del cliente).
    moneda: c?.moneda ?? null,
    // Descuento general (%) y exenciones de impuesto de ventas y de consumo (%) del cliente (CLIENTE_CIA).
    descuento: c?.descuento ?? 0,
    exentoVentas: c?.exentoVentas ?? 0,
    exentoConsumo: c?.exentoConsumo ?? 0,
    creditoFiscal: Boolean(valores.creditoFiscal),
    sugeridoVenta: Boolean(valores.sugeridoVenta),
    // Para guardar el pedido.
    subtipoDescripcion: datos.subtipos.find((s) => s.codigo === valores.subtipo)?.descripcion ?? null,
    compania: c?.compania ?? null,
    lstPre: c?.lstPre ?? null,
    direccionEntrega: c?.direccionEntrega ?? null,
    inicio: valores.inicio,
  };
}

// Encabezado con los valores del cliente tal como los precarga PedidoView (documento Normal, sin
// sugerido de venta), para saltar esa pantalla (atajo desde Descuentos y promociones). Lanza un
// Error con lo que falta si el cliente no tiene los datos obligatorios.
export async function encabezadoPorDefecto(codigoCliente, ruta) {
  const datos = await getDatosPedido(codigoCliente, ruta);
  const c = datos.cliente;
  if (!c) {
    throw new Error('El cliente no tiene datos comerciales en la base local. Descarga los datos en Datos > Cargar datos.');
  }
  const valores = {
    pais: c.pais,
    division1: c.division1,
    division2: c.division2,
    division3: c.division3,
    condicionPago: c.condicionPago,
    nivelPrecio: c.nivelPrecio,
    subtipo: c.subtipo,
    actividadComercial: c.actividadComercial,
    creditoFiscal: false,
    sugeridoVenta: false,
    inicio: new Date(),
  };
  const faltan = faltantesEncabezado(valores);
  if (faltan.length) throw new Error(`El cliente no tiene: ${faltan.join(', ')}.`);
  return armarEncabezado(datos, valores);
}

// Siguiente consecutivo respetando el formato: prefijo + número con los mismos dígitos
// ('RP10001' -> 'RP10002', 'PR0500000302' -> 'PR0500000303').
export function siguienteConsecutivo(actual) {
  const m = /^(.*?)(\d+)$/.exec(String(actual ?? '').trim());
  if (!m) throw new Error(`El consecutivo "${actual ?? ''}" no termina en número.`);
  return m[1] + String(BigInt(m[2]) + 1n).padStart(m[2].length, '0');
}

// Fecha local a medianoche como texto SQL ('YYYY-MM-DD 00:00:00').
const soloFecha = (d) => toSqlLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate()));

export const COLUMNAS_ENC = [
  'COD_CIA', 'COD_ZON', 'COD_CLT', 'NUM_PED', 'COD_BOD', 'LST_PRE', 'COD_CND', 'CLASE', 'COD_PAIS',
  'NUM_ITM', 'DOC_PRO', 'ESTADO', 'TIP_DOC', 'DESCUENTO_CASCADA', 'IMPRESO', 'CONSIGNACION', 'DESC1',
  'DESC2', 'MONT_DESC1', 'MONT_DESC2', 'MON_DSC', 'MON_IMP_VT', 'MON_IMP_CS', 'MON_SIV', 'MON_CIV',
  'HOR_INI', 'HOR_FIN', 'FEC_PED', 'FEC_DES', 'OBS_PED', 'DIR_ENT', 'NIVEL_PRECIO', 'MONEDA',
  'COD_GEO1', 'COD_GEO2', 'ACTIVIDAD_COMERCIAL', 'SUBTIPO_DOC', 'SUBTIPO_DESCRIPCION',
];

export const COLUMNAS_DET = [
  'COD_CIA', 'NUM_PED', 'COD_ART', 'NUM_LN', 'CNT_MAX', 'CNT_MIN', 'MON_TOT', 'MON_DSC', 'LST_PRE',
  'MON_PRC_MX', 'MON_PRC_MN', 'POR_DSC_AP', 'ART_BON', 'PORC_IMPUESTO1', 'PORC_IMPUESTO2',
  'PORCENTAJE_IMP1', 'PORCENTAJE_IMP2', 'PORC_EXONERACION', 'MONTO_EXONERACION', 'ES_CANASTA_BASICA',
  'ES_OTRO_CARGO',
];

const insertar = (tabla, columnas) =>
  `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`;

// Montos con 6 decimales (evita arrastrar errores de coma flotante a la base).
const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

// Guarda un pedido nuevo en alFAC_ENC_PED + alFAC_DET_PED (SQLite local; se enviará al servidor
// después: ENVIADO = 0, DOC_PRO = 'N'). El número sale de RUTA_CONSECUT_RT de la ruta (PEDIDO para
// pedidos, FACTURA para cotizaciones: 'COTRT001'...) y, si todo se guarda, ese consecutivo avanza en 1.
// Todo en UNA transacción. Devuelve el número del documento.
//   ruta: código de la ruta del cliente (COD_ZON). bodega: bodega del ERP de la ruta activa.
//   encabezado: lo de PedidoView. lineas: las agregadas en PedidoArticulosView.
//   entrega: Date de entrega elegida. fin: Date en que se guarda (HOR_FIN).
//   notas: observaciones del pedido (OBS_PED; vacías = null).
//   tipoDoc: TIP_DOC ('F' pedido, 'C' cotización; ver TIPOS_PEDIDO). Cada uno con su consecutivo.
export async function guardarPedido({ ruta, cliente, bodega, encabezado, lineas, entrega, fin, notas, tipoDoc = 'F' }) {
  if (!lineas.length) throw new Error('El documento no tiene artículos.');
  const db = await getDatabase();
  const columna = tipoDoc === 'C' ? 'FACTURA' : 'PEDIDO';
  let numero = null;

  await db.withTransactionAsync(async () => {
    const consec = await db.getFirstAsync(`SELECT ${columna} AS ACTUAL FROM RUTA_CONSECUT_RT WHERE RUTA = ?`, [ruta]);
    if (!String(consec?.ACTUAL ?? '').trim()) {
      const de = tipoDoc === 'C' ? 'cotización (FACTURA)' : 'pedido';
      throw new Error(`La ruta ${ruta} no tiene consecutivo de ${de}. Descárgalo en Datos > Cargar datos.`);
    }
    numero = String(consec.ACTUAL).trim();
    const existe = await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_PED WHERE COD_ZON = ? AND NUM_PED = ?', [
      ruta,
      numero,
    ]);
    if (existe) throw new Error(`Ya existe un documento con el número ${numero} en la ruta ${ruta}.`);

    const suma = (campo) => lineas.reduce((s, l) => s + l[campo], 0);
    const descuento = suma('descuento');
    const iva = suma('iva');
    const oi = suma('oi');
    const sinIva = suma('subtotal') - descuento;
    const cia = encabezado.compania ?? null;
    const lstPre = encabezado.lstPre ?? 0;

    const enc = {
      COD_CIA: cia,
      COD_ZON: ruta,
      COD_CLT: cliente,
      NUM_PED: numero,
      COD_BOD: bodega || 'ND',
      LST_PRE: lstPre,
      COD_CND: encabezado.condicionPago,
      CLASE: 'F',
      COD_PAIS: encabezado.pais,
      NUM_ITM: lineas.length,
      // 'N' = aún no procesado; el backend lo usa en otro proceso (no debe ir null).
      DOC_PRO: 'N',
      ESTADO: 'P',
      TIP_DOC: tipoDoc,
      DESCUENTO_CASCADA: 'N',
      IMPRESO: 'N',
      CONSIGNACION: 'N',
      DESC1: 0,
      DESC2: 0,
      MONT_DESC1: 0,
      MONT_DESC2: 0,
      MON_DSC: r6(descuento),
      MON_IMP_VT: r6(iva),
      MON_IMP_CS: r6(oi),
      MON_SIV: r6(sinIva),
      MON_CIV: r6(sinIva + iva + oi),
      HOR_INI: toSqlLocal(encabezado.inicio ?? fin),
      HOR_FIN: toSqlLocal(fin),
      FEC_PED: soloFecha(fin),
      FEC_DES: soloFecha(entrega),
      OBS_PED: String(notas ?? '').trim() || null,
      DIR_ENT: String(encabezado.direccionEntrega ?? '').trim() || 'ND',
      NIVEL_PRECIO: encabezado.nivelPrecio,
      MONEDA: lineas[0].moneda ?? encabezado.moneda ?? null,
      COD_GEO1: encabezado.division1 ?? null,
      COD_GEO2: encabezado.division2 ?? null,
      ACTIVIDAD_COMERCIAL: encabezado.actividadComercial ?? null,
      SUBTIPO_DOC: encabezado.subtipo ?? null,
      SUBTIPO_DESCRIPCION: encabezado.subtipoDescripcion ?? null,
    };
    await db.runAsync(insertar('alFAC_ENC_PED', COLUMNAS_ENC), COLUMNAS_ENC.map((c) => enc[c]));

    for (const [i, l] of lineas.entries()) {
      const det = {
        COD_CIA: cia,
        NUM_PED: numero,
        COD_ART: l.codigo,
        NUM_LN: i + 1,
        CNT_MAX: l.almacen,
        CNT_MIN: l.detalle,
        MON_TOT: r6(l.subtotal),
        MON_DSC: r6(l.descuento),
        LST_PRE: lstPre,
        MON_PRC_MX: r6(l.precio),
        MON_PRC_MN: r6(l.precio / (l.factorVenta || 1)),
        POR_DSC_AP: r6(l.porcDescuento),
        // '1' = artículo regalado por una promoción tipo 'B' (va a precio 0); '0' = comprado.
        ART_BON: l.bonificado ? '1' : '0',
        PORC_IMPUESTO1: String(l.impuesto1 ?? 0),
        PORC_IMPUESTO2: String(l.impuesto2 ?? 0),
        PORCENTAJE_IMP1: l.impuesto1 ?? 0,
        PORCENTAJE_IMP2: l.impuesto2 ?? 0,
        PORC_EXONERACION: encabezado.exentoVentas ?? 0,
        MONTO_EXONERACION: r6(l.exoneracion),
        ES_CANASTA_BASICA: l.canastaBasica ? 'S' : 'N',
        ES_OTRO_CARGO: l.esOtroCargo ?? null,
      };
      await db.runAsync(insertar('alFAC_DET_PED', COLUMNAS_DET), COLUMNAS_DET.map((c) => det[c]));
    }

    // Bitácora del reporte Mi día (no se borra al cargar datos).
    await anotarActividad(db, {
      tipo: tipoDoc === 'C' ? ACTIVIDAD.cotizacion : ACTIVIDAD.pedido,
      clave: `${ruta}|${numero}`,
      fecha: fin,
      cliente,
      ruta,
      documento: numero,
      monto: r6(sinIva + iva + oi),
      detalle: { articulos: lineas.length, moneda: lineas[0]?.moneda ?? null },
    });

    await db.runAsync(`UPDATE RUTA_CONSECUT_RT SET ${columna} = ? WHERE RUTA = ?`, [siguienteConsecutivo(numero), ruta]);
    // El consecutivo nuevo también debe llegar al servidor (ver services/enviarDatos).
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  });

  return numero;
}

// Cotizaciones (TIP_DOC 'C') del cliente en la ruta: las capturadas en el equipo y las descargadas
// del servidor en Datos > Cargar datos (/fr/sync/cotizaciones). Las más recientes primero.
export async function getCotizacionesCliente(cliente, ruta) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, NUM_PED, FEC_PED, FEC_DES, NUM_ITM, MON_DSC, MON_SIV, MON_IMP_VT, MON_IMP_CS, MON_CIV,
            MONEDA, ENVIADO
       FROM alFAC_ENC_PED
      WHERE COD_CLT = ? AND COD_ZON = ? AND TIP_DOC = 'C'
      ORDER BY FEC_PED DESC, NUM_PED DESC`,
    [cliente, ruta]
  );
  return filas.map((r) => ({
    compania: r.COD_CIA,
    numero: r.NUM_PED,
    fecha: r.FEC_PED,
    entrega: r.FEC_DES,
    articulos: r.NUM_ITM ?? 0,
    descuento: r.MON_DSC ?? 0,
    sinIva: r.MON_SIV ?? 0,
    iva: r.MON_IMP_VT ?? 0,
    oi: r.MON_IMP_CS ?? 0,
    total: r.MON_CIV ?? 0,
    moneda: r.MONEDA,
    // false = solo está en el equipo (falta Enviar Datos); su PDF se arma en el equipo.
    enviada: r.ENVIADO === 1,
  }));
}

// Pedidos (tipoDoc 'F') o cotizaciones ('C') del cliente en la ruta que están en el equipo, los más
// recientes primero. Pedidos: los capturados aquí (y las cotizaciones aprobadas) desde el último
// "Cargar datos", que borra los ya enviados. Cotizaciones: además, las descargadas del servidor.
// enviado: true = ya está en el servidor.
export async function getDocumentosEquipoCliente(cliente, ruta, tipoDoc = 'F') {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, NUM_PED, FEC_PED, FEC_DES, HOR_FIN, NUM_ITM, MON_CIV, MONEDA, ENVIADO, ERROR_ENVIO
       FROM alFAC_ENC_PED
      WHERE COD_CLT = ? AND COD_ZON = ? AND TIP_DOC = ?
      ORDER BY FEC_PED DESC, HOR_FIN DESC, NUM_PED DESC`,
    [cliente, ruta, tipoDoc]
  );
  return filas.map((r) => ({
    compania: r.COD_CIA,
    numero: r.NUM_PED,
    fecha: r.FEC_PED,
    entrega: r.FEC_DES,
    hora: r.HOR_FIN,
    articulos: r.NUM_ITM ?? 0,
    total: r.MON_CIV ?? 0,
    moneda: r.MONEDA,
    enviado: r.ENVIADO === 1,
    errorEnvio: r.ERROR_ENVIO ?? null,
  }));
}

// Todo lo que lleva el PDF del pedido / cotización, leído de la base local (mismos datos que arma el
// backend en controllers/fr/cotizacionPdf.js). null si el documento ya no está en el equipo (se borra
// en Cargar datos una vez enviado). ruta: COD_ZON. numero: NUM_PED.
//   { encabezado: fila de alFAC_ENC_PED + NOM_CLT, DIR_CLT, NOM_CTO, NUM_TEL, RUTA_DESCRIPCION, DES_CND,
//                 DETA_EMB,
//     lineas: [fila de alFAC_DET_PED + DES_ART] por NUM_LN,
//     lotesPorArticulo: Map COD_ART -> [{ lote, vence ('YYYY-MM-DD...') }] (lotes con existencia en
//                       COD_BOD, el que vence primero va primero),
//     empresa: fila de EMPRESA o null }
export async function getDocumentoPdf(ruta, numero) {
  const db = await getDatabase();
  const encabezado = await db.getFirstAsync(
    `SELECT P.*,
            (SELECT C.NOM_CLT FROM CLIENTE C WHERE C.COD_CLT = P.COD_CLT ORDER BY C.COD_ZON = P.COD_ZON DESC LIMIT 1) AS NOM_CLT,
            (SELECT C.DIR_CLT FROM CLIENTE C WHERE C.COD_CLT = P.COD_CLT ORDER BY C.COD_ZON = P.COD_ZON DESC LIMIT 1) AS DIR_CLT,
            (SELECT CC.NOM_CTO FROM CLIENTE_CIA CC WHERE CC.COD_CLT = P.COD_CLT LIMIT 1) AS NOM_CTO,
            (SELECT CC.NUM_TEL FROM CLIENTE_CIA CC WHERE CC.COD_CLT = P.COD_CLT LIMIT 1) AS NUM_TEL,
            (SELECT R.DESCRIPCION FROM RUTA_RT R WHERE R.RUTA = P.COD_ZON LIMIT 1) AS RUTA_DESCRIPCION,
            (SELECT CP.DES_CND FROM alFAC_CND_PAG CP WHERE CP.COD_CND = P.COD_CND LIMIT 1) AS DES_CND,
            (SELECT DE.DETA_EMB FROM alFAC_DIR_EMB_CLT DE
              WHERE DE.COD_CLT = P.COD_CLT AND DE.DIR_EMB = P.DIR_ENT LIMIT 1) AS DETA_EMB,
            -- Cotización aprobada en el equipo sin enviar: en el servidor todavía es cotización.
            EXISTS (SELECT 1 FROM COTIZACION_APROBACION A
                     WHERE A.COD_ZON = P.COD_ZON AND A.NUM_PED = P.NUM_PED AND A.ENVIADO = 0) AS APROBACION_PENDIENTE
       FROM alFAC_ENC_PED P
      WHERE P.COD_ZON = ? AND P.NUM_PED = ?`,
    [ruta, numero]
  );
  if (!encabezado) return null;

  // alFAC_DET_PED no tiene COD_ZON: se une por compañía y número (COD_CIA puede venir null).
  const [lineas, lotes, empresa] = await Promise.all([
    db.getAllAsync(
      `SELECT D.*, (SELECT A.DES_ART FROM ARTICULO A WHERE A.COD_ART = D.COD_ART LIMIT 1) AS DES_ART
         FROM alFAC_DET_PED D
        WHERE D.NUM_PED = ? AND D.COD_CIA IS ?
        ORDER BY D.NUM_LN`,
      [numero, encabezado.COD_CIA]
    ),
    // Un lote en varias localizaciones de la bodega sale una vez (solo si suma existencia).
    db.getAllAsync(
      `SELECT ARTICULO, LOTE, FECHA_VENCIMIENTO
         FROM ARTICULO_EXISTENCIA_LOTE
        WHERE BODEGA = ?
          AND ARTICULO IN (SELECT COD_ART FROM alFAC_DET_PED WHERE NUM_PED = ? AND COD_CIA IS ?)
        GROUP BY ARTICULO, LOTE, FECHA_VENCIMIENTO
       HAVING SUM(EXISTENCIA) > 0
        ORDER BY ARTICULO, FECHA_VENCIMIENTO, LOTE`,
      [encabezado.COD_BOD, numero, encabezado.COD_CIA]
    ),
    db.getFirstAsync('SELECT * FROM EMPRESA LIMIT 1'),
  ]);

  const lotesPorArticulo = new Map();
  for (const l of lotes) {
    if (!lotesPorArticulo.has(l.ARTICULO)) lotesPorArticulo.set(l.ARTICULO, []);
    lotesPorArticulo.get(l.ARTICULO).push({ lote: l.LOTE, vence: l.FECHA_VENCIMIENTO });
  }
  return { encabezado, lineas, lotesPorArticulo, empresa: empresa ?? null };
}

// Compañía del cliente (CLIENTE_CIA.COD_CIA), para pedir al servidor el PDF de un documento que ya no
// está en el equipo. null si no se conoce.
export async function getCompaniaCliente(cliente) {
  const db = await getDatabase();
  const fila = await db.getFirstAsync('SELECT COD_CIA FROM CLIENTE_CIA WHERE COD_CLT = ? LIMIT 1', [cliente]);
  return fila?.COD_CIA ?? null;
}

// Aprueba una cotización: pasa a pedido (TIP_DOC 'F') con FEC_PED = día de aprobación y FEC_DES =
// entrega elegida. Conserva su NUM_PED (no usa consecutivo). Además deja la aprobación pendiente en
// COTIZACION_APROBACION para el servidor; se manda siempre, aunque la cotización aún no se haya
// enviado: el servidor procesa pedidos antes que aprobaciones y responde duplicado si ya es 'F'.
//   ruta: COD_ZON. numero: NUM_PED. entrega: Date elegida. fecha: Date de aprobación.
export async function aprobarCotizacion({ ruta, numero, entrega, fecha }) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const enc = await db.getFirstAsync('SELECT COD_CIA, TIP_DOC, COD_CLT, MON_CIV FROM alFAC_ENC_PED WHERE COD_ZON = ? AND NUM_PED = ?', [
      ruta,
      numero,
    ]);
    if (!enc) throw new Error(`No se encontró la cotización ${numero} en la ruta ${ruta}.`);
    if (enc.TIP_DOC !== 'C') throw new Error(`El documento ${numero} ya no es una cotización.`);

    const fecPed = soloFecha(fecha);
    const fecDes = soloFecha(entrega);
    await db.runAsync(
      "UPDATE alFAC_ENC_PED SET TIP_DOC = 'F', FEC_PED = ?, FEC_DES = ? WHERE COD_ZON = ? AND NUM_PED = ?",
      [fecPed, fecDes, ruta, numero]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO COTIZACION_APROBACION (COD_CIA, COD_ZON, NUM_PED, FEC_PED, FEC_DES, ENVIADO)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [enc.COD_CIA, ruta, numero, fecPed, fecDes]
    );
    await anotarActividad(db, {
      tipo: ACTIVIDAD.aprobacion,
      clave: `${ruta}|${numero}`,
      fecha,
      cliente: enc.COD_CLT,
      ruta,
      documento: numero,
      monto: enc.MON_CIV,
    });
  });
}

// Anulación de pedidos y cotizaciones del día (Validar cliente > Anular pedido / Anular cotización).
// Cada tipo usa su propio consecutivo de RUTA_CONSECUT_RT (PEDIDO o FACTURA, igual que guardarPedido).
const ANULACION = {
  F: {
    columna: 'PEDIDO',
    actividad: ACTIVIDAD.pedido,
    doc: TIPOS_PEDIDO.pedido,
    ultimo: 'Solo se puede anular el último pedido',
    notasVisita: 'Pedido anulado',
  },
  C: {
    columna: 'FACTURA',
    actividad: ACTIVIDAD.cotizacion,
    doc: TIPOS_PEDIDO.cotizacion,
    ultimo: 'Solo se puede anular la última cotización',
    notasVisita: 'Cotización anulada',
  },
};

const anulacionDe = (tipoDoc) => {
  const a = ANULACION[tipoDoc];
  if (!a) throw new Error(`Tipo de documento desconocido: ${tipoDoc}.`);
  return a;
};

// Motivo por el que un documento del día no se puede anular (null = se puede). El consecutivo de la
// ruta solo se puede regresar uno sin repetir números si el documento es el último que lo usó:
// su número + 1 = consecutivo actual. Por eso se anulan del más reciente hacia atrás.
function motivoNoAnulable(r, actual, a) {
  if (r.ENVIADO === 1) return 'Ya se envió al servidor';
  if (r.APROBADA) return 'Viene de una cotización aprobada';
  let siguiente = null;
  try {
    siguiente = siguienteConsecutivo(r.NUM_PED);
  } catch {
    // número sin parte numérica: no se puede regresar el consecutivo
  }
  if (!actual || siguiente !== actual) return a.ultimo;
  return null;
}

const consecutivoActual = async (db, ruta, a) =>
  String((await db.getFirstAsync(`SELECT ${a.columna} AS ACTUAL FROM RUTA_CONSECUT_RT WHERE RUTA = ?`, [ruta]))?.ACTUAL ?? '').trim();

// Documentos del tipo (TIP_DOC 'F' pedido | 'C' cotización) que están en el equipo con fecha de hoy en
// la ruta, los más recientes primero. Cada uno trae `anulable` y, si no lo es, `motivo`.
export async function getDocumentosDelDia(ruta, tipoDoc, fecha = new Date()) {
  const a = anulacionDe(tipoDoc);
  const db = await getDatabase();
  const actual = await consecutivoActual(db, ruta, a);
  const filas = await db.getAllAsync(
    `SELECT e.COD_CIA, e.NUM_PED, e.COD_CLT, e.HOR_FIN, e.NUM_ITM, e.MON_CIV, e.MONEDA, e.ENVIADO,
            (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(e.COD_CLT)) AS NOM_CLT,
            EXISTS (SELECT 1 FROM COTIZACION_APROBACION a WHERE a.COD_ZON = e.COD_ZON AND a.NUM_PED = e.NUM_PED) AS APROBADA
       FROM alFAC_ENC_PED e
      WHERE e.COD_ZON = ? AND e.TIP_DOC = ? AND substr(e.FEC_PED, 1, 10) = ?
      ORDER BY e.HOR_FIN DESC, e.NUM_PED DESC`,
    [ruta, tipoDoc, diaISO(fecha)]
  );
  return filas.map((r) => {
    const motivo = motivoNoAnulable(r, actual, a);
    return {
      compania: r.COD_CIA,
      numero: r.NUM_PED,
      cliente: r.COD_CLT,
      nombreCliente: r.NOM_CLT ?? r.COD_CLT,
      hora: r.HOR_FIN,
      articulos: r.NUM_ITM ?? 0,
      total: r.MON_CIV ?? 0,
      moneda: r.MONEDA,
      enviado: r.ENVIADO === 1,
      anulable: !motivo,
      motivo,
    };
  });
}

// Anula (borra del equipo) un pedido o cotización que aún no se envió y regresa el consecutivo de su
// tipo en la ruta a su número, para que el próximo documento lo vuelva a usar. Quita también su
// registro del reporte Mi día. La visita que se registró sola al guardarlo (notas '<Tipo> <número>',
// ver ClientesScreen) pasa al estado "Sin necesidad de compra" (EFECT_VISITA_RT) con notas
// "Pedido anulado" / "Cotización anulada"; si en esa visita se hizo antes otro documento, sus notas
// son otras y la visita no se toca.
// Devuelve { visitaActualizada } (false si no se encontró la visita o el estado).
export async function anularDocumento({ ruta, numero, tipoDoc }) {
  const a = anulacionDe(tipoDoc);
  const db = await getDatabase();
  let visitaActualizada = false;
  await db.withTransactionAsync(async () => {
    const enc = await db.getFirstAsync(
      `SELECT e.COD_CIA, e.NUM_PED, e.TIP_DOC, e.ENVIADO, e.COD_CLT,
              EXISTS (SELECT 1 FROM COTIZACION_APROBACION a WHERE a.COD_ZON = e.COD_ZON AND a.NUM_PED = e.NUM_PED) AS APROBADA
         FROM alFAC_ENC_PED e WHERE e.COD_ZON = ? AND e.NUM_PED = ?`,
      [ruta, numero]
    );
    if (!enc || enc.TIP_DOC !== tipoDoc) throw new Error(`No se encontró ${a.doc.el} ${numero} en la ruta ${ruta}.`);
    const motivo = motivoNoAnulable(enc, await consecutivoActual(db, ruta, a), a);
    if (motivo) throw new Error(`${motivo}: no se puede anular ${a.doc.el} ${numero}.`);

    // alFAC_DET_PED no tiene COD_ZON: se borra por compañía y número (COD_CIA puede venir null).
    await db.runAsync('DELETE FROM alFAC_DET_PED WHERE NUM_PED = ? AND COD_CIA IS ?', [numero, enc.COD_CIA]);
    await db.runAsync('DELETE FROM alFAC_ENC_PED WHERE COD_ZON = ? AND NUM_PED = ?', [ruta, numero]);
    await quitarActividad(db, a.actividad, `${ruta}|${numero}`);

    // Visita del documento (aún sin enviar) -> "Sin necesidad de compra" + notas de anulación.
    const estado = await db.getFirstAsync(
      `SELECT EFECT_VISITA FROM EFECT_VISITA_RT
        WHERE UPPER(DESCRIPCION) LIKE '%NECESIDAD%COMPRA%' ORDER BY EFECT_VISITA LIMIT 1`
    );
    if (estado) {
      const res = await db.runAsync(
        `UPDATE VISITA SET RAZON = ?, NOTAS = ?
          WHERE CLIENTE = ? AND RUTA = ? AND NOTAS = ? AND ENVIADO = 0`,
        [String(estado.EFECT_VISITA), a.notasVisita, enc.COD_CLT, ruta, `${a.doc.titulo} ${numero}`]
      );
      visitaActualizada = res.changes > 0;
    }

    // Consecutivo - 1: vuelve al número del documento anulado (el próximo lo reutiliza).
    await db.runAsync(`UPDATE RUTA_CONSECUT_RT SET ${a.columna} = ? WHERE RUTA = ?`, [String(enc.NUM_PED).trim(), ruta]);
    // El consecutivo corregido también debe llegar al servidor (ver services/enviarDatos).
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  });
  return { visitaActualizada };
}
