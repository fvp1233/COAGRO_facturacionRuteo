import { getDatabase } from '../db/database';

// Flete por ruta: si el documento (pedido o cotización) no llega al mínimo, se le agrega una línea
// con el artículo de flete (ej. 103) por MONTO_FLETE + su impuesto. La configuración llega en cada
// fila de RUTA_CONSECUT_RT (GET /fr/sync/consecutivos, Datos > Cargar datos) y el artículo en
// ARTICULO (articulosFlete[] del mismo endpoint).

// Configuración del flete de una ruta (la del documento, COD_ZON). Sin fila de consecutivos o con
// USA_FLETE distinto de 'S' => usaFlete false (no se cobra).
//   { usaFlete, minimo, monto, articulo (código), descripcion, impuesto1, impuesto2, esOtroCargo,
//     articuloEnEquipo (false si el artículo no está en ARTICULO: falta Cargar datos) }
export async function getFleteRuta(ruta) {
  const sinFlete = { usaFlete: false, minimo: 0, monto: 0, articulo: null };
  if (!ruta) return sinFlete;
  const db = await getDatabase();
  const r = await db.getFirstAsync(
    `SELECT c.USA_FLETE, c.MINIMO_FLETE, c.MONTO_FLETE, c.ARTICULO_FLETE,
            a.COD_ART, a.DES_ART, a.ES_OTRO_CARGO,
            i.IMPUESTO1, i.IMPUESTO2
       FROM RUTA_CONSECUT_RT c
       LEFT JOIN ARTICULO a ON a.COD_ART = TRIM(c.ARTICULO_FLETE)
       LEFT JOIN IMPUESTO i ON i.IMPUESTO = a.IMPUESTO
      WHERE c.RUTA = ?
      LIMIT 1`,
    [ruta]
  );
  if (!r) return sinFlete;
  const articulo = String(r.ARTICULO_FLETE ?? '').trim() || null;
  return {
    usaFlete: String(r.USA_FLETE ?? '').trim().toUpperCase() === 'S' && Boolean(articulo),
    minimo: Number(r.MINIMO_FLETE) || 0,
    monto: Number(r.MONTO_FLETE) || 0,
    articulo,
    descripcion: String(r.DES_ART ?? '').trim() || 'FLETE',
    impuesto1: Number(r.IMPUESTO1) || 0,
    impuesto2: Number(r.IMPUESTO2) || 0,
    esOtroCargo: r.ES_OTRO_CARGO ?? null,
    articuloEnEquipo: Boolean(r.COD_ART),
  };
}

// Configuración del flete de todas las rutas de la handheld (Parámetros del dispositivo).
// [{ ruta, usaFlete, minimo, monto, articulo, descripcion, impuesto1 }]
export async function getFletesRutas() {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT c.RUTA, c.USA_FLETE, c.MINIMO_FLETE, c.MONTO_FLETE, c.ARTICULO_FLETE, a.DES_ART, i.IMPUESTO1
       FROM RUTA_CONSECUT_RT c
       LEFT JOIN ARTICULO a ON a.COD_ART = TRIM(c.ARTICULO_FLETE)
       LEFT JOIN IMPUESTO i ON i.IMPUESTO = a.IMPUESTO
      GROUP BY c.RUTA
      ORDER BY c.RUTA`
  );
  return filas.map((r) => ({
    ruta: r.RUTA,
    usaFlete: String(r.USA_FLETE ?? '').trim().toUpperCase() === 'S',
    minimo: r.MINIMO_FLETE,
    monto: r.MONTO_FLETE,
    articulo: String(r.ARTICULO_FLETE ?? '').trim() || null,
    descripcion: r.DES_ART ? String(r.DES_ART).trim() : null,
    impuesto1: r.IMPUESTO1,
  }));
}

const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Decide el flete de un documento. lineas: las del documento SIN la del flete ({ codigo, subtotal,
// descuento, iva }). La línea del flete nunca cuenta para el mínimo; las bonificaciones suman lo que
// valen. totalBase = Σ (subtotal − descuento + IVA). El encabezado no lleva descuentos (DESC1/DESC2 = 0).
// Exactamente el mínimo ya no lleva flete. Un documento sin líneas no lleva flete.
//   { aplica, totalBase, faltante (lo que falta para el mínimo; 0 si ya llega) }
export function evaluarFlete(config, lineas) {
  const propias = lineas.filter((l) => l.codigo !== config?.articulo);
  const totalBase = redondear2(propias.reduce((s, l) => s + (l.subtotal - l.descuento + l.iva), 0));
  if (!config?.usaFlete) return { aplica: false, totalBase, faltante: 0 };
  const faltante = Math.max(0, redondear2(config.minimo - totalBase));
  return { aplica: propias.length > 0 && totalBase < config.minimo, totalBase, faltante };
}

// Línea del flete con la misma forma que las líneas de PedidoArticulosView (la guarda guardarPedido):
// 1 unidad (CNT_MAX 1 / CNT_MIN 0) a MONTO_FLETE sin descuento; el impuesto es el del artículo, con
// la exención del cliente como cualquier otra línea. esFlete: no se edita ni se borra en pantalla.
//   cliente: { exentoVentas, exentoConsumo }. moneda: la del documento.
export function lineaFlete(config, cliente, moneda) {
  const base = config.monto;
  const exVt = Number(cliente?.exentoVentas) || 0;
  const exCs = Number(cliente?.exentoConsumo) || 0;
  const iva = (base * config.impuesto1 * (100 - exVt)) / 10000;
  const oi = (base * config.impuesto2 * (100 - exCs)) / 10000;
  return {
    codigo: config.articulo,
    descripcion: config.descripcion,
    moneda,
    precio: base,
    almacen: 1,
    detalle: 0,
    cantidad: 1,
    cantidadTexto: '1',
    porcDescuento: 0,
    canastaBasica: false,
    subtotal: base,
    descuento: 0,
    iva,
    oi,
    exoneracion: (base * (config.impuesto1 * exVt + config.impuesto2 * exCs)) / 10000,
    adicional: iva + oi,
    factorVenta: 1,
    impuesto1: config.impuesto1,
    impuesto2: config.impuesto2,
    esOtroCargo: config.esOtroCargo,
    total: base + iva + oi,
    esFlete: true,
  };
}

// Líneas finales del documento: las del vendedor (sin ninguna del flete) + la del flete al final si
// aplica. Se llama en cada cambio de líneas y justo antes de guardar.
export function aplicarFlete(config, lineas, cliente, moneda) {
  const propias = lineas.filter((l) => !l.esFlete && l.codigo !== config?.articulo);
  const { aplica } = evaluarFlete(config, propias);
  return aplica ? [...propias, lineaFlete(config, cliente, moneda)] : propias;
}
