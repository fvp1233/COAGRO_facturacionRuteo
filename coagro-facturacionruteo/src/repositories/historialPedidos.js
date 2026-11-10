import { getDatabase } from '../db/database';

const facturasDe = (v) => {
  try {
    const lista = JSON.parse(v ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

// Historial de pedidos del cliente guardado en el equipo (caché de la última consulta en línea,
// services/historialPedidos), en el orden en que llegó: fecha descendente.
// Devuelve { pedidos, descargado } — descargado: ISO de la última consulta exitosa; null si nunca
// se consultó (sin caché). montos: null si todo el pedido está facturado; si no, SOLO de las líneas
// pendientes (hayFacturadas = alguna línea ya facturada). No se recalculan.
export async function getHistorialPedidos(cliente) {
  const db = await getDatabase();
  const meta = await db.getFirstAsync('SELECT value FROM app_meta WHERE key = ?', [`historial_pedidos_at:${cliente}`]);
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, NUM_PED, COD_ZON, FEC_PED, EST_PED, MON_PED, FACTURAS, HAY_FACTURADAS, TIENE_MONTOS,
            TOTAL_MERCADERIA, DESCUENTO_VOLUMEN, SUBTOTAL, IVA, GRAN_TOTAL
       FROM HISTORIAL_PED_ENC
      WHERE COD_CLT = ?
      ORDER BY ORDEN`,
    [cliente]
  );
  return {
    descargado: meta?.value ?? null,
    pedidos: filas.map((r) => ({
      compania: r.COD_CIA,
      numero: r.NUM_PED,
      ruta: r.COD_ZON,
      fecha: r.FEC_PED,
      estado: r.EST_PED,
      total: r.MON_PED,
      facturas: facturasDe(r.FACTURAS),
      hayFacturadas: r.HAY_FACTURADAS === 1,
      montos: r.TIENE_MONTOS
        ? {
            totalMercaderia: r.TOTAL_MERCADERIA,
            descuentoVolumen: r.DESCUENTO_VOLUMEN,
            subtotal: r.SUBTOTAL,
            iva: r.IVA,
            granTotal: r.GRAN_TOTAL,
          }
        : null,
    })),
  };
}

// Líneas de un pedido del historial (llave COD_CIA + NUM_PED), por NUM_LN.
// Nombre del artículo: ARTICULO.DES_ART (null si no está). En las facturadas precio y total son null.
export async function getLineasPedido(compania, numero) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT d.NUM_LN, d.COD_ART, d.EST_BON, d.FACTURADA, d.CANTIDAD, d.PRECIO, d.MONT_DESC, d.PRC_DESC,
            d.TOTAL_LINEA,
            (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS DES_ART
       FROM HISTORIAL_PED_DET d
      WHERE d.COD_CIA = ? AND d.NUM_PED = ?
      ORDER BY d.NUM_LN`,
    [compania ?? '', numero]
  );
  return filas.map((r) => ({
    linea: r.NUM_LN,
    codigo: r.COD_ART,
    descripcion: r.DES_ART,
    bonificacion: r.EST_BON === 'B',
    facturada: r.FACTURADA === 1,
    cantidad: r.CANTIDAD,
    precio: r.FACTURADA === 1 ? null : r.PRECIO,
    descuento: r.MONT_DESC,
    porcDescuento: r.PRC_DESC,
    total: r.FACTURADA === 1 ? null : r.TOTAL_LINEA,
  }));
}
