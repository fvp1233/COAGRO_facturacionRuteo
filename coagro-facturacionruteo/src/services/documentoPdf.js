import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { getArchivo } from './api';
import { PATHS } from '../config/api';

// Descarga del backend el PDF del documento (DTE) y abre el menú del sistema para guardarlo
// (Archivos, Drive...) o compartirlo; desde ahí el usuario lo imprime con su celular.
// numero: número del documento tal como lo identifica el backend (NUM_DOC).
export async function descargarDocumentoPdf(numero) {
  const bytes = await getArchivo(PATHS.dtePdf(numero));

  const archivo = new File(Paths.cache, `${nombreArchivo(numero)}.pdf`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite guardar ni compartir archivos.');
  }
  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Documento ${numero}`,
  });
}

const nombreArchivo = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || 'documento';
