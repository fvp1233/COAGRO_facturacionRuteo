import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { descargarPedidoPdf } from './documentoPdf';
import { getCompaniaCliente, getDocumentoPdf } from '../repositories/pedidos';
import { LOGO_COAGRO } from '../assets/logoCoagroPdf';

// PDF del pedido / cotización con dos modos:
//  - Servidor: si el documento ya está enviado (o ya no está en el equipo), se descarga el PDF que arma
//    el backend (GET /fr/mobile/cotizacion/:cia/:pedido/pdf).
//  - Equipo: si aún no se envió, no hay conexión o el servidor falla, se arma aquí con expo-print y los
//    datos de SQLite. Mismo diseño que template/cotizacion.html del backend: si cambia allá, cambiar aquí.

// Prefijo de la serie de cotizaciones (RUTA_CONSECUT_RT.FACTURA): un pedido con ese número vino de una
// cotización aprobada.
const PREFIJO_COTIZACION = 'COTRT';
const MONEDAS = { D: 'Dólar (USD)', L: 'Moneda local' };
// Emisor cuando aún no se han descargado los datos de la empresa (los mismos del recibo).
const EMISOR_DEFECTO = {
  nombre: 'COMERCIAL AGROPECUARIA S.A. DE C.V.',
  direccion: 'Alameda Manuel Enrique Araujo No. 3519, Edificio Las Palmeras, San Salvador',
  telefono: '2510-8400',
};

const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const esc = (v) =>
  texto(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dinero = (v) => {
  const n = Number(v) || 0;
  const t = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${t}` : `$${t}`;
};
const cantidad = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
// 'YYYY-MM-DD...' -> 'DD/MM/YYYY' (como CONVERT(..., 103) del backend).
const fecha = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const ahora = () => {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};
const fila = (etiqueta, valor, claseValor = '') =>
  valor ? `<tr><td class="etq">${esc(etiqueta)}</td><td${claseValor ? ` class="${claseValor}"` : ''}>${valor}</td></tr>` : '';

// Datos del documento con los mismos nombres que usa armarPdf en el backend.
function datosPdf({ encabezado: e, lineas, lotesPorArticulo, empresa }) {
  const esCotizacion = texto(e.TIP_DOC) === 'C';
  const numero = texto(e.NUM_PED);
  const ruta = texto(e.COD_ZON);
  const nombreRuta = texto(e.RUTA_DESCRIPCION);
  const condicion = texto(e.COD_CND);
  const desCondicion = texto(e.DES_CND);
  const moneda = texto(e.MONEDA);
  const emp = empresa || {};
  return {
    titulo: esCotizacion ? 'COTIZACIÓN' : 'PEDIDO',
    etiquetaNumero: esCotizacion ? 'No. cotización' : 'No. pedido',
    numero,
    cotizacionOrigen: !esCotizacion && numero.startsWith(PREFIJO_COTIZACION) ? numero : '',
    fecha: fecha(e.FEC_PED),
    fechaEntrega: fecha(e.FEC_DES),
    emisor: empresa
      ? {
          nombre: texto(emp.nombreComercial) || texto(emp.nombre) || EMISOR_DEFECTO.nombre,
          nit: texto(emp.nit),
          nrc: texto(emp.nrc),
          direccion: texto(emp.complementoDir),
          telefono: texto(emp.telefono),
          correo: texto(emp.correoDte),
        }
      : { ...EMISOR_DEFECTO, nit: '', nrc: '', correo: '' },
    cliente: {
      codigo: texto(e.COD_CLT),
      nombre: texto(e.NOM_CLT) || texto(e.COD_CLT),
      contacto: texto(e.NOM_CTO),
      telefono: texto(e.NUM_TEL),
      direccion: texto(e.DIR_CLT),
    },
    ruta: nombreRuta ? `${ruta} - ${nombreRuta}` : ruta,
    condicionPago: desCondicion && desCondicion !== condicion ? `${condicion} - ${desCondicion}` : condicion,
    listaPrecio: texto(e.NIVEL_PRECIO),
    bodega: texto(e.COD_BOD),
    moneda: MONEDAS[moneda] || moneda || MONEDAS.D,
    direccionEntrega: texto(e.DETA_EMB) || texto(e.DIR_ENT),
    observaciones: texto(e.OBS_PED),
    lineas: lineas.map((l, i) => ({
      numero: texto(l.NUM_LN) || i + 1,
      codigo: texto(l.COD_ART),
      descripcion: texto(l.DES_ART) || texto(l.COD_ART),
      bonificacion: ['S', '1'].includes(texto(l.ART_BON).toUpperCase()),
      lotes: (lotesPorArticulo.get(l.COD_ART) || []).map((x) => ({ lote: texto(x.lote), vence: fecha(x.vence) })),
      cantidad: cantidad(l.CNT_MAX),
      precio: dinero(l.MON_PRC_MX),
      descuento: dinero(l.MON_DSC),
      total: dinero(l.MON_TOT),
    })),
    totales: {
      subtotal: dinero(e.MON_SIV),
      descuento: dinero(e.MON_DSC),
      impuesto: dinero(e.MON_IMP_VT),
      total: dinero(e.MON_CIV),
    },
    generado: ahora(),
  };
}

// Copia de template/cotizacion.html del backend (Handlebars) escrita como template string.
function htmlPedido(d) {
  const em = d.emisor;
  const lineaEmisor1 = [em.nit ? `NIT: ${esc(em.nit)}` : '', em.nrc ? `NRC: ${esc(em.nrc)}` : '']
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');
  const lineaEmisor3 = [em.telefono ? `Tel.: ${esc(em.telefono)}` : '', esc(em.correo)].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const lineas = d.lineas
    .map(
      (l) => `
      <tr>
        <td>${esc(l.numero)}</td>
        <td class="cod">${esc(l.codigo)}</td>
        <td>${esc(l.descripcion)}${l.bonificacion ? ' <em class="verde">(bonificación)</em>' : ''}</td>
        <td class="lote">${
          l.lotes.length
            ? l.lotes.map((x) => `<div>${esc(x.lote)} <span class="vence">${esc(x.vence)}</span></div>`).join('')
            : '<span class="vence">—</span>'
        }</td>
        <td class="num">${esc(l.cantidad)}</td>
        <td class="num">${esc(l.precio)}</td>
        <td class="num">${esc(l.descuento)}</td>
        <td class="num">${esc(l.total)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${esc(d.titulo)} ${esc(d.numero)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 14mm 12mm; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5px; color: #2b2b2b; }
    .verde { color: #2e8b3a; }

    .encabezado { display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px; border-bottom: 3px solid #2e8b3a; }
    .emisor { display: flex; align-items: center; gap: 14px; }
    .emisor img { width: 105px; height: auto; }
    .emisor h1 { font-size: 15px; color: #1f6b2a; margin-bottom: 3px; }
    .emisor p { font-size: 9.5px; color: #555; line-height: 1.45; }

    .caja-doc { min-width: 200px; border: 1.5px solid #2e8b3a; border-radius: 6px; overflow: hidden; text-align: center; }
    .caja-doc .tipo { background: #2e8b3a; color: #fff; font-size: 17px; font-weight: 700;
      letter-spacing: 2px; padding: 7px 10px; }
    .caja-doc table { width: 100%; border-collapse: collapse; }
    .caja-doc td { padding: 4px 10px; font-size: 10px; text-align: left; }
    .caja-doc td.etq { color: #666; width: 45%; }
    .caja-doc td.val { font-weight: 600; text-align: right; }
    .caja-doc tr + tr td { border-top: 1px solid #e3efe5; }

    .bloques { display: flex; gap: 12px; margin-top: 14px; }
    .bloque { flex: 1; border: 1px solid #d9e8dc; border-radius: 6px; }
    .bloque h3 { background: #eef6ef; color: #1f6b2a; font-size: 10px; text-transform: uppercase;
      letter-spacing: 1px; padding: 5px 10px; border-bottom: 1px solid #d9e8dc; }
    .bloque table { width: 100%; border-collapse: collapse; }
    .bloque td { padding: 3px 10px; vertical-align: top; }
    .bloque td.etq { color: #666; width: 32%; white-space: nowrap; }

    .detalle { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .detalle thead th { background: #2e8b3a; color: #fff; font-size: 9.5px; font-weight: 600;
      text-transform: uppercase; padding: 7px 6px; text-align: left; }
    .detalle thead th.num { text-align: right; }
    .detalle tbody td { padding: 6px; border-bottom: 1px solid #e6e6e6; }
    .detalle tbody tr:nth-child(even) td { background: #f7fbf7; }
    .detalle td.num { text-align: right; white-space: nowrap; }
    .detalle td.cod { color: #555; white-space: nowrap; }
    .detalle td.lote { font-size: 9px; white-space: nowrap; }
    .detalle td.lote .vence { color: #777; }
    .detalle tr { page-break-inside: avoid; }

    .pie-detalle { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; page-break-inside: avoid; }
    .observaciones { flex: 1; border: 1px solid #d9e8dc; border-radius: 6px; padding: 8px 10px; min-height: 70px; }
    .observaciones h4 { color: #1f6b2a; font-size: 10px; text-transform: uppercase; margin-bottom: 4px; }
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
    .acento { height: 4px; margin-top: 6px; background: linear-gradient(90deg, #2e8b3a 0%, #7cc242 60%, #f39200 100%); border-radius: 2px; }
  </style>
</head>
<body>
  <div class="encabezado">
    <div class="emisor">
      <img src="${LOGO_COAGRO}" alt="Coagro" />
      <div>
        <h1>${esc(em.nombre)}</h1>
        <p>
          ${lineaEmisor1 ? `${lineaEmisor1}<br />` : ''}
          ${em.direccion ? `${esc(em.direccion)}<br />` : ''}
          ${lineaEmisor3}
        </p>
      </div>
    </div>
    <div class="caja-doc">
      <div class="tipo">${esc(d.titulo)}</div>
      <table>
        <tr><td class="etq">${esc(d.etiquetaNumero)}</td><td class="val">${esc(d.numero)}</td></tr>
        ${d.cotizacionOrigen ? `<tr><td class="etq">Cotización</td><td class="val">${esc(d.cotizacionOrigen)}</td></tr>` : ''}
        <tr><td class="etq">Fecha</td><td class="val">${esc(d.fecha)}</td></tr>
        ${d.fechaEntrega ? `<tr><td class="etq">Entrega</td><td class="val">${esc(d.fechaEntrega)}</td></tr>` : ''}
      </table>
    </div>
  </div>
  <div class="acento"></div>

  <div class="bloques">
    <div class="bloque">
      <h3>Cliente</h3>
      <table>
        <tr><td class="etq">Código</td><td>${esc(d.cliente.codigo)}</td></tr>
        <tr><td class="etq">Nombre</td><td><strong>${esc(d.cliente.nombre)}</strong></td></tr>
        ${fila('Contacto', esc(d.cliente.contacto))}
        ${fila('Teléfono', esc(d.cliente.telefono))}
        ${fila('Dirección', esc(d.cliente.direccion))}
      </table>
    </div>
    <div class="bloque">
      <h3>Condiciones</h3>
      <table>
        <tr><td class="etq">Ruta / vendedor</td><td>${esc(d.ruta)}</td></tr>
        ${fila('Cond. de pago', esc(d.condicionPago))}
        ${fila('Lista de precio', esc(d.listaPrecio))}
        ${fila('Bodega', esc(d.bodega))}
        <tr><td class="etq">Moneda</td><td>${esc(d.moneda)}</td></tr>
        ${fila('Entregar en', esc(d.direccionEntrega))}
      </table>
    </div>
  </div>

  <table class="detalle">
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th style="width: 85px;">Código</th>
        <th>Descripción</th>
        <th style="width: 110px;">Lote / Vence</th>
        <th class="num" style="width: 60px;">Cant.</th>
        <th class="num" style="width: 80px;">Precio</th>
        <th class="num" style="width: 75px;">Desc.</th>
        <th class="num" style="width: 90px;">Total</th>
      </tr>
    </thead>
    <tbody>${lineas}
    </tbody>
  </table>

  <div class="pie-detalle">
    <div class="observaciones">
      <h4>Observaciones</h4>
      <p>${d.observaciones ? esc(d.observaciones) : '—'}</p>
    </div>
    <table class="totales">
      <tr><td>Subtotal</td><td class="val">${esc(d.totales.subtotal)}</td></tr>
      <tr><td>Descuento</td><td class="val">- ${esc(d.totales.descuento)}</td></tr>
      <tr><td>IVA</td><td class="val">${esc(d.totales.impuesto)}</td></tr>
      <tr class="total"><td>TOTAL</td><td class="val">${esc(d.totales.total)}</td></tr>
    </table>
  </div>

  <div class="condiciones">
    <strong>Condiciones:</strong> Precios sujetos a disponibilidad de inventario al momento de confirmar el pedido.
    Este documento es una cotización y no constituye un documento tributario.
  </div>

  <div class="firmas">
    <div class="firma">Elaborado por</div>
    <div class="firma">Aceptado por el cliente</div>
  </div>

  <p class="nota">Generado el ${esc(d.generado)} · ${esc(em.nombre)}</p>
</body>
</html>`;
}

// Arma el PDF en el equipo y abre el menú del sistema para guardarlo, compartirlo o imprimirlo.
// Como en el recibo: expo-print lo deja en una carpeta que expo-sharing no puede leer, así que se
// pide en base64 y se escribe en la caché de la app.
async function compartirPdfLocal(documento) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite guardar ni compartir archivos.');
  }
  const d = datosPdf(documento);
  const { base64 } = await Print.printToFileAsync({ html: htmlPedido(d), base64: true });
  if (!base64) throw new Error('No se pudo generar el PDF.');

  const prefijo = d.titulo === 'PEDIDO' ? 'Pedido' : 'Cotizacion';
  const archivo = new File(Paths.cache, `${prefijo}_${d.numero.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  await archivo.write(base64, { encoding: 'base64' });

  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${d.titulo === 'PEDIDO' ? 'Pedido' : 'Cotización'} ${d.numero}`,
  });
}

// Imprime (PDF) un pedido o cotización.
//   ruta: COD_ZON. numero: NUM_PED.
//   compania, cliente, cotizacion: solo se usan si el documento ya no está en el equipo (para pedirlo
//   al servidor); si está, salen de alFAC_ENC_PED.
// Si está enviado (o ya no está en el equipo) se intenta el PDF del servidor; si eso falla (sin
// conexión, sesión vencida, error del servidor) y el documento está en el equipo, se arma aquí.
// Devuelve 'servidor' o 'equipo'. Lanza el error del servidor si no hay forma de armarlo.
export async function imprimirPedido({ ruta, numero, compania = null, cliente = null, cotizacion = false }) {
  const local = await getDocumentoPdf(ruta, numero);
  // Una aprobación sin enviar cambia el documento (pasa a pedido): el del servidor estaría desactualizado.
  const enServidor = !local || (local.encabezado.ENVIADO === 1 && !local.encabezado.APROBACION_PENDIENTE);

  if (enServidor) {
    const cia = local?.encabezado.COD_CIA ?? compania ?? (cliente ? await getCompaniaCliente(cliente) : null);
    const esCotizacion = local ? texto(local.encabezado.TIP_DOC) === 'C' : cotizacion;
    try {
      if (!cia) throw new Error(`No se conoce la compañía del documento ${numero}.`);
      await descargarPedidoPdf(cia, numero, esCotizacion);
      return 'servidor';
    } catch (e) {
      if (!local) throw e;
    }
  }

  await compartirPdfLocal(local);
  return 'equipo';
}
