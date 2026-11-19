import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { getArchivo } from './api';
import { PATHS } from '../config/api';

// Descarga del backend el PDF del documento (DTE) y abre el menú del sistema para guardarlo
// (Archivos, Drive...) o compartirlo; desde ahí el usuario lo imprime con su celular.
// numero: número del documento tal como lo identifica el backend (NUM_DOC).
export function descargarDocumentoPdf(numero) {
  return descargarPdf(PATHS.dtePdf(numero), numero, `Documento ${numero}`);
}

// Igual, para un pedido o cotización ya enviado al servidor (llave COD_CIA + NUM_PED). Normalmente se
// usa imprimirPedido (services/pedidoPdf), que si no se puede arma el PDF en el equipo.
export function descargarPedidoPdf(cia, numero, esCotizacion) {
  const tipo = esCotizacion ? 'Cotización' : 'Pedido';
  return descargarPdf(PATHS.cotizacionPdf(cia, numero), `${esCotizacion ? 'Cotizacion' : 'Pedido'}_${numero}`, `${tipo} ${numero}`);
}

// Igual, para el recibo de cobro de un documento ya enviado (NUM_DEP + CTA_BCO, una página: numDoc).
// Normalmente se usa imprimirRecibo (services/reciboPdf), que si no se puede lo arma en el equipo.
export function descargarReciboPdf(numDep, ctaBco, numDoc) {
  return descargarPdf(PATHS.reciboPdf(numDep, ctaBco, numDoc), `Recibo_${numDep}`, `Recibo ${numDep}`);
}

async function descargarPdf(path, nombre, titulo) {
  const bytes = await getArchivo(path);

  const archivo = new File(Paths.cache, `${nombreArchivo(nombre)}.pdf`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite guardar ni compartir archivos.');
  }
  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: titulo,
  });
}

const nombreArchivo = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || 'documento';
