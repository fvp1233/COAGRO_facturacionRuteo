// Formatos de montos y fechas de documentos (alCXC_PEN_COB y similares).

// Los montos son en USD: $1,234.50 (coma de miles, punto decimal, dos decimales); vacío si no hay valor.
export const formatMonto = (n) => {
  if (n == null) return '';
  const valor = Number(n);
  const texto = Math.abs(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return valor < 0 ? `-$${texto}` : `$${texto}`;
};

// Cantidades con hasta 2 decimales (sin ceros sobrantes), mismo separador que los montos:
// 1234 -> "1,234", 2.5 -> "2.5".
export const formatCantidad = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Porcentaje con hasta 2 decimales: 5 -> "5%", 12.5 -> "12.5%"; vacío si no hay valor.
export const formatPorcentaje = (n) => (n == null ? '' : `${formatCantidad(n)}%`);

// Las fechas llegan de SQL Server como 'YYYY-MM-DD...'; se toman tal cual (sin pasar por la zona
// horaria, que las correría un día). Devuelve DD/MM/YY.
export const formatFechaDoc = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
};

// Vendedor (agente dueño de la ruta) de un documento: nombre, o el código si no hay nombre.
export const formatVendedor = (d) =>
  d?.nombreAgente || (d?.agente ? `Agente ${d.agente}` : 'Sin vendedor asignado');
