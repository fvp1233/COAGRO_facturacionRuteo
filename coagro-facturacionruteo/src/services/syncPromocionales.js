import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const entero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
// Fechas como texto 'YYYY-MM-DD HH:MM:SS' (el ISO del servidor '2026-11-12T10:00:00.000Z' se deja
// sin la T ni los milisegundos). FECHA_SOLICITUD es parte de la llave: se guarda tal cual llega,
// solo normalizada, para que la misma solicitud no se duplique entre cargas.
const fecha = (v) => {
  const t = textOr(v);
  if (!t) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(t);
  return m ? (m[2] ? `${m[1]} ${m[2].length === 5 ? `${m[2]}:00` : m[2]}` : m[1]) : t;
};

// Lista de la respuesta: { result: { promocionales: [...] } }. Se aceptan otros nombres de la clave
// (o result como arreglo) para no depender del nombre exacto que use el backend.
function lista(json) {
  const data = json?.result;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.promocionales)) return data.promocionales;
  const arreglos = data && typeof data === 'object' ? Object.values(data).filter(Array.isArray) : [];
  if (arreglos.length === 1) return arreglos[0];
  throw new ApiError('La respuesta del servidor no tiene el formato esperado (promocionales).');
}

const COLUMNAS = [
  'CLIENTE', 'FECHA_SOLICITUD', 'ID', 'RUTA', 'NOM_CLT', 'AGENTE', 'NOTAS', 'FECHA_REQUERIDA', 'DOC_PRO',
  'FECHA_PROCESADO', 'ENVIADO', 'FECHA_ENVIO', 'ERROR_ENVIO',
];
const SQL = `INSERT OR REPLACE INTO PROMOCIONAL (${COLUMNAS.join(', ')}) VALUES (${COLUMNAS.map(() => '?').join(', ')})`;

// Descarga las solicitudes de promocionales (GET /fr/sync/promocionales). Solo descarga y valida: no
// toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama guardar dentro de UNA transacción
// con el resto de la carga.
// guardar reemplaza lo que vino del servidor (ENVIADO = 1) y NO toca las solicitudes del equipo aún
// sin subir (ENVIADO = 0). Las del servidor quedan con ENVIADO = 1 (ya están allá).
// Se descartan filas sin CLIENTE, FECHA_SOLICITUD, RUTA o FECHA_REQUERIDA (NOT NULL en la tabla).
export async function descargarPromocionales() {
  const json = await getJson(PATHS.syncPromocionales);
  const filas = lista(json);
  const promocionales = filas.filter(
    (p) =>
      p &&
      typeof p === 'object' &&
      textOr(p.CLIENTE) !== '' &&
      fecha(p.FECHA_SOLICITUD) &&
      textOr(p.RUTA) !== '' &&
      fecha(p.FECHA_REQUERIDA)
  );
  const omitidos = filas.length - promocionales.length;

  const guardar = async (db) => {
    await db.runAsync('DELETE FROM PROMOCIONAL WHERE ENVIADO = 1');
    const sql = await db.prepareAsync(SQL);
    try {
      for (const p of promocionales) {
        await sql.executeAsync([
          textOr(p.CLIENTE),
          fecha(p.FECHA_SOLICITUD),
          entero(p.ID),
          textOr(p.RUTA),
          text(p.NOM_CLT),
          text(p.AGENTE),
          textOr(p.NOTAS),
          fecha(p.FECHA_REQUERIDA),
          textOr(p.DOC_PRO, 'N').toUpperCase() || 'N',
          fecha(p.FECHA_PROCESADO),
          1,
          fecha(p.FECHA_ENVIO),
          null,
        ]);
      }
    } finally {
      await sql.finalizeAsync();
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_promocionales_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { promocionales: promocionales.length, omitidos } };
}
