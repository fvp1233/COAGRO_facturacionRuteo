// Monto en letras para el recibo ("La suma de"): 209.14 → 'DOSCIENTOS NUEVE CON 14/100'.

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS',
  'OCHOCIENTOS', 'NOVECIENTOS',
];

// 0..999
function centenas(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[c];
  if (resto) {
    let r;
    if (resto < 10) r = UNIDADES[resto];
    else if (resto < 30) r = DIEZ_A_VEINTINUEVE[resto - 10];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      r = DECENAS[d] + (u ? ` Y ${UNIDADES[u]}` : '');
    }
    texto = texto ? `${texto} ${r}` : r;
  }
  return texto;
}

// 'VEINTIUNO MIL' -> 'VEINTIÚN MIL', 'TREINTA Y UNO MIL' -> 'TREINTA Y UN MIL'.
const apocope = (t) => t.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');

// Entero >= 0 en letras (hasta cientos de millones).
export function enteroALetras(n) {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(centenas(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocope(centenas(miles))} MIL`);
  if (resto) partes.push(centenas(resto));
  return partes.join(' ');
}

export function montoALetras(monto) {
  const centavosTotales = Math.round(Math.abs(Number(monto) || 0) * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = String(centavosTotales % 100).padStart(2, '0');
  return `${enteroALetras(entero)} CON ${centavos}/100`;
}
