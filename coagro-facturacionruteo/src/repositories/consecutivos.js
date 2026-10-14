import { getDatabase } from '../db/database';

// Consecutivos de documentos de una ruta (RUTA_CONSECUT_RT; se descargan en Datos > Cargar datos).
// null si la ruta no tiene registro.
export async function getConsecutivosRuta(ruta) {
  const db = await getDatabase();
  const r = await db.getFirstAsync(
    `SELECT PEDIDO, PEDIDO_DESCUENTO, RECIBO, INVENTARIO, DEVOLUCION, FACTURA, NOTACREDITO, GARANTIA
       FROM RUTA_CONSECUT_RT
      WHERE RUTA = ?`,
    [ruta]
  );
  if (!r) return null;

  return {
    pedido: r.PEDIDO ?? '',
    pedidoDescuento: r.PEDIDO_DESCUENTO ?? '',
    recibo: r.RECIBO ?? '',
    inventario: r.INVENTARIO ?? '',
    devolucion: r.DEVOLUCION ?? '',
    factura: r.FACTURA ?? '',
    notaCredito: r.NOTACREDITO ?? '',
    garantia: r.GARANTIA ?? '',
  };
}
