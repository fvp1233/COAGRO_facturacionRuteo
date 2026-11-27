import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';
import { siguienteConsecutivo } from './pedidos';

// Notas de crédito (NC, DTE 05 de Hacienda) sobre un Comprobante de Crédito Fiscal (CCF, DTE 03).
// Las crea SOLO el equipo (sin conexión) en alFAC_ENC_DEV + alFAC_DET_DEV; se suben en
// POST /fr/sync/enviar (notasCredito[], services/enviarDatos) y se descargan con
// GET /fr/sync/notasCredito (services/syncNotasCredito). El número (NUM_DEV) es el consecutivo
// RUTA_CONSECUT_RT.NOTACREDITO de la ruta, que avanza aquí igual que PEDIDO y RECIBO.
//
// El equipo valida al guardar (y la pantalla antes); el servidor vuelve a validar al recibir:
//   1. NUM_REF es un CCF real del cliente: factura del historial (HISTORIAL_FAC_ENC) del mismo
//      COD_CLT, no anulada, cuyo NUM_FAC es el número de control de Hacienda tipo 03 ('DTE-03-...').
//      El NCF del historial viene VACÍO: el número del DTE está en NUM_FAC (NUM_REF = NCFMODIFICADO = NUM_FAC).
//      Es lo único que marca el crédito fiscal: Hacienda solo emite DTE-03 a contribuyentes. No se mira
//      CLIENTE_CIA.TIPO_CONTRIBUYENTE (en el ERP no indica de forma confiable quién es contribuyente).
//   2. Lo acreditado no supera lo facturado: por artículo, cantidad <= CANT_FAC - CANT_DEV (lo que el
//      ERP ya registró como devuelto) - lo de las NC de ese CCF que aún no procesa oficina (las del
//      equipo sin enviar y las enviadas con DOC_PRO 'N'). Se supone que las ya procesadas están en CANT_DEV.
//      Solo en devolución (01). En 02, 03 y 99 (una línea '00000' por monto): total con IVA <= total del
//      CCF - las NC de ese CCF que hay en el equipo (ver leerMontoCcf).

// Valores que usa la app (para documentar en el backend).
// EST_DEV del encabezado: 'A' = activa (la app no anula NC; no usa otro valor).
export const EST_DEV_ACTIVA = 'A';
// TIPO del encabezado: tipo de documento de CxC de una nota de crédito en Exactus.
export const TIPO_NC = 'N/C';
// IND_DEV de la línea: estado de lo que se acredita.
//   'B' = devolución, mercadería en buen estado (vuelve al inventario)
//   'M' = devolución, mercadería en mal estado (no se reintegra)
//   'P' = sin devolución física: rebaja / corrección de precio u otro motivo (solo monto)
export const IND_DEV = { bueno: 'B', malo: 'M', precio: 'P' };
// ART_BON de la línea: '0' = artículo vendido. Las líneas bonificadas del CCF (EST_BON 'B') no se
// acreditan desde la app, así que hoy nunca se manda '1' (bonificación).
export const ART_BON_VENTA = '0';
// COD_MODIFICACION (motivo) del encabezado; RAZON_MODIF lleva el texto que escribe el vendedor.
// devolucion: true = se devuelve mercadería por artículo del CCF, a su precio (IND_DEV 'B' / 'M').
// false (02, 03, 99) = NO se usan los artículos: la NC lleva UNA línea base (COD_ART '00000', IND_DEV 'P')
//   cuya descripción (OBS_DEV de la línea) es la razón y cuyo monto escribe el vendedor CON IVA
//   incluido; no puede pasar de lo que queda del CCF (ver getMontoCcf / calcularMontoNC).
export const MOTIVOS_NC = [
  { codigo: '01', descripcion: 'Devolución de mercadería', devolucion: true },
  { codigo: '02', descripcion: 'Rebaja de precio', devolucion: false, razonObligatoria: true },
  { codigo: '03', descripcion: 'Corrección de precio', devolucion: false, razonObligatoria: true },
  { codigo: '99', descripcion: 'Otro motivo', devolucion: false, razonObligatoria: true },
];
export const motivoNC = (codigo) => MOTIVOS_NC.find((m) => m.codigo === codigo) ?? null;
// Línea base de las NC por monto (02, 03, 99).
export const CODIGO_LINEA_MONTO = '00000';
// Largo de la razón en las NC por monto: también es la descripción de la línea (OBS_DEV, 80).
export const LARGO_RAZON_MONTO = 80;
// IVA cuando no se puede saber del CCF (sin líneas en el equipo).
const TASA_IVA_DEFECTO = 13;

// CCF = factura cuyo NUM_FAC es el número de control de Hacienda tipo 03 ('DTE-01-' es consumidor
// final y no admite NC). El campo NCF del historial viene vacío: no se usa.
const PREFIJO_CCF = 'DTE-03-';
export const esNumeroCcf = (numero) => String(numero ?? '').trim().toUpperCase().startsWith(PREFIJO_CCF);

// Largos de las columnas de texto en el servidor: un texto más largo se RECHAZA (no se recorta).
export const LARGOS_ENC = {
  NUM_DEV: 50, COD_CIA: 10, COD_ZON: 4, COD_CLT: 20, OBS_DEV: 80, EST_DEV: 1, COD_BOD: 4, IMPRESO: 1,
  CONSIGNACION: 1, NUM_REF: 50, AUTOMATICA: 1, TIPO: 50, NCF_PREFIJO: 20, NCF: 40, NIVEL_PRECIO: 12,
  MONEDA: 1, FORMA_PAGO_DEV: 1, COD_PAIS: 4, COD_GEO1: 12, COD_GEO2: 12, SERIE_RESOLUCION: 25,
  TIPO_ANULACION: 3, CLAVE_DE: 50, JUSTI_DEV_HACIEND: 2, ACTIVIDAD_COMERCIAL: 10, NCFMODIFICADO: 40,
  INCOTERMS: 4, FORMAS_PAGO: 4, NATURALEZA_OPERACION: 4, CUFE: 100, COD_MODIFICACION: 2, RAZON_MODIF: 250,
  TIPO_INGRESO: 2, TIPO_PAGO: 2, NCF_CONTINGENCIA: 40, NCF_PREFIJO_CONTINGENCIA: 20, MASCARA_DTE: 100,
  CODIGO_ANULACION: 4,
};
export const LARGOS_DET = {
  COD_ART: 20, IND_DEV: 1, OBS_DEV: 80, LOTE: 15, LOTE_HIST: 15, ART_BON: 1, TIPO_IMPUESTO1: 5,
  TIPO_TARIFA1: 2, TIPO_IMPUESTO2: 5, TIPO_TARIFA2: 2, ES_OTRO_CARGO: 1, ES_CANASTA_BASICA: 1,
  USA_IMPUESTO2_CANTIDAD: 1, INDICADOR_FACTURACION: 5,
};
const NOMBRES_CAMPO = {
  OBS_DEV: 'Observaciones', RAZON_MODIF: 'Razón', NUM_REF: 'Número del CCF', NCFMODIFICADO: 'NCF del CCF',
  COD_BOD: 'Bodega de la ruta', NIVEL_PRECIO: 'Nivel de precio', ACTIVIDAD_COMERCIAL: 'Actividad comercial',
};

// Primer campo de `fila` que pasa su largo (null = todo cabe).
export function excedeLargo(largos, fila) {
  for (const [campo, max] of Object.entries(largos)) {
    const v = fila[campo];
    if (v != null && String(v).length > max) {
      return `${NOMBRES_CAMPO[campo] ?? campo} admite ${max} caracteres (tiene ${String(v).length}).`;
    }
  }
  return null;
}

// Columnas del encabezado y de la línea tal como las recibe/devuelve el servidor
// (COLUMNAS_ENC_DEV / COLUMNAS_DET_DEV de controllers/fr/syncEnviar.js).
export const COLUMNAS_ENC_SERVIDOR = [
  'COD_CLT', 'HOR_INI', 'HOR_FIN', 'FEC_DEV', 'OBS_DEV', 'NUM_ITM', 'LST_PRE', 'EST_DEV', 'MON_SIV',
  'MON_DSC', 'POR_DSC_AP', 'MON_IMP_VT', 'MON_IMP_CS', 'COD_BOD', 'IMPRESO', 'CONSIGNACION', 'NUM_REF',
  'AUTOMATICA', 'TIPO', 'NCF_PREFIJO', 'NCF', 'NIVEL_PRECIO', 'MONEDA', 'FORMA_PAGO_DEV', 'COD_PAIS',
  'COD_GEO1', 'COD_GEO2', 'SERIE_RESOLUCION', 'CONSEC_RESOLUCION', 'TIPO_ANULACION', 'POR_DESC_AP2',
  'MONT_DESC2', 'CLAVE_DE', 'JUSTI_DEV_HACIEND', 'ACTIVIDAD_COMERCIAL', 'NCFMODIFICADO', 'INCOTERMS',
  'FORMAS_PAGO', 'NATURALEZA_OPERACION', 'CUFE', 'CODIGOQR', 'COD_MODIFICACION', 'RAZON_MODIF',
  'TIPO_INGRESO', 'TIPO_PAGO', 'NCF_CONTINGENCIA', 'NCF_PREFIJO_CONTINGENCIA', 'MASCARA_DTE',
  'CODIGO_ANULACION', 'SUBTIPO',
];
export const COLUMNAS_DET_SERVIDOR = [
  'COD_ART', 'IND_DEV', 'MON_TOT', 'MON_PRC_MX', 'MON_PRC_MN', 'CNT_MAX', 'CNT_MIN', 'LST_PRE', 'OBS_DEV',
  'MON_DSC', 'POR_DSC_AP', 'LOTE', 'LOTE_HIST', 'ART_BON', 'TIPO_IMPUESTO1', 'TIPO_TARIFA1',
  'TIPO_IMPUESTO2', 'TIPO_TARIFA2', 'PORC_EXONERACION', 'MONTO_EXONERACION', 'PORC_IMPUESTO1',
  'PORC_IMPUESTO2', 'ES_OTRO_CARGO', 'ES_CANASTA_BASICA', 'USA_IMPUESTO2_CANTIDAD', 'INDICADOR_FACTURACION',
];

const insertar = (tabla, columnas) =>
  `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`;
export const SQL_INSERT_ENC = (columnas) => insertar('alFAC_ENC_DEV', columnas);
export const SQL_INSERT_DET = (columnas) => insertar('alFAC_DET_DEV', columnas);

// Montos con 6 decimales (evita arrastrar errores de coma flotante a la base).
const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r4 = (n) => Math.round((Number(n) || 0) * 1e4) / 1e4;
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const txt = (v) => (v == null ? null : String(v).trim() || null);

// ---------------------------------------------------------------------------------------------
// Datos del cliente y de la ruta para la NC.

// { compania, lstPre, nivelPrecio, moneda, pais, division1, division2,
//   actividadComercial, exentoVentas, exentoConsumo, consecutivo (NOTACREDITO actual), subtipo }.
// cliente = null si no tiene fila en CLIENTE_CIA.
async function leerDatos(db, codigoCliente, ruta) {
  const cc = await db.getFirstAsync(
    `SELECT cc.COD_CIA, cc.LST_PRE, cc.IND_MON, cc.COD_PAIS, cc.DIVISION_GEOGRAFICA1,
            cc.DIVISION_GEOGRAFICA2, cc.CODIGO, cc.POR_EXC_VT, cc.POR_EXC_CS, c.NIVEL_PRECIO
       FROM CLIENTE_CIA cc
       LEFT JOIN CLIENTE c ON c.COD_CLT = cc.COD_CLT AND c.COD_ZON = ?
      WHERE cc.COD_CLT = ?`,
    [ruta, codigoCliente]
  );
  const consec = await db.getFirstAsync(
    'SELECT NOTACREDITO, SUBTIPO_NOTA_CREDITO FROM RUTA_CONSECUT_RT WHERE RUTA = ?',
    [ruta]
  );
  const subtipo = Number.parseInt(String(consec?.SUBTIPO_NOTA_CREDITO ?? '').trim(), 10);
  return {
    cliente: cc
      ? {
          compania: cc.COD_CIA,
          lstPre: cc.LST_PRE ?? 0,
          nivelPrecio: txt(cc.NIVEL_PRECIO),
          moneda: ['L', 'D'].includes(txt(cc.IND_MON)) ? txt(cc.IND_MON) : null,
          pais: txt(cc.COD_PAIS),
          division1: txt(cc.DIVISION_GEOGRAFICA1),
          division2: txt(cc.DIVISION_GEOGRAFICA2),
          actividadComercial: txt(cc.CODIGO),
          exentoVentas: num(cc.POR_EXC_VT),
          exentoConsumo: num(cc.POR_EXC_CS),
        }
      : null,
    consecutivo: txt(consec?.NOTACREDITO),
    subtipo: Number.isInteger(subtipo) ? subtipo : null,
  };
}

export async function getDatosNotaCredito(codigoCliente, ruta) {
  const db = await getDatabase();
  return leerDatos(db, codigoCliente, ruta);
}

// Motivo por el que no se puede hacer una NC al cliente (null = se puede).
export function motivoSinNotaCredito(datos, ruta) {
  if (!datos?.cliente) {
    return 'El cliente no tiene datos comerciales en el equipo. Descarga los datos en Datos > Cargar datos.';
  }
  if (!datos.consecutivo) {
    return `La ruta ${ruta} no tiene consecutivo de nota de crédito (NOTACREDITO). Descárgalo en Datos > Cargar datos.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// CCF del cliente y sus líneas.

// CCF del cliente en el historial de facturas (Datos > Cargar datos), del más reciente al más viejo:
// no anulados y con NUM_FAC 'DTE-03-...'. notas = NC del equipo que ya lo referencian.
export async function getCcfCliente(cliente) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT f.COD_CIA, f.NUM_FAC, f.FEC_FAC, f.MON_FAC, f.COD_ZON, f.GRAN_TOTAL,
            (SELECT COUNT(*) FROM alFAC_ENC_DEV e
              WHERE e.COD_CLT = f.COD_CLT AND e.COD_CIA = f.COD_CIA AND e.NUM_REF = f.NUM_FAC) AS NOTAS
       FROM HISTORIAL_FAC_ENC f
      WHERE f.COD_CLT = ? AND f.ANULADA = 0 AND UPPER(TRIM(f.NUM_FAC)) LIKE ?
      ORDER BY f.ORDEN`,
    [cliente, `${PREFIJO_CCF}%`]
  );
  return filas.map((r) => ({
    compania: r.COD_CIA,
    numero: r.NUM_FAC,
    ncf: String(r.NUM_FAC).trim(),
    fecha: r.FEC_FAC,
    ruta: r.COD_ZON,
    total: r.MON_FAC ?? r.GRAN_TOTAL,
    notas: r.NOTAS ?? 0,
  }));
}

// Busca el CCF del cliente (validación 2). null si no existe, está anulado o no es CCF.
async function leerCcf(db, cliente, compania, numero) {
  const f = await db.getFirstAsync(
    `SELECT COD_CIA, NUM_FAC, ANULADA FROM HISTORIAL_FAC_ENC
      WHERE COD_CLT = ? AND COD_CIA = ? AND NUM_FAC = ?`,
    [cliente, compania ?? '', numero]
  );
  if (!f || f.ANULADA === 1 || !esNumeroCcf(f.NUM_FAC)) return null;
  // NCFMODIFICADO = NUM_FAC (el mismo DTE-03-...).
  return { compania: f.COD_CIA, numero: f.NUM_FAC, ncf: String(f.NUM_FAC).trim() };
}

// Líneas acreditables del CCF, una por artículo (solo las vendidas, EST_BON 'V'; si el artículo va en
// varias líneas se suman y se toma el precio y descuento de la primera):
// [{ codigo, descripcion, lineaRef, facturado, devueltoErp, pendiente, disponible, precio,
//    porcDescuento, factorVenta, empAlm, empDet, impuesto1, impuesto2, tipoImpuesto1, tipoTarifa1,
//    tipoImpuesto2, tipoTarifa2, usaImpuesto2Cantidad, canastaBasica, esOtroCargo }]
// Cantidades en unidades de almacén (las de la factura). excluir: NC a no contar en `pendiente`.
async function leerLineasCcf(db, { cliente, compania, numero, excluir = null }) {
  const filas = await db.getAllAsync(
    `SELECT d.NUM_LN, d.COD_ART, d.CANT_FAC, d.CANT_DEV, d.PRECIO, d.PRC_DESC,
            a.DES_ART, a.FACTOR_VENTA, a.EMP_ALM, a.EMP_DET, a.CANASTA_BASICA, a.ES_OTRO_CARGO,
            COALESCE(i.IMPUESTO1, 0) AS IMPUESTO1, COALESCE(i.IMPUESTO2, 0) AS IMPUESTO2,
            i.TIPO_IMPUESTO1, i.TIPO_TARIFA1, i.TIPO_IMPUESTO2, i.TIPO_TARIFA2, i.USA_IMPUESTO2_CANTIDAD
       FROM HISTORIAL_FAC_DET d
       LEFT JOIN ARTICULO a ON a.COD_ART = d.COD_ART
       LEFT JOIN IMPUESTO i ON i.IMPUESTO = a.IMPUESTO
      WHERE d.COD_CIA = ? AND d.NUM_FAC = ? AND COALESCE(d.EST_BON, 'V') <> 'B'
      GROUP BY d.COD_CIA, d.NUM_FAC, d.NUM_LN, d.COD_ART
      ORDER BY d.NUM_LN`,
    [compania ?? '', numero]
  );

  // Lo de las NC de este CCF que oficina aún no procesa, por artículo (en unidades de almacén).
  const pendientes = await db.getAllAsync(
    `SELECT d.COD_ART,
            SUM(d.CNT_MAX + d.CNT_MIN / COALESCE(NULLIF(
              (SELECT a.FACTOR_VENTA FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1), 0), 1)) AS CANTIDAD
       FROM alFAC_ENC_DEV e
       JOIN alFAC_DET_DEV d ON d.COD_CIA = e.COD_CIA AND d.COD_ZON = e.COD_ZON AND d.NUM_DEV = e.NUM_DEV
      WHERE e.COD_CLT = ? AND e.COD_CIA = ? AND e.NUM_REF = ?
        AND COALESCE(e.EST_DEV, '') <> 'N'
        AND (e.ENVIADO = 0 OR COALESCE(e.DOC_PRO, 'N') = 'N')
        AND NOT (e.COD_ZON = ? AND e.NUM_DEV = ?)
      GROUP BY d.COD_ART`,
    [cliente, compania ?? '', numero, excluir?.ruta ?? '', excluir?.numero ?? '']
  );
  const pendientePorArt = new Map(pendientes.map((p) => [p.COD_ART, num(p.CANTIDAD)]));

  const porArticulo = new Map();
  for (const r of filas) {
    const actual = porArticulo.get(r.COD_ART);
    if (actual) {
      actual.facturado += num(r.CANT_FAC);
      actual.devueltoErp += num(r.CANT_DEV);
      continue;
    }
    const factor = num(r.FACTOR_VENTA) > 0 ? num(r.FACTOR_VENTA) : 1;
    porArticulo.set(r.COD_ART, {
      codigo: r.COD_ART,
      descripcion: r.DES_ART ?? null,
      lineaRef: r.NUM_LN,
      facturado: num(r.CANT_FAC),
      devueltoErp: num(r.CANT_DEV),
      precio: num(r.PRECIO),
      porcDescuento: num(r.PRC_DESC),
      factorVenta: factor,
      empAlm: String(r.EMP_ALM ?? '').trim(),
      empDet: String(r.EMP_DET ?? '').trim(),
      impuesto1: num(r.IMPUESTO1),
      impuesto2: num(r.IMPUESTO2),
      tipoImpuesto1: txt(r.TIPO_IMPUESTO1),
      tipoTarifa1: txt(r.TIPO_TARIFA1),
      tipoImpuesto2: txt(r.TIPO_IMPUESTO2),
      tipoTarifa2: txt(r.TIPO_TARIFA2),
      usaImpuesto2Cantidad: txt(r.USA_IMPUESTO2_CANTIDAD),
      canastaBasica: String(r.CANASTA_BASICA ?? '').trim().toUpperCase() === 'S',
      esOtroCargo: txt(r.ES_OTRO_CARGO),
    });
  }
  return [...porArticulo.values()].map((l) => {
    const pendiente = pendientePorArt.get(l.codigo) ?? 0;
    return { ...l, pendiente, disponible: Math.max(0, r4(l.facturado - l.devueltoErp - pendiente)) };
  });
}

// excluir: { ruta, numero } de la NC que se está corrigiendo (sus líneas no cuentan como pendientes).
export async function getLineasCcf(cliente, compania, numero, excluir = null) {
  const db = await getDatabase();
  return leerLineasCcf(db, { cliente, compania, numero, excluir });
}

// Lo que queda del CCF para las NC por monto (02, 03, 99), con IVA:
//   totalCcf = MON_FAC del CCF (con IVA, solo líneas vendidas; si no viene, GRAN_TOTAL).
//   acreditado = total de las NC de ese CCF que hay en el equipo (de cualquier motivo, sin enviar,
//     pendientes o procesadas; no las anuladas ni la que se corrige).
//   disponible = totalCcf - acreditado (nunca negativo).
// Impuesto de la línea base: el IVA del primer artículo con IVA del CCF (sin líneas: 13 %; con líneas
// pero ninguna con IVA: 0 %), con la exención de ventas del cliente.
async function leerMontoCcf(db, { cliente, compania, numero, excluir = null, exentoVentas = 0 }) {
  const f = await db.getFirstAsync(
    'SELECT MON_FAC, GRAN_TOTAL FROM HISTORIAL_FAC_ENC WHERE COD_CLT = ? AND COD_CIA = ? AND NUM_FAC = ?',
    [cliente, compania ?? '', numero]
  );
  // MON_FAC incluye IVA y solo las líneas vendidas (EST_BON 'V'); es el que usa el servidor.
  // GRAN_TOTAL solo si MON_FAC no vino en el historial.
  const totalCcf = r6(f?.MON_FAC != null ? num(f.MON_FAC) : num(f?.GRAN_TOTAL));
  const previas = await db.getFirstAsync(
    `SELECT SUM(COALESCE(MON_SIV, 0) + COALESCE(MON_IMP_VT, 0) + COALESCE(MON_IMP_CS, 0)) AS TOTAL
       FROM alFAC_ENC_DEV
      WHERE COD_CLT = ? AND COD_CIA = ? AND NUM_REF = ?
        AND COALESCE(EST_DEV, '') <> 'N'
        AND NOT (COD_ZON = ? AND NUM_DEV = ?)`,
    [cliente, compania ?? '', numero, excluir?.ruta ?? '', excluir?.numero ?? '']
  );
  const acreditado = r6(num(previas?.TOTAL));
  const lineas = await leerLineasCcf(db, { cliente, compania, numero, excluir });
  const conIva = lineas.find((l) => l.impuesto1 > 0);
  return {
    totalCcf,
    acreditado,
    disponible: Math.max(0, r6(totalCcf - acreditado)),
    tasaIva: conIva ? conIva.impuesto1 : lineas.length ? 0 : TASA_IVA_DEFECTO,
    exentoVentas: num(exentoVentas),
    tipoImpuesto1: conIva?.tipoImpuesto1 ?? null,
    tipoTarifa1: conIva?.tipoTarifa1 ?? null,
  };
}

// excluir: la NC que se corrige. exentoVentas: % de exención de ventas del cliente (datos.cliente).
export async function getMontoCcf(cliente, compania, numero, excluir = null, exentoVentas = 0) {
  const db = await getDatabase();
  return leerMontoCcf(db, { cliente, compania, numero, excluir, exentoVentas });
}

// NC por monto: el vendedor escribe el total CON IVA; se separa la base y el IVA. saldo: de
// getMontoCcf. Devuelve { total, base, iva, exoneracion, error } (error = texto si no es válido).
export function calcularMontoNC(montoTexto, saldo) {
  const n = Number(String(montoTexto ?? '').replace(',', '.'));
  const total = Number.isFinite(n) && n > 0 ? r6(n) : 0;
  const tasa = num(saldo?.tasaIva);
  const ex = num(saldo?.exentoVentas);
  const tasaEfectiva = (tasa * (100 - ex)) / 100;
  const base = r6(total / (1 + tasaEfectiva / 100));
  const iva = r6(total - base);
  const exoneracion = r6((base * tasa * ex) / 10000);
  let error = null;
  if (total <= 0) error = 'Escribe el monto a acreditar.';
  else if (!saldo) error = 'No se pudo leer el total del CCF.';
  // Misma tolerancia que el servidor: 1 centavo.
  else if (total > num(saldo.disponible) + 0.01) {
    error = `El monto supera lo disponible del CCF (${num(saldo.disponible).toFixed(2)}).`;
  }
  return { total, base, iva, exoneracion, error };
}

// ---------------------------------------------------------------------------------------------
// Cálculo de una línea (lo usan la pantalla y el guardado: mismo resultado en los dos).

// linea: de getLineasCcf. captura: { almacen, detalle, estado ('B'|'M'), precio (texto o número) }.
// motivo: de MOTIVOS_NC. cliente: datos.cliente (exenciones).
// Devuelve { cantidad, almacen, detalle, precio, subtotal, porcDescuento, descuento, base, iva, oi,
//            exoneracion, total, indDev, error } — error = texto si la captura no es válida.
export function calcularLineaNC(linea, captura, motivo, cliente) {
  const valor = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const almacen = valor(captura?.almacen);
  const detalle = linea.factorVenta > 1 ? valor(captura?.detalle) : 0;
  const cantidad = r4(almacen + detalle / linea.factorVenta);
  const devolucion = Boolean(motivo?.devolucion);
  const precio = devolucion ? linea.precio : valor(captura?.precio ?? linea.precio);
  const subtotal = cantidad * precio;
  // En devolución se acredita al precio neto del CCF (con su mismo % de descuento); en rebaja o
  // corrección el monto por unidad que se escribe ya es neto.
  const porcDescuento = devolucion ? linea.porcDescuento : 0;
  const descuento = (subtotal * porcDescuento) / 100;
  const base = subtotal - descuento;
  const exVt = cliente?.exentoVentas ?? 0;
  const exCs = cliente?.exentoConsumo ?? 0;
  const iva = (base * linea.impuesto1 * (100 - exVt)) / 10000;
  const oi = (base * linea.impuesto2 * (100 - exCs)) / 10000;
  const exoneracion = (base * (linea.impuesto1 * exVt + linea.impuesto2 * exCs)) / 10000;
  const indDev = devolucion ? (captura?.estado === IND_DEV.malo ? IND_DEV.malo : IND_DEV.bueno) : IND_DEV.precio;

  let error = null;
  if (cantidad <= 0) error = 'Escribe la cantidad.';
  else if (cantidad > linea.disponible + 1e-6) {
    error = `La cantidad supera lo disponible del CCF (${linea.disponible}).`;
  } else if (precio <= 0) error = 'Escribe el monto por unidad a acreditar.';
  else if (precio > linea.precio + 1e-6) error = `El monto por unidad no puede superar el precio del CCF (${linea.precio}).`;

  return {
    cantidad, almacen, detalle, precio, subtotal, porcDescuento, descuento, base, iva, oi, exoneracion,
    total: base + iva + oi, indDev, error,
  };
}

// ---------------------------------------------------------------------------------------------
// Guardado.

// Guarda una NC nueva (ENVIADO = 0) y avanza el consecutivo NOTACREDITO de la ruta, todo en UNA
// transacción. Vuelve a validar todo con la base (no confía en la pantalla). Devuelve el NUM_DEV.
//   ruta: COD_ZON. cliente: COD_CLT. bodega: bodega del ERP de la ruta activa (COD_BOD).
//   ccf: { compania, numero }. motivo: código de MOTIVOS_NC. razon: texto (RAZON_MODIF).
//   observaciones: OBS_DEV. capturas: { [codigo]: { almacen, detalle, estado, precio } } (solo las
//   líneas con cantidad; solo en devolución). monto: total CON IVA a acreditar (texto o número; solo en
//   02, 03 y 99, que llevan una línea '00000'). inicio / fin: Date (HOR_INI / HOR_FIN; FEC_DEV = fin).
//   corrige: { compania, ruta, numero } de una NC SIN ENVIAR (p. ej. rechazada por el servidor) que se
//   reemplaza con el MISMO número: no avanza el consecutivo, sus propias líneas no cuentan como
//   pendientes del CCF y conserva su HOR_INI (el servidor la usa para reconocer reenvíos).
export async function guardarNotaCredito({
  ruta,
  cliente,
  bodega,
  ccf,
  motivo,
  razon,
  observaciones,
  capturas,
  monto,
  inicio,
  fin,
  corrige = null,
}) {
  const m = motivoNC(motivo);
  if (!m) throw new Error('Elige el motivo de la nota de crédito.');
  const razonTexto = String(razon ?? '').trim();
  if (m.razonObligatoria && !razonTexto) throw new Error('Escribe la razón de la nota de crédito.');
  if (!m.devolucion && razonTexto.length > LARGO_RAZON_MONTO) {
    throw new Error(`La razón admite ${LARGO_RAZON_MONTO} caracteres (tiene ${razonTexto.length}).`);
  }
  const db = await getDatabase();
  let numero = null;

  await db.withTransactionAsync(async () => {
    const datos = await leerDatos(db, cliente, ruta);
    const sinNc = motivoSinNotaCredito(datos, ruta);
    if (sinNc) throw new Error(sinNc);
    const c = datos.cliente;

    let original = null;
    if (corrige) {
      if (corrige.ruta !== ruta) throw new Error(`La nota de crédito ${corrige.numero} es de la ruta ${corrige.ruta}.`);
      original = await db.getFirstAsync(
        'SELECT HOR_INI, ENVIADO, COD_CLT FROM alFAC_ENC_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?',
        [corrige.compania ?? '', corrige.ruta, corrige.numero]
      );
      if (!original) throw new Error(`La nota de crédito ${corrige.numero} ya no está en el equipo.`);
      if (original.ENVIADO === 1) throw new Error(`La nota de crédito ${corrige.numero} ya está en el servidor: no se puede corregir.`);
      if (original.COD_CLT !== cliente) throw new Error(`La nota de crédito ${corrige.numero} es de otro cliente.`);
    }

    const doc = await leerCcf(db, cliente, ccf?.compania, ccf?.numero);
    if (!doc) {
      throw new Error(`El documento ${ccf?.numero ?? ''} no es un Comprobante de Crédito Fiscal vigente de este cliente.`);
    }

    const excluir = corrige ? { ruta: corrige.ruta, numero: corrige.numero } : null;
    const cia = doc.compania ?? '';
    const lstPre = c.lstPre ?? 0;
    // Líneas a insertar (sin COD_CIA / COD_ZON / NUM_DEV / NUM_LN) y totales del encabezado.
    const detalles = [];
    const totales = { base: 0, descuento: 0, iva: 0, oi: 0 };

    if (m.devolucion) {
      // 01: por artículo del CCF, a su precio, sin pasar de lo disponible.
      const lineasCcf = await leerLineasCcf(db, { cliente, compania: doc.compania, numero: doc.numero, excluir });
      for (const l of lineasCcf) {
        const captura = capturas?.[l.codigo];
        if (!captura) continue;
        const calc = calcularLineaNC(l, captura, m, c);
        if (calc.cantidad <= 0) continue;
        if (calc.error) throw new Error(`${l.descripcion || l.codigo}: ${calc.error}`);
        totales.base += calc.base;
        totales.descuento += calc.descuento;
        totales.iva += calc.iva;
        totales.oi += calc.oi;
        detalles.push({
          etiqueta: l.descripcion || l.codigo,
          fila: {
            REF_NUM_LN: l.lineaRef,
            COD_ART: l.codigo,
            IND_DEV: calc.indDev,
            ART_BON: ART_BON_VENTA,
            LOTE: '',
            LOTE_HIST: '',
            CNT_MAX: calc.almacen,
            CNT_MIN: calc.detalle,
            MON_TOT: r6(calc.subtotal),
            MON_PRC_MX: r6(calc.precio),
            MON_PRC_MN: r6(calc.precio / (l.factorVenta || 1)),
            MON_DSC: r6(calc.descuento),
            POR_DSC_AP: r6(calc.porcDescuento),
            LST_PRE: lstPre,
            TIPO_IMPUESTO1: l.tipoImpuesto1,
            TIPO_TARIFA1: l.tipoTarifa1,
            TIPO_IMPUESTO2: l.tipoImpuesto2,
            TIPO_TARIFA2: l.tipoTarifa2,
            PORC_IMPUESTO1: l.impuesto1,
            PORC_IMPUESTO2: l.impuesto2,
            PORC_EXONERACION: c.exentoVentas,
            MONTO_EXONERACION: r6(calc.exoneracion),
            ES_CANASTA_BASICA: l.canastaBasica ? 'S' : 'N',
            ES_OTRO_CARGO: l.esOtroCargo,
            USA_IMPUESTO2_CANTIDAD: l.usaImpuesto2Cantidad,
          },
        });
      }
      if (!detalles.length) throw new Error('La nota de crédito no tiene artículos.');
    } else {
      // 02, 03, 99: una sola línea base '00000' con la razón como descripción y el monto (con IVA)
      // que escribe el vendedor, sin pasar de lo que queda del CCF.
      const saldo = await leerMontoCcf(db, {
        cliente,
        compania: doc.compania,
        numero: doc.numero,
        excluir,
        exentoVentas: c.exentoVentas,
      });
      const calc = calcularMontoNC(monto, saldo);
      if (calc.error) throw new Error(calc.error);
      totales.base = calc.base;
      totales.iva = calc.iva;
      detalles.push({
        etiqueta: razonTexto,
        fila: {
          REF_NUM_LN: null,
          COD_ART: CODIGO_LINEA_MONTO,
          IND_DEV: IND_DEV.precio,
          ART_BON: ART_BON_VENTA,
          LOTE: '',
          LOTE_HIST: '',
          CNT_MAX: 1,
          CNT_MIN: 0,
          MON_TOT: calc.base,
          MON_PRC_MX: calc.base,
          MON_PRC_MN: calc.base,
          MON_DSC: 0,
          POR_DSC_AP: 0,
          LST_PRE: lstPre,
          OBS_DEV: razonTexto,
          TIPO_IMPUESTO1: saldo.tipoImpuesto1,
          TIPO_TARIFA1: saldo.tipoTarifa1,
          PORC_IMPUESTO1: saldo.tasaIva,
          PORC_IMPUESTO2: 0,
          PORC_EXONERACION: c.exentoVentas,
          MONTO_EXONERACION: calc.exoneracion,
          ES_CANASTA_BASICA: 'N',
        },
      });
    }

    if (corrige) {
      // Se reemplaza la NC: se borra la versión anterior y se vuelve a insertar con el mismo número.
      numero = corrige.numero;
      const llave = [corrige.compania ?? '', corrige.ruta, corrige.numero];
      await db.runAsync('DELETE FROM alFAC_DET_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', llave);
      await db.runAsync('DELETE FROM alFAC_ENC_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', llave);
    } else {
      numero = datos.consecutivo;
      const existe = await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_DEV WHERE COD_ZON = ? AND NUM_DEV = ?', [ruta, numero]);
      if (existe) throw new Error(`Ya existe una nota de crédito con el número ${numero} en la ruta ${ruta}.`);
    }

    const enc = {
      COD_CIA: cia,
      COD_ZON: ruta,
      NUM_DEV: numero,
      COD_CLT: cliente,
      HOR_INI: original?.HOR_INI ?? toSqlLocal(inicio ?? fin),
      HOR_FIN: toSqlLocal(fin),
      FEC_DEV: toSqlLocal(fin),
      OBS_DEV: String(observaciones ?? '').trim() || null,
      NUM_ITM: detalles.length,
      LST_PRE: lstPre,
      EST_DEV: EST_DEV_ACTIVA,
      MON_SIV: r6(totales.base),
      MON_DSC: r6(totales.descuento),
      POR_DSC_AP: 0,
      MON_IMP_VT: r6(totales.iva),
      MON_IMP_CS: r6(totales.oi),
      COD_BOD: String(bodega ?? '').trim() || 'ND',
      IMPRESO: 'N',
      CONSIGNACION: 'N',
      NUM_REF: doc.numero,
      AUTOMATICA: 'N',
      TIPO: TIPO_NC,
      NIVEL_PRECIO: c.nivelPrecio,
      MONEDA: c.moneda,
      COD_PAIS: c.pais,
      COD_GEO1: c.division1,
      COD_GEO2: c.division2,
      ACTIVIDAD_COMERCIAL: c.actividadComercial,
      NCFMODIFICADO: doc.ncf,
      COD_MODIFICACION: m.codigo,
      RAZON_MODIF: razonTexto || m.descripcion,
      SUBTIPO: datos.subtipo,
      DOC_PRO: 'N',
      ENVIADO: 0,
    };
    const largo = excedeLargo(LARGOS_ENC, enc);
    if (largo) throw new Error(largo);
    const columnasEnc = Object.keys(enc);
    await db.runAsync(SQL_INSERT_ENC(columnasEnc), columnasEnc.map((k) => enc[k]));

    for (const [i, { etiqueta, fila }] of detalles.entries()) {
      const det = { COD_CIA: cia, COD_ZON: ruta, NUM_DEV: numero, NUM_LN: i + 1, ...fila };
      const largoDet = excedeLargo(LARGOS_DET, det);
      if (largoDet) throw new Error(`${etiqueta}: ${largoDet}`);
      const columnasDet = Object.keys(det);
      await db.runAsync(SQL_INSERT_DET(columnasDet), columnasDet.map((k) => det[k]));
    }

    if (!corrige) {
      await db.runAsync('UPDATE RUTA_CONSECUT_RT SET NOTACREDITO = ? WHERE RUTA = ?', [siguienteConsecutivo(numero), ruta]);
      // El consecutivo nuevo también debe llegar al servidor (ver services/enviarDatos).
      await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
    }
  });

  return numero;
}

// NC sin enviar lista para corregir en la captura: { ccf: { compania, numero, fecha, total }, motivo,
// razon, observaciones, capturas: { [codigo]: { almacen, detalle, estado, precio } } }. Lanza un Error
// si ya se envió o si su CCF ya no está en el historial del equipo.
export async function getNotaCreditoParaCorregir(compania, ruta, numero) {
  const db = await getDatabase();
  const e = await db.getFirstAsync(
    `SELECT COD_CLT, NUM_REF, COD_MODIFICACION, RAZON_MODIF, OBS_DEV, ENVIADO, MON_SIV, MON_IMP_VT, MON_IMP_CS
       FROM alFAC_ENC_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?`,
    [compania ?? '', ruta, numero]
  );
  if (!e) throw new Error(`La nota de crédito ${numero} ya no está en el equipo.`);
  if (e.ENVIADO === 1) throw new Error(`La nota de crédito ${numero} ya está en el servidor: no se puede corregir.`);
  const f = await db.getFirstAsync(
    `SELECT COD_CIA, NUM_FAC, FEC_FAC, MON_FAC, GRAN_TOTAL, ANULADA FROM HISTORIAL_FAC_ENC
      WHERE COD_CLT = ? AND COD_CIA = ? AND NUM_FAC = ?`,
    [e.COD_CLT, compania ?? '', e.NUM_REF]
  );
  if (!f || f.ANULADA === 1 || !esNumeroCcf(f.NUM_FAC)) {
    throw new Error(
      `El CCF ${e.NUM_REF ?? ''} ya no está vigente en el historial del equipo (Datos > Cargar datos). No se puede corregir: descártala.`
    );
  }
  const lineas = await db.getAllAsync(
    'SELECT COD_ART, IND_DEV, CNT_MAX, CNT_MIN, MON_PRC_MX FROM alFAC_DET_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?',
    [compania ?? '', ruta, numero]
  );
  const m = motivoNC(e.COD_MODIFICACION);
  const razon = String(e.RAZON_MODIF ?? '').trim();
  return {
    ccf: { compania: f.COD_CIA, numero: f.NUM_FAC, fecha: f.FEC_FAC, total: f.MON_FAC ?? f.GRAN_TOTAL },
    motivo: m?.codigo ?? MOTIVOS_NC[0].codigo,
    // Si la razón es la descripción del motivo (se guardó vacía), se deja vacía.
    razon: m && razon === m.descripcion ? '' : razon,
    observaciones: String(e.OBS_DEV ?? '').trim(),
    // NC por monto (02, 03, 99): total con IVA que se había escrito.
    monto: m && !m.devolucion ? String(r6(num(e.MON_SIV) + num(e.MON_IMP_VT) + num(e.MON_IMP_CS))) : '',
    capturas: Object.fromEntries(
      lineas.map((l) => [
        l.COD_ART,
        {
          almacen: num(l.CNT_MAX) ? String(num(l.CNT_MAX)) : '',
          detalle: num(l.CNT_MIN) ? String(num(l.CNT_MIN)) : '',
          estado: l.IND_DEV === IND_DEV.malo ? IND_DEV.malo : IND_DEV.bueno,
          precio: String(num(l.MON_PRC_MX)),
        },
      ])
    ),
  };
}

// Borra del equipo una NC SIN ENVIAR (p. ej. rechazada por el servidor que ya no aplica). El
// consecutivo no retrocede: ese número queda sin usar.
export async function descartarNotaCredito(compania, ruta, numero) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const e = await db.getFirstAsync('SELECT ENVIADO FROM alFAC_ENC_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', [
      compania ?? '',
      ruta,
      numero,
    ]);
    if (!e) return;
    if (e.ENVIADO === 1) throw new Error(`La nota de crédito ${numero} ya está en el servidor: no se puede descartar.`);
    await db.runAsync('DELETE FROM alFAC_DET_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', [compania ?? '', ruta, numero]);
    await db.runAsync('DELETE FROM alFAC_ENC_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', [compania ?? '', ruta, numero]);
  });
}

// ---------------------------------------------------------------------------------------------
// Consulta.

// Estado de una NC para mostrar: 'pendiente' (solo en el equipo), 'error' (el servidor la rechazó),
// 'enviada' (en el servidor, oficina aún no la procesa) o 'procesada'.
const estadoNc = (r) => {
  if (r.ENVIADO !== 1) return r.ERROR_ENVIO ? 'error' : 'pendiente';
  return String(r.DOC_PRO ?? 'N').trim().toUpperCase() === 'N' ? 'enviada' : 'procesada';
};

// NC del cliente que están en el equipo (las capturadas aquí y las descargadas), las más recientes primero.
export async function getNotasCreditoCliente(cliente) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, COD_ZON, NUM_DEV, FEC_DEV, HOR_FIN, NUM_REF, NCFMODIFICADO, COD_MODIFICACION, RAZON_MODIF,
            OBS_DEV, NUM_ITM, MON_SIV, MON_DSC, MON_IMP_VT, MON_IMP_CS, MONEDA, DOC_PRO, ENVIADO, ERROR_ENVIO
       FROM alFAC_ENC_DEV
      WHERE COD_CLT = ?
      ORDER BY FEC_DEV DESC, NUM_DEV DESC`,
    [cliente]
  );
  return filas.map((r) => ({
    compania: r.COD_CIA,
    ruta: r.COD_ZON,
    numero: r.NUM_DEV,
    fecha: r.FEC_DEV,
    ccf: r.NUM_REF,
    ncfCcf: r.NCFMODIFICADO,
    motivo: r.COD_MODIFICACION,
    motivoDescripcion: motivoNC(r.COD_MODIFICACION)?.descripcion ?? (r.COD_MODIFICACION ? `Motivo ${r.COD_MODIFICACION}` : null),
    razon: r.RAZON_MODIF,
    observaciones: r.OBS_DEV,
    articulos: r.NUM_ITM ?? 0,
    montos: {
      sinIva: num(r.MON_SIV),
      descuento: num(r.MON_DSC),
      iva: num(r.MON_IMP_VT),
      oi: num(r.MON_IMP_CS),
      total: num(r.MON_SIV) + num(r.MON_IMP_VT) + num(r.MON_IMP_CS),
    },
    moneda: r.MONEDA,
    estado: estadoNc(r),
    errorEnvio: r.ERROR_ENVIO ?? null,
  }));
}

// Líneas de una NC (formato de HistorialLineasList).
export async function getLineasNotaCredito(compania, ruta, numero) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT d.*, (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS DES_ART,
            (SELECT a.FACTOR_VENTA FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS FACTOR_VENTA
       FROM alFAC_DET_DEV d
      WHERE d.COD_CIA = ? AND d.COD_ZON = ? AND d.NUM_DEV = ?
      ORDER BY COALESCE(d.NUM_LN, 0), d.COD_ART`,
    [compania ?? '', ruta, numero]
  );
  return filas.map((r, i) => {
    const factor = num(r.FACTOR_VENTA) > 0 ? num(r.FACTOR_VENTA) : 1;
    return {
      linea: r.NUM_LN ?? i + 1,
      codigo: r.COD_ART,
      // La línea base de las NC por monto ('00000') lleva la razón como descripción.
      descripcion: r.COD_ART === CODIGO_LINEA_MONTO ? r.OBS_DEV || r.DES_ART : r.DES_ART,
      indDev: r.IND_DEV,
      cantidad: num(r.CNT_MAX) + num(r.CNT_MIN) / factor,
      precio: num(r.MON_PRC_MX),
      porcDescuento: num(r.POR_DSC_AP),
      descuento: num(r.MON_DSC),
      total: num(r.MON_TOT) - num(r.MON_DSC),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Envío (services/enviarDatos).

// NC sin enviar con sus líneas, en el formato de POST /fr/sync/enviar (notasCredito[]). Solo van las
// columnas que acepta el servidor y con valor; DOC_PRO no se manda (el servidor la guarda 'N').
// fechaSql: normaliza fechas a 'YYYY-MM-DD HH:MM:SS'.
export async function leerNotasCreditoPendientes(db, fechaSql) {
  const encabezados = await db.getAllAsync('SELECT * FROM alFAC_ENC_DEV WHERE ENVIADO = 0 ORDER BY HOR_FIN');
  const notas = [];
  for (const e of encabezados) {
    const lineas = await db.getAllAsync(
      'SELECT * FROM alFAC_DET_DEV WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ? ORDER BY COALESCE(NUM_LN, 0), COD_ART',
      [e.COD_CIA, e.COD_ZON, e.NUM_DEV]
    );
    const encabezado = { COD_CIA: e.COD_CIA, COD_ZON: e.COD_ZON, NUM_DEV: e.NUM_DEV };
    for (const col of COLUMNAS_ENC_SERVIDOR) {
      if (e[col] == null) continue;
      encabezado[col] = ['HOR_INI', 'HOR_FIN', 'FEC_DEV'].includes(col) ? fechaSql(e[col]) : e[col];
    }
    // Debe coincidir con las líneas que se mandan.
    encabezado.NUM_ITM = lineas.length;
    notas.push({
      encabezado,
      lineas: lineas.map((l) => {
        const fila = {};
        for (const col of COLUMNAS_DET_SERVIDOR) if (l[col] != null) fila[col] = l[col];
        return fila;
      }),
    });
  }
  return notas;
}

// Compara dos consecutivos con el mismo prefijo ('NCRT_R01_00002'). null si no se pueden comparar.
export function compararConsecutivos(a, b) {
  const ma = /^(.*?)(\d+)$/.exec(String(a ?? '').trim());
  const mb = /^(.*?)(\d+)$/.exec(String(b ?? '').trim());
  if (!ma || !mb || ma[1] !== mb[1]) return null;
  const x = BigInt(ma[2]);
  const y = BigInt(mb[2]);
  return x === y ? 0 : x > y ? 1 : -1;
}

// Si el servidor tiene el consecutivo NOTACREDITO de la ruta más adelante que el equipo, el equipo lo
// toma (evita repetir números que ya usó otra handheld o la web). Corre en la transacción del envío.
export async function adoptarConsecutivoServidor(db, ruta, actualServidor) {
  const local = (await db.getFirstAsync('SELECT NOTACREDITO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [ruta]))?.NOTACREDITO;
  if (compararConsecutivos(actualServidor, local) === 1) {
    await db.runAsync('UPDATE RUTA_CONSECUT_RT SET NOTACREDITO = ? WHERE RUTA = ?', [String(actualServidor).trim(), ruta]);
  }
}

// El servidor respondió conflicto: otra NC ya usa este NUM_DEV. Se le asigna el siguiente número libre
// (el consecutivo del equipo o el del servidor, el mayor; sin chocar con otra NC del equipo), se avanza
// el consecutivo y queda pendiente para reenviarse. HOR_INI NO cambia (el servidor la usa para
// reconocer reenvíos). Corre en la transacción del envío. Devuelve el número nuevo.
export async function renumerarNotaCredito(db, { COD_CIA, COD_ZON, NUM_DEV }, actualServidor = null) {
  const fila = await db.getFirstAsync('SELECT NOTACREDITO FROM RUTA_CONSECUT_RT WHERE RUTA = ?', [COD_ZON]);
  let nuevo = String(fila?.NOTACREDITO ?? '').trim();
  if (!nuevo) throw new Error(`La ruta ${COD_ZON} no tiene consecutivo de nota de crédito.`);
  if (compararConsecutivos(actualServidor, nuevo) === 1) nuevo = String(actualServidor).trim();
  // Nunca hacia atrás ni el mismo número que chocó.
  if (compararConsecutivos(nuevo, NUM_DEV) !== 1) nuevo = siguienteConsecutivo(NUM_DEV);
  while (await db.getFirstAsync('SELECT 1 AS x FROM alFAC_ENC_DEV WHERE COD_ZON = ? AND NUM_DEV = ?', [COD_ZON, nuevo])) {
    nuevo = siguienteConsecutivo(nuevo);
  }
  const llave = [COD_CIA ?? '', COD_ZON, NUM_DEV];
  await db.runAsync('UPDATE alFAC_DET_DEV SET NUM_DEV = ? WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?', [nuevo, ...llave]);
  await db.runAsync(
    'UPDATE alFAC_ENC_DEV SET NUM_DEV = ?, ERROR_ENVIO = ? WHERE COD_CIA = ? AND COD_ZON = ? AND NUM_DEV = ?',
    [nuevo, `El número ${NUM_DEV} ya estaba usado en el servidor; se renumeró a ${nuevo}.`, ...llave]
  );
  await db.runAsync('UPDATE RUTA_CONSECUT_RT SET NOTACREDITO = ? WHERE RUTA = ?', [siguienteConsecutivo(nuevo), COD_ZON]);
  await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('consecutivos_pendientes', '1')");
  return nuevo;
}
