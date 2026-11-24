import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { FORMAS_PAGO } from '../repositories/pagos';
import { LOGO_COAGRO } from '../assets/logoCoagroPdf';
import { formatFechaDoc, formatMonto, formatMontoMoneda } from '../utils/formato';

// Cierre de cobro del día (Reportes > Cierre de Cobro): cálculos compartidos por la pantalla y el PDF,
// y el PDF que se arma en el equipo con expo-print (100% offline). Mismos colores que el PDF del
// pedido (services/pedidoPdf).

// Orden de las formas de pago (el efectivo primero: es lo que se entrega).
export const ORDEN_FORMAS = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO'];

// Totales del cierre a partir de los recibos del día (getCierreCobroDia).
export function resumirCierre(recibos) {
  const formas = {};
  const cheques = [];
  const electronicos = [];
  const cuentas = new Map();
  for (const r of recibos) {
    for (const f of r.formas) {
      const actual = formas[f.forma] ?? { monto: 0, cantidad: 0 };
      formas[f.forma] = { monto: actual.monto + f.monto, cantidad: actual.cantidad + 1 };
      if (f.forma === 'CHEQUE') cheques.push({ ...f, recibo: r });
      else if (f.forma !== 'EFECTIVO') electronicos.push({ ...f, recibo: r });
    }
    const clave = `${r.banco}|${r.cuenta}`;
    const c = cuentas.get(clave) ?? { banco: r.banco, cuenta: r.cuenta, nombre: r.nombreCuenta, monto: 0, recibos: 0 };
    cuentas.set(clave, { ...c, monto: c.monto + r.monto, recibos: c.recibos + 1 });
  }
  const suma = (lista) => lista.reduce((s, x) => s + x.monto, 0);
  return {
    total: suma(recibos),
    clientes: new Set(recibos.map((r) => `${r.ruta}|${r.cliente}`)).size,
    cancelados: recibos.filter((r) => r.cancelado).length,
    sinEnviar: recibos.filter((r) => !r.enviado).length,
    efectivo: formas.EFECTIVO?.monto ?? 0,
    formas,
    cheques,
    totalCheques: suma(cheques),
    electronicos,
    totalElectronicos: suma(electronicos),
    cuentas: [...cuentas.values()].sort((a, b) => b.monto - a.monto),
  };
}

// Totales de lo que faltó cobrar (getNoCobradosHoy): saldo y cantidad de clientes.
export function resumirNoCobrados(pendientes) {
  return {
    saldo: pendientes.reduce((s, p) => s + p.saldo, 0),
    clientes: new Set(pendientes.map((p) => `${p.ruta}|${p.cliente}`)).size,
    vencenHoy: pendientes.filter((p) => p.dias === 0).length,
  };
}

const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const esc = (v) =>
  texto(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hora = (v) => /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0] ?? '';
const pad = (n) => String(n).padStart(2, '0');
const ahora = () => {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fechaLarga = () => new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const atraso = (dias) => (dias === 0 ? 'Vence hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`);

// Tabla con encabezado; filas = arreglo de arreglos de celdas (HTML ya escapado). num: índices de
// columnas numéricas (alineadas a la derecha). pie: fila final de total (o null).
function tabla(columnas, filas, { num = [], pie = null, vacio = 'Sin registros' } = {}) {
  const th = columnas.map((c, i) => `<th${num.includes(i) ? ' class="num"' : ''}>${c}</th>`).join('');
  const cuerpo = filas.length
    ? filas.map((f) => `<tr>${f.map((c, i) => `<td${num.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columnas.length}" class="vacio">${vacio}</td></tr>`;
  const pieHtml = pie
    ? `<tfoot><tr>${pie.map((c, i) => `<td${num.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<table class="detalle"><thead><tr>${th}</tr></thead><tbody>${cuerpo}</tbody>${pieHtml}</table>`;
}

function htmlCierre({ recibos, pendientes, rutas }) {
  const c = resumirCierre(recibos);
  const nc = resumirNoCobrados(pendientes);

  const formas = ORDEN_FORMAS.filter((k) => c.formas[k]).map((k) => [
    esc(FORMAS_PAGO[k]),
    String(c.formas[k].cantidad),
    esc(formatMonto(c.formas[k].monto)),
  ]);

  const cheques = c.cheques.map((x) => [
    esc(x.numeroCheque || 's/n'),
    esc(x.banco),
    esc(x.cuenta),
    esc(formatFechaDoc(x.fecha)),
    esc(x.recibo.nombreCliente),
    esc(x.recibo.recibo),
    esc(formatMonto(x.monto)),
  ]);

  const electronicos = c.electronicos.map((x) => [
    esc(FORMAS_PAGO[x.forma] ?? x.forma),
    esc(x.transaccion),
    esc(x.recibo.nombreCliente),
    esc(x.recibo.recibo),
    esc(formatMonto(x.monto)),
  ]);

  const cuentas = c.cuentas.map((x) => [
    esc(x.nombre || 'Sin nombre'),
    esc(x.banco),
    esc(x.cuenta),
    String(x.recibos),
    esc(formatMonto(x.monto)),
  ]);

  const listaRecibos = recibos.map((r) => [
    esc(hora(r.fecha)),
    esc(r.recibo || 's/n'),
    `${esc(r.nombreCliente)}<div class="sub">${esc(r.cliente)}</div>`,
    esc(r.documento),
    esc(r.formas.map((f) => FORMAS_PAGO[f.forma] ?? f.forma).join(' + ')),
    r.cancelado ? 'Cancelado' : 'Abono',
    r.enviado ? 'Enviado' : '<span class="naranja">Sin enviar</span>',
    esc(formatMonto(r.monto)),
  ]);

  const listaPendientes = pendientes.map((p) => [
    `${esc(p.nombre)}<div class="sub">${esc(p.cliente)} · Ruta ${esc(p.ruta)}</div>`,
    `${esc(p.documento)}${p.tipo ? `<div class="sub">${esc(p.tipo)}</div>` : ''}`,
    esc(formatFechaDoc(p.vence)),
    p.dias === 0 ? '<span class="naranja">Vence hoy</span>' : `<span class="rojo">${esc(atraso(p.dias))}</span>`,
    esc(formatMontoMoneda(p.saldo, String(p.moneda).toUpperCase().startsWith('D') ? 'D' : p.moneda)),
  ]);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cierre de cobro</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 14mm 12mm; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5px; color: #2b2b2b; }
    .naranja { color: #b85f00; font-weight: 600; }
    .rojo { color: #a31a13; font-weight: 600; }
    .sub { font-size: 8.5px; color: #777; }

    .encabezado { display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px; border-bottom: 3px solid #2e8b3a; }
    .emisor { display: flex; align-items: center; gap: 14px; }
    .emisor img { width: 105px; height: auto; }
    .emisor h1 { font-size: 15px; color: #1f6b2a; margin-bottom: 3px; }
    .emisor p { font-size: 9.5px; color: #555; line-height: 1.45; text-transform: capitalize; }
    .caja-doc { min-width: 200px; border: 1.5px solid #2e8b3a; border-radius: 6px; overflow: hidden; text-align: center; }
    .caja-doc .tipo { background: #2e8b3a; color: #fff; font-size: 15px; font-weight: 700; letter-spacing: 2px; padding: 7px 10px; }
    .caja-doc table { width: 100%; border-collapse: collapse; }
    .caja-doc td { padding: 4px 10px; font-size: 10px; text-align: left; }
    .caja-doc td.etq { color: #666; }
    .caja-doc td.val { font-weight: 600; text-align: right; }
    .caja-doc tr + tr td { border-top: 1px solid #e3efe5; }
    .acento { height: 4px; margin-top: 6px; background: linear-gradient(90deg, #2e8b3a 0%, #7cc242 60%, #f39200 100%); border-radius: 2px; }

    .kpis { display: flex; gap: 10px; margin-top: 14px; }
    .kpi { flex: 1; border: 1px solid #d9e8dc; border-radius: 6px; padding: 8px 10px; }
    .kpi .etq { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .kpi .val { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .kpi .sub { margin-top: 2px; }
    .kpi.verde { background: #2e8b3a; border-color: #2e8b3a; color: #fff; }
    .kpi.verde .etq, .kpi.verde .sub { color: #e8f5ea; }
    .kpi.alerta { border-color: #f3c38b; background: #fff6ec; }

    h2 { font-size: 11px; color: #1f6b2a; text-transform: uppercase; letter-spacing: 1px; margin: 16px 0 6px; }
    h2.rojo { color: #a31a13; }
    .detalle { width: 100%; border-collapse: collapse; }
    .detalle thead th { background: #2e8b3a; color: #fff; font-size: 9px; font-weight: 600;
      text-transform: uppercase; padding: 6px; text-align: left; }
    .detalle.alerta thead th { background: #a31a13; }
    .detalle th.num, .detalle td.num { text-align: right; white-space: nowrap; }
    .detalle tbody td { padding: 5px 6px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
    .detalle tbody tr:nth-child(even) td { background: #f7fbf7; }
    .detalle tfoot td { padding: 6px; font-weight: 700; border-top: 2px solid #2e8b3a; }
    .detalle td.vacio { text-align: center; color: #999; padding: 10px; }
    .detalle tr { page-break-inside: avoid; }

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
        <h1>Cierre de cobro</h1>
        <p>${esc(fechaLarga())}${rutas ? `<br />Rutas: ${esc(rutas)}` : ''}</p>
      </div>
    </div>
    <div class="caja-doc">
      <div class="tipo">CIERRE</div>
      <table>
        <tr><td class="etq">Recibos</td><td class="val">${recibos.length}</td></tr>
        <tr><td class="etq">Clientes cobrados</td><td class="val">${c.clientes}</td></tr>
        <tr><td class="etq">Sin enviar</td><td class="val">${c.sinEnviar}</td></tr>
      </table>
    </div>
  </div>
  <div class="acento"></div>

  <div class="kpis">
    <div class="kpi verde">
      <div class="etq">Total cobrado</div>
      <div class="val">${esc(formatMonto(c.total))}</div>
      <div class="sub">${c.cancelados} ${c.cancelados === 1 ? 'documento cancelado' : 'documentos cancelados'}</div>
    </div>
    <div class="kpi">
      <div class="etq">Efectivo a entregar</div>
      <div class="val">${esc(formatMonto(c.efectivo))}</div>
    </div>
    <div class="kpi">
      <div class="etq">Cheques</div>
      <div class="val">${esc(formatMonto(c.totalCheques))}</div>
      <div class="sub">${c.cheques.length} ${c.cheques.length === 1 ? 'cheque' : 'cheques'}</div>
    </div>
    <div class="kpi alerta">
      <div class="etq">Faltó cobrar</div>
      <div class="val">${esc(formatMonto(nc.saldo))}</div>
      <div class="sub">${pendientes.length} doc. · ${nc.clientes} ${nc.clientes === 1 ? 'cliente' : 'clientes'}</div>
    </div>
  </div>

  <h2>Por forma de pago</h2>
  ${tabla(['Forma de pago', 'Cantidad', 'Monto'], formas, {
    num: [1, 2],
    pie: ['Total', String(formas.reduce((s, f) => s + Number(f[1]), 0)), esc(formatMonto(c.total))],
  })}

  ${
    cheques.length
      ? `<h2>Cheques</h2>${tabla(['No. cheque', 'Banco', 'Cuenta', 'Fecha', 'Cliente', 'Recibo', 'Monto'], cheques, {
          num: [6],
          pie: ['Total cheques', '', '', '', '', '', esc(formatMonto(c.totalCheques))],
        })}`
      : ''
  }

  ${
    electronicos.length
      ? `<h2>Transferencias y depósitos</h2>${tabla(['Forma', 'Transacción / boleta', 'Cliente', 'Recibo', 'Monto'], electronicos, {
          num: [4],
          pie: ['Total', '', '', '', esc(formatMonto(c.totalElectronicos))],
        })}`
      : ''
  }

  <h2>Por cuenta de banco</h2>
  ${tabla(['Cuenta', 'Banco', 'No. cuenta', 'Recibos', 'Monto'], cuentas, { num: [3, 4] })}

  <h2>Recibos del día</h2>
  ${tabla(['Hora', 'Recibo', 'Cliente', 'Documento', 'Formas', 'Tipo', 'Estado', 'Monto'], listaRecibos, {
    num: [7],
    pie: ['', '', '', '', '', '', 'Total', esc(formatMonto(c.total))],
    vacio: 'No se registraron recibos hoy',
  })}

  <h2 class="rojo">Faltó cobrar hoy</h2>
  <div class="sub" style="margin-bottom: 6px;">Documentos vencidos o que vencen hoy, con saldo pendiente y sin ningún abono hoy.</div>
  ${tabla(['Cliente', 'Documento', 'Vence', 'Atraso', 'Saldo'], listaPendientes, {
    num: [4],
    pie: ['Total pendiente', '', '', '', esc(formatMonto(nc.saldo))],
    vacio: 'No quedó nada vencido sin cobrar',
  }).replace('class="detalle"', 'class="detalle alerta"')}

  <div class="firmas">
    <div class="firma">Entregado por</div>
    <div class="firma">Recibido por</div>
  </div>

  <p class="nota">Generado en el equipo el ${esc(ahora())}</p>
</body>
</html>`;
}

// Arma el PDF del cierre en el equipo y abre el menú del sistema para guardarlo, compartirlo o
// imprimirlo. Como en el recibo: expo-print lo deja en una carpeta que expo-sharing no puede leer, así
// que se pide en base64 y se escribe en la caché de la app.
//   recibos: getCierreCobroDia(). pendientes: getNoCobradosHoy(). rutas: texto con las rutas.
export async function imprimirCierreCobro({ recibos, pendientes, rutas = '' }) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite guardar ni compartir archivos.');
  }
  const { base64 } = await Print.printToFileAsync({ html: htmlCierre({ recibos, pendientes, rutas }), base64: true });
  if (!base64) throw new Error('No se pudo generar el PDF.');

  const d = new Date();
  const archivo = new File(Paths.cache, `Cierre_cobro_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.pdf`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  await archivo.write(base64, { encoding: 'base64' });

  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Cierre de cobro',
  });
}
