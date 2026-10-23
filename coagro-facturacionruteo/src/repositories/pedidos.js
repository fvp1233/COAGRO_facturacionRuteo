import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';

// Tipo de documento de los subtipos que se ofrecen en el pedido (SUBTIPO_DOC.TIPO).
const TIPO_FACTURA = 'FAC';

// Datos para abrir un pedido: valores del cliente (CLIENTE_CIA, se descargan en Datos > Cargar
// datos desde /fr/sync/clientesCia) y los catálogos para elegirlos. Cada opción es
// { codigo, descripcion }; las de región llevan además `pais` (y `division1` las de región 2).
// `cliente` es null si el cliente no tiene fila en CLIENTE_CIA.
// Nivel de precio: CLIENTE.NIVEL_PRECIO del cliente en la ruta (llega en /fr/sync/clientes).
export async function getDatosPedido(codigoCliente, ruta) {
  const db = await getDatabase();
  const cc = await db.getFirstAsync(
    `SELECT cc.COD_PAIS, cc.DIVISION_GEOGRAFICA1, cc.DIVISION_GEOGRAFICA2, cc.COD_CND,
            cc.SUBTIPODOC, cc.CODIGO, cc.IND_MON, cc.DESCUENTO, cc.POR_EXC_VT, cc.POR_EXC_CS, c.NIVEL_PRECIO,
            cc.COD_CIA, cc.LST_PRE, cc.DIR_EMB_DEFAULT
       FROM CLIENTE_CIA cc
       LEFT JOIN CLIENTE c ON c.COD_CLT = cc.COD_CLT AND c.COD_ZON = ?
      WHERE cc.COD_CLT = ?`,
    [ruta, codigoCliente]
  );

  const [paises, divisiones1, divisiones2, condiciones, niveles, subtipos, actividades] = await Promise.all([
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
      `SELECT PAIS AS pais, DIVISION_GEOGRAFICA1 AS division1, DIVISION_GEOGRAFICA2 AS codigo,
              NOMBRE AS descripcion
         FROM DIVISION_GEOGRAFICA2 ORDER BY NOMBRE`
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
    divisiones2,
    condiciones,
    niveles,
    subtipos,
    actividades,
  };
}

// Siguiente consecutivo respetando el formato: prefijo + número con los mismos dígitos
// ('RP10001' -> 'RP10002', 'PR0500000302' -> 'PR0500000303').
export function siguienteConsecutivo(actual) {
  const m = /^(.*?)(\d+)$/.exec(String(actual ?? '').trim());
  if (!m) throw new Error(`El consecutivo de pedido "${actual ?? ''}" no termina en número.`);
  return m[1] + String(BigInt(m[2]) + 1n).padStart(m[2].length, '0');
}

// Fecha local a medianoche como texto SQL ('YYYY-MM-DD 00:00:00').
const soloFecha = (d) => toSqlLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate()));

const COLUMNAS_ENC = [
  'COD_CIA', 'COD_ZON', 'COD_CLT', 'NUM_PED', 'COD_BOD', 'LST_PRE', 'COD_CND', 'CLASE', 'COD_PAIS',
  'NUM_ITM', 'DOC_PRO', 'ESTADO', 'TIP_DOC', 'DESCUENTO_CASCADA', 'IMPRESO', 'CONSIGNACION', 'DESC1',
  'DESC2', 'MONT_DESC1', 'MONT_DESC2', 'MON_DSC', 'MON_IMP_VT', 'MON_IMP_CS', 'MON_SIV', 'MON_CIV',
  'HOR_INI', 'HOR_FIN', 'FEC_PED', 'FEC_DES', 'OBS_PED', 'DIR_ENT', 'NIVEL_PRECIO', 'MONEDA',
  'COD_GEO1', 'COD_GEO2', 'ACTIVIDAD_COMERCIAL', 'SUBTIPO_DOC', 'SUBTIPO_DESCRIPCION',
];

const COLUMNAS_DET = [
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
// después: DOC_PRO = NULL). El número sale de RUTA_CONSECUT_RT.PEDIDO de la ruta y, si todo se
// guarda, el consecutivo avanza en 1. Todo en UNA transacción. Devuelve el número de pedido.
//   ruta: código de la ruta del cliente (COD_ZON). bodega: bodega del ERP de la ruta activa.
//   encabezado: lo de PedidoView. lineas: las agregadas en PedidoArticulosView.
//   entrega: Date de entrega elegida. fin: Date en que se guarda (HOR_FIN).
export async function guardarPedido({ ruta, cliente, bodega, encabezado, lineas, entrega, fin }) {
  if (!lineas.length) throw new Error('El pedido no tiene artículos.');
  const db = await getDatabase();
  let numero = null;

  await db.withTransactionAsync(async () => {
    const consec = await db.getFirstAsync('SELECT PEDIDO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [ruta]);
    if (!consec?.PEDIDO) {
      throw new Error(`La ruta ${ruta} no tiene consecutivo de pedido. Descárgalo en Datos > Cargar datos.`);
    }
    numero = String(consec.PEDIDO).trim();
    const existe = await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_PED WHERE COD_ZON = ? AND NUM_PED = ?', [
      ruta,
      numero,
    ]);
    if (existe) throw new Error(`Ya existe un pedido con el número ${numero} en la ruta ${ruta}.`);

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
      DOC_PRO: null,
      ESTADO: 'P',
      TIP_DOC: 'FAC',
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
      OBS_PED: null,
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
        ART_BON: '0',
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

    await db.runAsync('UPDATE RUTA_CONSECUT_RT SET PEDIDO = ? WHERE RUTA = ?', [siguienteConsecutivo(numero), ruta]);
    // El consecutivo nuevo también debe llegar al servidor (ver services/enviarDatos).
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  });

  return numero;
}
