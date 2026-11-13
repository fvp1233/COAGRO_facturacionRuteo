// Recibo de cobro de Coagro: el MISMO formato que genera la app móvil (Cobros > Pagar > Recibo).
// Copiado de coagro-facturacionruteo/src/services/reciboPdf.js, utils/numeroALetras.js,
// utils/formato.js y repositories/depositos.js, sin dependencias: sirve en el navegador o en Node.
//
// Uso:
//   import { htmlRecibo } from './recibo.js';
//   const html = htmlRecibo(recibo, { logo: '/img/logo.jpeg' });
//   // Navegador: abrir en una ventana e imprimir (window.print) o meter en un iframe.
//   // Node: pasarlo a Puppeteer / html-pdf para sacar el PDF (formato carta, márgenes en @page).
//
// El objeto `recibo` se describe en LEEME.md (y en reciboDesdeServidor más abajo, que lo arma con
// las filas de erpadmin.alCXC_ENC_DEP + alCXC_DET_DEP).

// ---------------------------------------------------------------------------------------------------
// Datos fijos del emisor (los mismos del recibo físico).
export const EMISOR = {
  nombre: 'COMERCIAL AGROPECUARIA S.A. DE C.V.',
  giro: 'Compra y venta de productos agrícolas y veterinarios',
  direccion: 'Alameda Manuel Enrique Araujo No. 3519, Edificio Las Palmeras, San Salvador',
  telefono: 'Tel.: 2510-8400 · Créditos y cobros: 2510-8440 / 2510-8464',
};

const MONEDAS = { D: 'Dólar (USD)', L: 'Moneda local' };
const EPS = 0.005;

// ---------------------------------------------------------------------------------------------------
// Formatos

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Montos en USD: $1,234.50 (coma de miles, punto decimal, dos decimales); vacío si no hay valor.
export const formatMonto = (n) => {
  if (n == null) return '';
  const valor = Number(n);
  const texto = Math.abs(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return valor < 0 ? `-$${texto}` : `$${texto}`;
};

// En la tabla de formas de pago, las celdas en 0 van vacías.
const monto = (n) => (n ? formatMonto(n) : '');

// 'YYYY-MM-DD HH:MM:SS' → { dia, mes, anio } (sin pasar por Date: no se corre de día por la zona).
export const partesFecha = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? { dia: m[3], mes: m[2], anio: m[1] } : { dia: '', mes: '', anio: '' };
};

const ahoraTexto = () => {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// ---------------------------------------------------------------------------------------------------
// Monto en letras ("La suma de"): 209.14 → 'DOSCIENTOS NUEVE CON 14/100'.

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

export function montoALetras(valor) {
  const centavosTotales = Math.round(Math.abs(Number(valor) || 0) * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = String(centavosTotales % 100).padStart(2, '0');
  return `${enteroALetras(entero)} CON ${centavos}/100`;
}

// ---------------------------------------------------------------------------------------------------
// Filas de la tabla "Tipo de pago": la primera lleva el documento con efectivo, transferencia,
// depósito y el primer cheque; cada cheque adicional va en su propia fila.
export function filasRecibo(r) {
  const suma = (forma) => r.formas.filter((f) => f.forma === forma).reduce((s, f) => s + f.monto, 0);
  const cheques = r.formas.filter((f) => f.forma === 'CHEQUE');
  const base = {
    factura: r.documento,
    efectivo: suma('EFECTIVO'),
    transferencia: suma('TRANSFERENCIA'),
    deposito: suma('DEPOSITO'),
    estado: r.cancelado ? 'CANCELADO' : 'ABONO',
  };
  if (!cheques.length) return [{ ...base, cheque: 0, numero: '', banco: '', fecha: '' }];
  return cheques.map((c, i) => ({
    ...(i === 0 ? base : { factura: '', efectivo: 0, transferencia: 0, deposito: 0, estado: '' }),
    cheque: c.monto,
    numero: c.numeroCheque ?? '',
    banco: c.banco ?? '',
    fecha: c.fecha ?? '',
  }));
}

// ---------------------------------------------------------------------------------------------------
// HTML del recibo. opciones.logo: URL o data URI del logo de Coagro (el de la cotización:
// efacturaBackendCoagro/template/logo.jpeg). Sin logo se omite la imagen.
export function htmlRecibo(r, { logo = '' } = {}) {
  const f = partesFecha(r.fecha);
  const fecha = f.dia ? `${f.dia}/${f.mes}/${f.anio}` : '';
  const hora = /\d{2}:\d{2}/.exec(r.fecha ?? '')?.[0] ?? '';
  const filas = filasRecibo(r);
  const estado = r.cancelado ? 'CANCELADO' : 'ABONO';
  const referencias = r.formas
    .filter((x) => (x.forma === 'TRANSFERENCIA' || x.forma === 'DEPOSITO') && x.transaccion)
    .map((x) => `${x.forma === 'DEPOSITO' ? 'Depósito, boleta' : 'Transferencia'} No. ${x.transaccion} — ${formatMonto(x.monto)}`);
  const cuenta = r.cuenta ? [r.nombreCuenta, `Cta. ${r.cuenta}`].filter(Boolean).join(' · ') : 'Sin cuenta registrada';
  const saldoDespues = r.saldoNuevo != null ? Math.max(0, Number(r.saldoNuevo)) : null;

  const fila = (x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="cod">${esc(x.factura)}</td>
        <td class="num">${esc(monto(x.efectivo))}</td>
        <td class="num">${esc(monto(x.cheque))}</td>
        <td>${esc(x.numero)}</td>
        <td>${esc(x.banco)}</td>
        <td>${esc(x.fecha)}</td>
        <td class="num">${esc(monto(x.transferencia))}</td>
        <td class="num">${esc(monto(x.deposito))}</td>
        <td class="estado">${x.estado ? `<span class="chip ${r.cancelado ? 'ok' : 'abono'}">${esc(x.estado)}</span>` : ''}</td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Recibo ${esc(r.recibo)}</title>
  <style>
    @page { margin: 16mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Roboto, Arial, Helvetica, sans-serif; font-size: 10.5px; color: #2b2b2b; }

    .encabezado { display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px; border-bottom: 3px solid #2e8b3a; }
    .emisor { display: flex; align-items: center; gap: 14px; }
    .emisor img { width: 96px; height: auto; }
    .emisor h1 { font-size: 15px; color: #1f6b2a; margin-bottom: 3px; }
    .emisor p { font-size: 9.5px; color: #555; line-height: 1.45; }

    .caja-doc { min-width: 210px; border: 1.5px solid #2e8b3a; border-radius: 6px; overflow: hidden; text-align: center; }
    .caja-doc .tipo { background: #2e8b3a; color: #fff; font-size: 17px; font-weight: 700;
      letter-spacing: 2px; padding: 7px 10px; }
    .caja-doc .correlativo { font-size: 15px; font-weight: 800; color: #1f6b2a; padding: 7px 10px 6px;
      letter-spacing: 0.5px; border-bottom: 1px solid #e3efe5; }
    .caja-doc .correlativo small { display: block; font-size: 8.5px; font-weight: 600; color: #666;
      letter-spacing: 1px; text-transform: uppercase; margin-bottom: 1px; }
    .caja-doc table { width: 100%; border-collapse: collapse; }
    .caja-doc td { padding: 4px 10px; font-size: 10px; text-align: left; }
    .caja-doc td.etq { color: #666; width: 45%; }
    .caja-doc td.val { font-weight: 600; text-align: right; }
    .caja-doc tr + tr td { border-top: 1px solid #e3efe5; }

    .acento { height: 4px; margin-top: 6px; background: linear-gradient(90deg, #2e8b3a 0%, #7cc242 60%, #f39200 100%); border-radius: 2px; }

    .bloques { display: flex; gap: 12px; margin-top: 14px; }
    .bloque { flex: 1; border: 1px solid #d9e8dc; border-radius: 6px; }
    .bloque h3 { background: #eef6ef; color: #1f6b2a; font-size: 10px; text-transform: uppercase;
      letter-spacing: 1px; padding: 5px 10px; border-bottom: 1px solid #d9e8dc; }
    .bloque table { width: 100%; border-collapse: collapse; }
    .bloque td { padding: 3px 10px; vertical-align: top; }
    .bloque td.etq { color: #666; width: 34%; white-space: nowrap; }

    .suma { margin-top: 14px; border: 1px solid #d9e8dc; border-left: 4px solid #2e8b3a; border-radius: 6px;
      padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .suma .etq { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .suma .letras { font-size: 11.5px; font-weight: 700; color: #1f6b2a; margin-top: 2px; }
    .suma .cifra { font-size: 18px; font-weight: 800; color: #1f6b2a; white-space: nowrap; }

    .titulo-tabla { margin-top: 16px; font-size: 10px; font-weight: 700; color: #1f6b2a; text-transform: uppercase; letter-spacing: 1px; }
    .detalle { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .detalle thead th { background: #2e8b3a; color: #fff; font-size: 9px; font-weight: 600;
      text-transform: uppercase; padding: 7px 5px; text-align: left; }
    .detalle thead th.num { text-align: right; }
    .detalle tbody td { padding: 6px 5px; border-bottom: 1px solid #e6e6e6; }
    .detalle tbody tr:nth-child(even) td { background: #f7fbf7; }
    .detalle td.num { text-align: right; white-space: nowrap; }
    .detalle td.cod { font-weight: 600; white-space: nowrap; }
    .detalle td.estado { text-align: center; }
    .detalle tr { page-break-inside: avoid; }
    .chip { display: inline-block; border-radius: 10px; padding: 2px 8px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; }
    .chip.ok { background: #e3f2e5; color: #1f6b2a; }
    .chip.abono { background: #fdeed9; color: #b85f00; }

    .pie-detalle { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; page-break-inside: avoid; }
    .observaciones { flex: 1; border: 1px solid #d9e8dc; border-radius: 6px; padding: 8px 10px; min-height: 70px; }
    .observaciones h4 { color: #1f6b2a; font-size: 10px; text-transform: uppercase; margin-bottom: 4px; }
    .observaciones p { line-height: 1.5; }
    .totales { width: 250px; border-collapse: collapse; }
    .totales td { padding: 5px 10px; }
    .totales td.val { text-align: right; font-weight: 600; }
    .totales tr + tr td { border-top: 1px solid #e6e6e6; }
    .totales tr.total td { background: #2e8b3a; color: #fff; font-size: 13px; font-weight: 700; border: none; }
    .totales tr.total td:first-child { border-radius: 6px 0 0 6px; }
    .totales tr.total td:last-child { border-radius: 0 6px 6px 0; }

    .condiciones { margin-top: 16px; font-size: 9px; color: #666; line-height: 1.5; page-break-inside: avoid; }
    .condiciones strong { color: #444; }
    .firmas { display: flex; justify-content: space-around; margin-top: 46px; page-break-inside: avoid; }
    .firma { width: 210px; border-top: 1px solid #888; padding-top: 4px; text-align: center; font-size: 9.5px; color: #555; }
    .nota { margin-top: 18px; text-align: center; font-size: 8.5px; color: #999; }
  </style>
</head>
<body>
  <div class="encabezado">
    <div class="emisor">
      ${logo ? `<img src="${esc(logo)}" alt="Coagro" />` : ''}
      <div>
        <h1>${esc(EMISOR.nombre)}</h1>
        <p>
          ${esc(EMISOR.giro)}<br />
          ${esc(EMISOR.direccion)}<br />
          ${esc(EMISOR.telefono)}
        </p>
      </div>
    </div>
    <div class="caja-doc">
      <div class="tipo">RECIBO</div>
      <div class="correlativo"><small>No. de recibo</small>${esc(r.recibo || 'Sin número')}</div>
      <table>
        <tr><td class="etq">Fecha</td><td class="val">${esc(fecha)}</td></tr>
        ${hora ? `<tr><td class="etq">Hora</td><td class="val">${esc(hora)}</td></tr>` : ''}
        <tr><td class="etq">Documento</td><td class="val">${esc(r.documento)}</td></tr>
        <tr><td class="etq">Estado</td><td class="val">${esc(estado)}</td></tr>
      </table>
    </div>
  </div>
  <div class="acento"></div>

  <div class="bloques">
    <div class="bloque">
      <h3>Recibimos de</h3>
      <table>
        <tr><td class="etq">Código</td><td>${esc(r.cliente)}</td></tr>
        <tr><td class="etq">Nombre</td><td><strong>${esc(r.nombreCliente)}</strong></td></tr>
      </table>
    </div>
    <div class="bloque">
      <h3>Datos del cobro</h3>
      <table>
        <tr><td class="etq">Técnico / ruta</td><td>${esc([r.tecnico, r.nombreTecnico].filter(Boolean).join(' - '))}</td></tr>
        <tr><td class="etq">Moneda</td><td>${esc(MONEDAS[r.moneda] ?? r.moneda ?? '')}</td></tr>
        <tr><td class="etq">Cuenta</td><td>${esc(cuenta)}</td></tr>
      </table>
    </div>
  </div>

  <div class="suma">
    <div>
      <div class="etq">La suma de</div>
      <div class="letras">${esc(montoALetras(r.monto))} DÓLARES</div>
    </div>
    <div class="cifra">${esc(formatMonto(r.monto))}</div>
  </div>

  <div class="titulo-tabla">Tipo de pago</div>
  <table class="detalle">
    <thead>
      <tr>
        <th style="width: 22px;">#</th>
        <th>Factura No.</th>
        <th class="num">Efectivo</th>
        <th class="num">Cheque</th>
        <th>Número</th>
        <th>Banco</th>
        <th>Fecha</th>
        <th class="num">Transf.</th>
        <th class="num">Depósito</th>
        <th style="text-align:center;">Cancelado / abono</th>
      </tr>
    </thead>
    <tbody>${filas.map(fila).join('')}
    </tbody>
  </table>

  <div class="pie-detalle">
    <div class="observaciones">
      <h4>Referencias y notas</h4>
      <p>${referencias.length ? referencias.map(esc).join('<br />') : '—'}</p>
      ${r.notas ? `<p style="margin-top:6px;"><strong>Notas:</strong> ${esc(r.notas)}</p>` : ''}
    </div>
    <table class="totales">
      ${r.saldoAnterior != null ? `<tr><td>Saldo anterior</td><td class="val">${esc(formatMonto(Math.max(0, Number(r.saldoAnterior))))}</td></tr>` : ''}
      <tr><td>Pagado</td><td class="val">${esc(formatMonto(r.monto))}</td></tr>
      ${saldoDespues != null ? `<tr><td>Saldo pendiente</td><td class="val">${esc(formatMonto(saldoDespues))}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="val">${esc(formatMonto(r.monto))}</td></tr>
    </table>
  </div>

  <div class="condiciones">
    <strong>Importante:</strong> Este recibo no tiene validez si no lleva la firma del cliente y del técnico - vendedor.
    Todo cheque rechazado tendrá un cargo de $10.00 más IVA.
  </div>

  <div class="firmas">
    <div class="firma">Firma técnico - vendedor</div>
    <div class="firma">Firma cliente</div>
  </div>

  <p class="nota">Recibo ${esc(r.recibo || '')} · Generado el ${esc(ahoraTexto())} · ${esc(EMISOR.nombre)}</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------------------------------
// Para la web: arma el objeto `recibo` con lo que la app sube al servidor.
//
// La app guarda cada recibo como un depósito: un encabezado en erpadmin.alCXC_ENC_DEP (NUM_DEP = número
// del recibo, RERT_<ruta>_<n>) y una línea por documento en erpadmin.alCXC_DET_DEP con el monto de cada
// forma de pago (MON_EFE, MON_CHE, MON_TRA, MON_DEP) y REF, un texto con el detalle:
//   'TRA 778899; DEP 5566; CH 1234 BCO AGRICOLA CTA 5678 15/11/2026 $50.00'
// (REF admite 80 caracteres: con muchos cheques se recorta y lo que falte sale como cheque sin detalle).
//
//   enc:   fila de alCXC_ENC_DEP  { NUM_DEP, FEC_DEP, IND_MON, CTA_BCO, NOTAS, ... }
//   linea: fila de alCXC_DET_DEP  { NUM_DOC, MON_EFE, MON_CHE, MON_TRA, MON_DEP, REF }
//   extra: lo que no está en esas tablas y la web consulta aparte:
//     { cliente, nombreCliente, tecnico, nombreTecnico, nombreCuenta, saldoAnterior, saldoNuevo }
//     saldoAnterior / saldoNuevo: saldo del documento antes y después del pago. Si no se mandan,
//     esas filas no salen y el estado queda en ABONO; con saldoNuevo <= 0 sale CANCELADO.
export function reciboDesdeServidor(enc, linea, extra = {}) {
  const formas = formasDeLinea(linea);
  const total = formas.reduce((s, f) => s + f.monto, 0);
  const saldoNuevo = extra.saldoNuevo ?? null;
  return {
    recibo: String(enc.NUM_DEP ?? '').trim(),
    fecha: String(enc.FEC_DEP ?? '').replace('T', ' '),
    documento: String(linea.NUM_DOC ?? '').trim(),
    moneda: String(enc.IND_MON ?? '').trim() === 'D' ? 'D' : 'L',
    monto: Math.round(total * 100) / 100,
    cuenta: String(enc.CTA_BCO ?? '').trim(),
    nombreCuenta: extra.nombreCuenta ?? '',
    notas: enc.NOTAS ?? '',
    cliente: extra.cliente ?? '',
    nombreCliente: extra.nombreCliente ?? extra.cliente ?? '',
    tecnico: extra.tecnico ?? '',
    nombreTecnico: extra.nombreTecnico ?? '',
    saldoAnterior: extra.saldoAnterior ?? null,
    saldoNuevo,
    cancelado: saldoNuevo != null && Number(saldoNuevo) <= EPS,
    formas,
  };
}

const t = (v) => (v == null ? '' : String(v).trim());
const num = (v) => Number(v ?? 0) || 0;
const redondea = (n) => Math.round(n * 100) / 100;

// Formas de pago de una línea de alCXC_DET_DEP. Los números de transferencia / boleta y el detalle de
// los cheques salen de REF. Si REF se recortó y no cuadra con MON_CHE, lo que falte va en un cheque
// sin detalle.
export function formasDeLinea(l) {
  const partes = t(l.REF).split(';').map((x) => x.trim()).filter(Boolean);
  const tra = partes.map((x) => /^TRA (\S+)$/.exec(x)?.[1]).find(Boolean) ?? null;
  const dep = partes.map((x) => /^DEP (\S+)$/.exec(x)?.[1]).find(Boolean) ?? null;
  const cheques = partes
    .map((x) => /^CH (\S*)(?: BCO (.+?))?(?: CTA (\S+))?(?: (\d{2}\/\d{2}\/\d{4}))? \$([\d.]+)$/.exec(x))
    .filter(Boolean)
    .map((m) => ({
      forma: 'CHEQUE',
      monto: num(m[5]),
      numeroCheque: m[1] || null,
      banco: m[2] ?? null,
      cuenta: m[3] ?? null,
      fecha: m[4] ?? null,
    }));

  const formas = [];
  if (num(l.MON_EFE) > EPS) formas.push({ forma: 'EFECTIVO', monto: num(l.MON_EFE) });
  const totalCheques = num(l.MON_CHE);
  if (totalCheques > EPS) {
    let detallados = 0;
    for (const c of cheques) {
      if (detallados + c.monto > totalCheques + EPS) break;
      formas.push(c);
      detallados += c.monto;
    }
    if (totalCheques - detallados > EPS) formas.push({ forma: 'CHEQUE', monto: redondea(totalCheques - detallados) });
  }
  if (num(l.MON_TRA) > EPS) formas.push({ forma: 'TRANSFERENCIA', monto: num(l.MON_TRA), transaccion: tra });
  if (num(l.MON_DEP) > EPS) formas.push({ forma: 'DEPOSITO', monto: num(l.MON_DEP), transaccion: dep });
  return formas;
}
