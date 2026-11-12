import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';

import { formatMonto } from '../utils/formato';
import { montoALetras } from '../utils/numeroALetras';
import { LOGO_COAGRO } from '../assets/logoCoagroPdf';

// Recibo de cobro en PDF con el diseño de la cotización (logo de Coagro, colores verdes): se genera
// en el equipo con expo-print y se abre el menú del sistema para guardarlo, compartirlo o imprimirlo.

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const monto = (n) => (n ? formatMonto(n) : '');

// 'YYYY-MM-DD HH:MM:SS' → { dia, mes, anio }.
export const partesFecha = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? { dia: m[3], mes: m[2], anio: m[1] } : { dia: '', mes: '', anio: '' };
};

// "Cuenta: Nombre de la cuenta · Cta. 123" (sin el código del banco, que confunde).
// Los pagos registrados antes de los recibos no tienen cuenta.
export const textoCuenta = (r) =>
  r.cuenta
    ? `Cuenta: ${[r.nombreCuenta, `Cta. ${r.cuenta}`].filter(Boolean).join(' · ')}`
    : 'Cuenta: sin cuenta registrada (pago anterior a los recibos)';

// Filas de la tabla: la primera lleva el documento con efectivo, transferencia, depósito y el primer
// cheque; cada cheque adicional va en su propia fila.
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

// Datos fijos del emisor (los mismos del recibo físico).
const EMISOR = {
  nombre: 'COMERCIAL AGROPECUARIA S.A. DE C.V.',
  giro: 'Compra y venta de productos agrícolas y veterinarios',
  direccion: 'Alameda Manuel Enrique Araujo No. 3519, Edificio Las Palmeras, San Salvador',
  telefono: 'Tel.: 2510-8400 · Créditos y cobros: 2510-8440 / 2510-8464',
};

const MONEDAS = { D: 'Dólar (USD)', L: 'Moneda local' };

const ahoraTexto = () => {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// Recibo con el mismo diseño que el PDF de la cotización (template/cotizacion.html del backend):
// logo y datos del emisor, caja verde con el correlativo del recibo, bloques de cliente y del cobro,
// tabla de formas de pago, referencias, total y firmas.
function htmlRecibo(r) {
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
      <img src="${LOGO_COAGRO}" alt="Coagro" />
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

// Borra los PDF de recibos generados antes (Recibo_*.pdf en la caché de la app).
function borrarRecibosEnCache() {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && /^Recibo_.*\.pdf$/i.test(item.name)) item.delete();
    }
  } catch {
    // si no se puede listar o borrar, no impide generar el nuevo
  }
}

// Genera el PDF del recibo y abre el menú para compartirlo.
// expo-print deja el PDF en una carpeta propia que ni expo-sharing ni expo-file-system pueden leer
// (sobre todo en Expo Go: "Not allowed to read file" / "missing read permission"). Por eso se pide
// el PDF en base64 y se escribe en la caché de la app (como documentoPdf); se comparte esa copia.
export async function compartirReciboPdf(recibo) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite guardar ni compartir archivos.');
  }
  const { base64 } = await Print.printToFileAsync({ html: htmlRecibo(recibo), base64: true });
  if (!base64) throw new Error('No se pudo generar el PDF del recibo.');

  // Los PDF de recibos anteriores no se guardan: se pueden volver a generar desde el pago. Se borran
  // aquí (y no justo después de compartir, porque la app que lo recibe puede seguir leyéndolo).
  borrarRecibosEnCache();

  const nombre = String(recibo.recibo ?? recibo.id).replace(/[^A-Za-z0-9_-]/g, '_');
  const archivo = new File(Paths.cache, `Recibo_${nombre}.pdf`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  await archivo.write(base64, { encoding: 'base64' });

  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Recibo ${recibo.recibo}`,
  });
}
