import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';

import { ApiError, getArchivo, getJson, isAuthError, isNetworkError } from './api';
import { PATHS } from '../config/api';
import { getDatabase } from '../db/database';

// Fichas técnicas de artículos (PDF subido en la web).
// - La lista (ARTICULO + FECHA) se baja en Cargar datos y al abrir el reporte de artículos; es
//   liviana y no trae ningún PDF. Se guarda en FICHA_ARTICULO.
// - El PDF se baja solo al tocar "Ver ficha técnica" y se guarda en documentos/fichas/<articulo>.pdf;
//   mientras la FECHA no cambie se abre esa copia sin internet.
// - Si un artículo ya no viene en la lista (borraron la ficha en la web) se borra su copia local.

export const SIN_CONEXION_FICHA = 'Necesitas conexión para ver esta ficha.';

const text = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

// Carpeta de las copias (documentos de la app: no se borra como la caché).
const carpeta = () => new Directory(Paths.document, 'fichas');
const nombreArchivo = (articulo) => `${String(articulo).replace(/[^A-Za-z0-9_-]/g, '_') || 'articulo'}.pdf`;
const archivoFicha = (articulo) => new File(carpeta(), nombreArchivo(articulo));

function borrarCopia(articulo) {
  try {
    const f = archivoFicha(articulo);
    if (f.exists) f.delete();
  } catch {
    // si no se puede borrar, se reemplaza la próxima vez que se baje
  }
}

// Respuesta: { result: [{ ARTICULO, FECHA }] } (también acepta result.fichas / result.articulos).
function leerLista(json) {
  const r = json?.result;
  const filas = Array.isArray(r) ? r : r?.fichas ?? r?.articulos;
  if (!Array.isArray(filas)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (fichas de artículos).');
  }
  const lista = new Map();
  for (const f of filas) {
    const articulo = text(f?.ARTICULO ?? f?.articulo);
    if (articulo) lista.set(articulo, text(f?.FECHA ?? f?.fecha));
  }
  return lista;
}

// Descarga la lista sin tocar la base. Devuelve { guardar(db), resumen } como las demás descargas de
// Cargar datos: guardar va dentro de la transacción de la carga. Las copias de fichas que ya no
// existen se borran después, con limpiarCopias (no se borran archivos si la transacción falla).
export async function descargarFichasArticulo() {
  const lista = leerLista(await getJson(PATHS.fichaArticulo));
  const guardar = async (db) => {
    const actuales = await db.getAllAsync('SELECT ARTICULO FROM FICHA_ARTICULO');
    for (const { ARTICULO } of actuales) {
      if (!lista.has(ARTICULO)) await db.runAsync('DELETE FROM FICHA_ARTICULO WHERE ARTICULO = ?', [ARTICULO]);
    }
    for (const [articulo, fecha] of lista) {
      // FECHA_LOCAL se conserva: si la FECHA cambió, la copia queda vieja y se vuelve a bajar al abrirla.
      await db.runAsync(
        `INSERT INTO FICHA_ARTICULO (ARTICULO, FECHA) VALUES (?, ?)
         ON CONFLICT(ARTICULO) DO UPDATE SET FECHA = excluded.FECHA`,
        [articulo, fecha]
      );
    }
  };
  return { guardar, resumen: { fichas: lista.size, omitidos: 0 } };
}

// Borra las copias locales de artículos que ya no están en FICHA_ARTICULO.
export async function limpiarCopiasFichas() {
  const dir = carpeta();
  if (!dir.exists) return;
  const db = await getDatabase();
  const filas = await db.getAllAsync('SELECT ARTICULO FROM FICHA_ARTICULO');
  const validos = new Set(filas.map((f) => nombreArchivo(f.ARTICULO)));
  for (const item of dir.list()) {
    if (item instanceof File && !validos.has(item.name)) {
      try {
        item.delete();
      } catch {
        // se intenta de nuevo en la próxima limpieza
      }
    }
  }
}

// Baja la lista, la guarda y limpia las copias. Para usar fuera de Cargar datos (al abrir el reporte).
export async function actualizarFichasArticulo() {
  const { guardar, resumen } = await descargarFichasArticulo();
  const db = await getDatabase();
  await db.withTransactionAsync(() => guardar(db));
  await limpiarCopiasFichas();
  return resumen;
}

// Set con los códigos de artículo que tienen ficha técnica.
export async function getArticulosConFicha() {
  const db = await getDatabase();
  const filas = await db.getAllAsync('SELECT ARTICULO FROM FICHA_ARTICULO');
  return new Set(filas.map((f) => f.ARTICULO));
}

// Abre la ficha del artículo: la copia guardada si su FECHA es la vigente; si no, la baja (con el
// token), la guarda y la abre. Sin conexión y sin copia lanza un Error con SIN_CONEXION_FICHA.
export async function abrirFichaArticulo(articulo) {
  const db = await getDatabase();
  const fila = await db.getFirstAsync('SELECT FECHA, FECHA_LOCAL FROM FICHA_ARTICULO WHERE ARTICULO = ?', [articulo]);
  if (!fila) throw new Error('Este artículo no tiene ficha técnica.');

  const archivo = archivoFicha(articulo);
  const hayCopia = archivo.exists && fila.FECHA_LOCAL !== null;
  if (hayCopia && fila.FECHA_LOCAL === fila.FECHA) {
    await abrirPdf(archivo, articulo);
    return;
  }

  let bytes;
  try {
    bytes = await getArchivo(PATHS.fichaArticuloPdf(articulo));
  } catch (e) {
    if (isNetworkError(e)) {
      // Sin señal: si hay una copia anterior (la ficha cambió en la web) se abre esa.
      if (hayCopia) {
        await abrirPdf(archivo, articulo);
        return;
      }
      throw new Error(SIN_CONEXION_FICHA);
    }
    // 404: borraron la ficha en la web después de la última lista.
    if (e instanceof ApiError && e.status === 404 && !isAuthError(e)) {
      await db.runAsync('DELETE FROM FICHA_ARTICULO WHERE ARTICULO = ?', [articulo]);
      borrarCopia(articulo);
      throw new Error('La ficha técnica de este artículo ya no está disponible.');
    }
    throw e;
  }

  const dir = carpeta();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(bytes);
  await db.runAsync('UPDATE FICHA_ARTICULO SET FECHA_LOCAL = ? WHERE ARTICULO = ?', [fila.FECHA, articulo]);

  await abrirPdf(archivo, articulo);
}

// Android: abre el visor de PDF del equipo. Si no hay visor (o en iOS) se usa el menú del sistema,
// que permite verlo (vista previa) o abrirlo con otra app.
async function abrirPdf(archivo, articulo) {
  if (Platform.OS === 'android') {
    try {
      // require dentro del try: si el módulo nativo no está en el build, se usa el menú del sistema.
      const IntentLauncher = require('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: archivo.contentUri,
        type: 'application/pdf',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return;
    } catch {
      // sin app para ver PDF: se ofrece el menú del sistema
    }
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite abrir archivos PDF.');
  }
  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Ficha técnica ${articulo}`,
  });
}
