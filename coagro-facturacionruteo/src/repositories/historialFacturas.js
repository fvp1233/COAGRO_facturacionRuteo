import { getDatabase } from '../db/database';

// Historial de facturas del cliente guardado en el equipo (Cargar datos o la última consulta en
// línea, services/historialFacturas), en el orden en que llegó: fecha descendente.
// Devuelve { facturas, descargado } — descargado: ISO de la última descarga; null si nunca se
// descargó (sin caché). Los montos llegan calculados del servidor: no se recalculan.
export async function getHistorialCliente(cliente) {
  const db = await getDatabase();
  // Última consulta en línea de este cliente o, si no hay, el último Cargar datos.
  const meta = await db.getFirstAsync(
    `SELECT COALESCE((SELECT value FROM app_meta WHERE key = ?),
                     (SELECT value FROM app_meta WHERE key = 'sync_historial_facturas_at')) AS value`,
    [`historial_facturas_at:${cliente}`]
  );
  const filas = await db.getAllAsync(
    `SELECT COD_CIA, NUM_FAC, NUM_PED, COD_ZON, FEC_FAC, MON_FAC, ANULADA, COD_CND,
            TOTAL_MERCADERIA, DESCUENTO_VOLUMEN, SUBTOTAL, IVA, GRAN_TOTAL, AGENTE, NOMBRE_AGENTE
       FROM HISTORIAL_FAC_ENC
      WHERE COD_CLT = ?
      ORDER BY ORDEN`,
    [cliente]
  );
  return {
    descargado: meta?.value ?? null,
    facturas: filas.map((r) => ({
      compania: r.COD_CIA,
      numero: r.NUM_FAC,
      pedido: r.NUM_PED,
      ruta: r.COD_ZON,
      fecha: r.FEC_FAC,
      total: r.MON_FAC,
      anulada: r.ANULADA === 1,
      condicionPago: r.COD_CND,
      agente: r.AGENTE ?? '',
      nombreAgente: r.NOMBRE_AGENTE ?? '',
      montos: {
        totalMercaderia: r.TOTAL_MERCADERIA,
        descuentoVolumen: r.DESCUENTO_VOLUMEN,
        subtotal: r.SUBTOTAL,
        iva: r.IVA,
        granTotal: r.GRAN_TOTAL,
      },
    })),
  };
}

const CAMPOS_MONTOS = ['totalMercaderia', 'descuentoVolumen', 'subtotal', 'iva', 'granTotal'];

// Montos de las facturas de un pedido, tomados de la caché de facturas del cliente (no se
// recalculan: con varias facturas se suma cada monto, sin las anuladas).
// Devuelve { montos (null si no hay vigentes), vigentes, anuladas, faltan } — faltan: números que
// no están en la caché (hay que consultar al servidor).
export async function getMontosFacturas(cliente, compania, numeros) {
  const { facturas } = await getHistorialCliente(cliente);
  const encontradas = numeros
    .map((n) => facturas.find((f) => f.compania === (compania ?? '') && f.numero === n))
    .filter(Boolean);
  const vigentes = encontradas.filter((f) => !f.anulada);
  const montos = vigentes.length
    ? Object.fromEntries(
        CAMPOS_MONTOS.map((k) => [k, vigentes.reduce((s, f) => s + Number(f.montos[k] ?? 0), 0)])
      )
    : null;
  return {
    montos,
    vigentes: vigentes.map((f) => f.numero),
    anuladas: encontradas.filter((f) => f.anulada).map((f) => f.numero),
    faltan: numeros.filter((n) => !encontradas.some((f) => f.numero === n)),
  };
}

// Líneas de una factura del historial (llave COD_CIA + NUM_FAC), por NUM_LN.
// Nombre del artículo: ARTICULO.DES_ART (null si no está). total ya trae el descuento restado.
export async function getLineasFactura(compania, numero) {
  const db = await getDatabase();
  const filas = await db.getAllAsync(
    `SELECT d.NUM_LN, d.COD_ART, d.EST_BON, d.CANT_FAC, d.CANT_DEV, d.PRECIO, d.MONT_DESC, d.PRC_DESC,
            d.TOTAL_LINEA,
            (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = d.COD_ART LIMIT 1) AS DES_ART
       FROM HISTORIAL_FAC_DET d
      WHERE d.COD_CIA = ? AND d.NUM_FAC = ?
      ORDER BY d.NUM_LN`,
    [compania ?? '', numero]
  );
  return filas.map((r) => ({
    linea: r.NUM_LN,
    codigo: r.COD_ART,
    descripcion: r.DES_ART,
    bonificacion: r.EST_BON === 'B',
    cantidad: r.CANT_FAC,
    devuelta: r.CANT_DEV,
    precio: r.PRECIO,
    descuento: r.MONT_DESC,
    porcDescuento: r.PRC_DESC,
    total: r.TOTAL_LINEA,
  }));
}
