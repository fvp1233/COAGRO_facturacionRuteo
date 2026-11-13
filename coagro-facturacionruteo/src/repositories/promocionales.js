import { getDatabase } from '../db/database';
import { ACTIVIDAD, anotarActividad, quitarActividad } from './actividad';

// Solicitudes de promocionales (tabla PROMOCIONAL). Las del servidor llegan con Datos > Cargar datos
// (ENVIADO = 1); las que se crean en el equipo quedan con ENVIADO = 0 hasta subirlas.
// DOC_PRO: 'N' = pendiente, 'S' = procesada (FECHA_PROCESADO).

// Largo máximo de las notas que se escriben en el equipo.
export const MAX_NOTAS_PROMOCIONAL = 200;

const dos = (n) => String(n).padStart(2, '0');
// Fecha local 'YYYY-MM-DD HH:MM:SS' (el formato con que se guardan las fechas de la tabla).
const fechaLocal = (d) =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
const soloFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// Solicitudes del cliente, de la más reciente a la más vieja. Devuelve { promocionales, descargado }
// (descargado = ISO de la última carga; null si nunca).
export async function getPromocionalesCliente(cliente) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT CLIENTE, FECHA_SOLICITUD, ID, RUTA, NOM_CLT, AGENTE, NOTAS, FECHA_REQUERIDA, DOC_PRO,
            FECHA_PROCESADO, ENVIADO, FECHA_ENVIO, ERROR_ENVIO
       FROM PROMOCIONAL
      WHERE TRIM(CLIENTE) = TRIM(?)
      ORDER BY FECHA_SOLICITUD DESC`,
    [cliente]
  );
  const meta = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_promocionales_at'");
  return {
    promocionales: rows.map((r) => ({
      cliente: r.CLIENTE,
      fechaSolicitud: r.FECHA_SOLICITUD,
      id: r.ID,
      ruta: r.RUTA,
      nombreCliente: r.NOM_CLT,
      agente: r.AGENTE,
      notas: r.NOTAS,
      fechaRequerida: r.FECHA_REQUERIDA,
      procesada: String(r.DOC_PRO ?? '').trim().toUpperCase() === 'S',
      fechaProcesado: r.FECHA_PROCESADO,
      enviado: r.ENVIADO === 1,
      errorEnvio: r.ERROR_ENVIO,
    })),
    descargado: meta?.value ?? null,
  };
}

// Agente (alias de ruteo) de la handheld, de la última sincronización de metas; null si no hay.
async function agenteHandheld(db) {
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_metas_agentes'");
  try {
    const lista = JSON.parse(row?.value ?? '[]');
    return Array.isArray(lista) && lista.length ? String(lista[0]).trim() || null : null;
  } catch {
    return null;
  }
}

// Registra una solicitud nueva en el equipo (ENVIADO = 0, DOC_PRO 'N'). FECHA_SOLICITUD = ahora
// (con segundos: es parte de la llave junto con CLIENTE). ID lo asigna el servidor al recibirla.
// fechaRequerida: Date (se guarda solo el día). Devuelve la FECHA_SOLICITUD guardada.
export async function crearPromocional({ cliente, ruta, nombreCliente, notas, fechaRequerida }) {
  const texto = String(notas ?? '').trim();
  if (!texto) throw new Error('Escribe las notas de la solicitud.');
  if (!(fechaRequerida instanceof Date)) throw new Error('Elige la fecha requerida.');
  const db = await getDatabase();
  const ahora = new Date();
  const fechaSolicitud = fechaLocal(ahora);
  const existe = await db.getFirstAsync(
    'SELECT 1 AS x FROM PROMOCIONAL WHERE CLIENTE = ? AND FECHA_SOLICITUD = ?',
    [cliente, fechaSolicitud]
  );
  if (existe) throw new Error('Ya se registró una solicitud en este momento. Intenta de nuevo.');
  const agente = await agenteHandheld(db);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO PROMOCIONAL
         (CLIENTE, FECHA_SOLICITUD, ID, RUTA, NOM_CLT, AGENTE, NOTAS, FECHA_REQUERIDA, DOC_PRO, ENVIADO)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'N', 0)`,
      [
        cliente,
        fechaSolicitud,
        ruta,
        nombreCliente ?? null,
        agente,
        texto.slice(0, MAX_NOTAS_PROMOCIONAL),
        soloFecha(fechaRequerida),
      ]
    );
    // Bitácora del reporte Mi día.
    await anotarActividad(db, {
      tipo: ACTIVIDAD.promocional,
      clave: `${cliente}|${fechaSolicitud}`,
      fecha: ahora,
      cliente,
      ruta,
      detalle: { notas: texto.slice(0, MAX_NOTAS_PROMOCIONAL), requerida: soloFecha(fechaRequerida) },
    });
  });
  return fechaSolicitud;
}

// Borra una solicitud del equipo que todavía no se envió (las enviadas no se pueden borrar).
export async function eliminarPromocional(cliente, fechaSolicitud) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'DELETE FROM PROMOCIONAL WHERE CLIENTE = ? AND FECHA_SOLICITUD = ? AND ENVIADO = 0',
      [cliente, fechaSolicitud]
    );
    if (res.changes) await quitarActividad(db, ACTIVIDAD.promocional, `${cliente}|${fechaSolicitud}`);
  });
}
