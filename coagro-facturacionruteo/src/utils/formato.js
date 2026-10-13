// Formatos de montos y fechas de documentos (alCXC_PEN_COB y similares).

// 1.234,50 (dos decimales); vacío si no hay valor.
export const formatMonto = (n) =>
  n == null ? '' : Number(n).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Las fechas llegan de SQL Server como 'YYYY-MM-DD...'; se toman tal cual (sin pasar por la zona
// horaria, que las correría un día). Devuelve DD/MM/YY.
export const formatFechaDoc = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
};
