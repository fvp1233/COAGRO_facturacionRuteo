// Montos de un documento del historial (pedido o factura) calculados en el equipo, sin internet,
// con la misma fórmula del backend (sqlMontos), sobre el total de cada línea guardada:
//   totalMercaderia  = Σ total de todas las líneas
//   descuentoVolumen = Σ total de las líneas EST_BON = 'B' (bonificaciones)
//   subtotal         = Σ total de las líneas EST_BON = 'V'
//   iva              = subtotal × 13 % TRUNCADO a 2 decimales (como el ERP: 199.50 × 0.13 = 25.935
//                      → 25.93, y el documento queda en 225.43; redondeando saldría 225.44)
//   granTotal        = subtotal + iva
// Las cuentas se hacen en centavos enteros para no arrastrar errores de punto flotante.
// lineas: [{ estBon ('V' | 'B'), total }]. sinMonto = líneas con total null (no suman).
export const IVA_PORCENTAJE = 13;

const aCentavos = (n) => Math.round(Number(n) * 100);

export function calcularMontos(lineas) {
  const conMonto = lineas.filter((l) => l.total != null);
  const suma = (lista) => lista.reduce((s, l) => s + aCentavos(l.total), 0);
  const subtotal = suma(conMonto.filter((l) => l.estBon === 'V'));
  const iva = Math.floor((subtotal * IVA_PORCENTAJE) / 100);
  return {
    montos: {
      totalMercaderia: suma(conMonto) / 100,
      descuentoVolumen: suma(conMonto.filter((l) => l.estBon === 'B')) / 100,
      subtotal: subtotal / 100,
      iva: iva / 100,
      granTotal: (subtotal + iva) / 100,
    },
    sinMonto: lineas.length - conMonto.length,
  };
}
