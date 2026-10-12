import { getDatabase } from '../db/database';

const pad = (n) => String(n).padStart(2, '0');

// Fecha/hora LOCAL como texto 'YYYY-MM-DD HH:MM:SS' (SQLite date() la entiende; no usar toISOString,
// que es UTC y descuadra el "día de hoy").
export function toSqlLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Estados de visita (erpadmin.EFECT_VISITA_RT descargada con "Cargar datos").
// Devuelve [{ codigo, descripcion }].
export async function getEfectividades() {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT EFECT_VISITA, DESCRIPCION FROM EFECT_VISITA_RT ORDER BY EFECT_VISITA');
  return rows.map((r) => ({
    codigo: String(r.EFECT_VISITA),
    descripcion: r.DESCRIPCION ? String(r.DESCRIPCION) : String(r.EFECT_VISITA),
  }));
}

// Inserta la visita (VISITA) y su ubicación (VISITA_UBICACION) en una sola transacción.
//   visita: { cliente, ruta, inicio: Date, fin: Date, tipo: 'R' | 'T', razon, notas, ubicacion }
//   ubicacion: { latitud, longitud, altitud, tiempo } | null
export async function registrarVisita({ cliente, ruta, inicio, fin, tipo, razon, notas, ubicacion }) {
  const db = await getDatabase();
  const ini = toSqlLocal(inicio);
  const hoy = toSqlLocal(fin).slice(0, 10);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO VISITA (CLIENTE, INICIO, FIN, FECHA_PLAN, NOTAS, TIPO, DOC_PRO, RAZON, RUTA)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [cliente, ini, toSqlLocal(fin), hoy, notas || null, tipo, razon, ruta]
    );

    if (ubicacion) {
      await db.runAsync(
        `INSERT INTO VISITA_UBICACION
           (CLIENTE, RUTA, INICIO, LATITUD, LONGITUD, ALTITUD, TIEMPO_GPS, TIEMPO_PDA, ERROR, PDOP)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          cliente,
          ruta,
          ini,
          ubicacion.latitud,
          ubicacion.longitud,
          ubicacion.altitud ?? null,
          ubicacion.tiempo ? toSqlLocal(new Date(ubicacion.tiempo)) : null,
          toSqlLocal(new Date()),
        ]
      );
    }
  });
}
