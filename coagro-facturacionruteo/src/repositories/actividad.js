import { getDatabase } from '../db/database';
import { getRutasHandheld } from './rutaActiva';

// Bitácora de actividad del equipo (tabla REPORTE_ACTIVIDAD) y datos del reporte Mi día
// (Reportes > Visitas). Cada pedido, cotización, aprobación, cobro y promocional se anota al
// registrarse; "Cargar datos" no toca esta tabla, así que el reporte del día no pierde nada aunque se
// borren los documentos ya enviados.

export const ACTIVIDAD = {
  pedido: 'PEDIDO',
  cotizacion: 'COTIZACION',
  aprobacion: 'APROBACION',
  cobro: 'COBRO',
  promocional: 'PROMOCIONAL',
};

// Estado de visita (EFECT_VISITA_RT) que cuenta como visita efectiva (el mismo con que se registra la
// visita al guardar un pedido; ver ClientesScreen).
export const ESTADO_VISITA_EFECTIVA = '01';

// Días que se guarda la bitácora.
const DIAS_CONSERVAR = 60;

const dos = (n) => String(n).padStart(2, '0');
export const diaISO = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const horaLocal = (d) => `${diaISO(d)} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;

// Anota un registro en la bitácora. Se llama DENTRO de la transacción que guarda el documento (db es
// la conexión de esa transacción): si el guardado falla, la anotación tampoco queda.
//   tipo: ACTIVIDAD.*; clave: identifica el registro dentro del tipo; fecha: Date (por defecto, ahora).
//   detalle: objeto con datos extra (se guarda como JSON).
export async function anotarActividad(db, { tipo, clave, fecha = new Date(), cliente, ruta, documento, monto, detalle }) {
  await db.runAsync(
    `INSERT OR REPLACE INTO REPORTE_ACTIVIDAD
       (TIPO, CLAVE, FECHA, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE)
     VALUES (?, ?, ?, ?, ?, (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(?)), ?, ?, ?, ?)`,
    [
      tipo,
      String(clave),
      diaISO(fecha),
      horaLocal(fecha),
      cliente ?? null,
      cliente ?? null,
      ruta ?? null,
      documento ?? null,
      monto ?? null,
      detalle ? JSON.stringify(detalle) : null,
    ]
  );
  await db.runAsync("DELETE FROM REPORTE_ACTIVIDAD WHERE FECHA < date('now', 'localtime', ?)", [`-${DIAS_CONSERVAR} days`]);
}

// Quita un registro de la bitácora (el documento se eliminó del equipo).
export async function quitarActividad(db, tipo, clave) {
  await db.runAsync('DELETE FROM REPORTE_ACTIVIDAD WHERE TIPO = ? AND CLAVE = ?', [tipo, String(clave)]);
}

const leerDetalle = (v) => {
  try {
    return v ? JSON.parse(v) : {};
  } catch {
    return {};
  }
};

// Día de la semana como en alFAC_RUTA_ORDEN.DIA: 1 = lunes ... 7 = domingo.
const diaSemana = (d) => (d.getDay() === 0 ? 7 : d.getDay());

// Todo lo del día para el reporte Mi día (hoy). Devuelve:
// {
//   fecha,
//   planificados: clientes con visita programada hoy en las rutas de la handheld (alFAC_RUTA_ORDEN),
//   visitadosPlan: de esos, cuántos ya tienen visita hoy,
//   noVisitados: [{ codigo, nombre, ruta }] planificados aún sin visita,
//   visitas: [{ cliente, nombre, ruta, inicio, fin, razon, estado, efectiva, notas }],
//   actividad: [{ tipo, clave, hora, cliente, nombre, ruta, documento, monto, detalle }],
// }
export async function getResumenDia(fecha = new Date()) {
  const db = await getDatabase();
  const dia = diaISO(fecha);
  const rutas = (await getRutasHandheld()).map((r) => r.codigo);

  const visitas = await db.getAllAsync(
    `SELECT v.CLIENTE, v.RUTA, v.INICIO, v.FIN, v.RAZON, v.NOTAS, e.DESCRIPCION,
            (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(v.CLIENTE)) AS NOM_CLT
       FROM VISITA v
       LEFT JOIN EFECT_VISITA_RT e ON TRIM(e.EFECT_VISITA) = TRIM(v.RAZON)
      WHERE substr(v.INICIO, 1, 10) = ?
      ORDER BY v.INICIO DESC`,
    [dia]
  );

  // Clientes programados hoy (un cliente por ruta) en las rutas de la handheld.
  const marcas = rutas.map(() => '?').join(', ');
  const planificados = rutas.length
    ? await db.getAllAsync(
        `SELECT o.COD_ZON AS RUTA, o.COD_CLT AS CLIENTE, MIN(o.ORDEN) AS ORDEN,
                (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(o.COD_CLT)) AS NOM_CLT
           FROM alFAC_RUTA_ORDEN o
          WHERE o.DIA = ? AND o.COD_ZON IN (${marcas})
          GROUP BY o.COD_ZON, o.COD_CLT
          ORDER BY o.COD_ZON, MIN(o.ORDEN)`,
        [String(diaSemana(fecha)), ...rutas]
      )
    : [];
  const visitadosHoy = new Set(visitas.map((v) => `${String(v.RUTA).trim()}|${String(v.CLIENTE).trim()}`));
  const noVisitados = planificados
    .filter((p) => !visitadosHoy.has(`${String(p.RUTA).trim()}|${String(p.CLIENTE).trim()}`))
    .map((p) => ({ codigo: p.CLIENTE, nombre: p.NOM_CLT ?? p.CLIENTE, ruta: p.RUTA }));

  const actividad = await db.getAllAsync(
    `SELECT TIPO, CLAVE, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE
       FROM REPORTE_ACTIVIDAD WHERE FECHA = ? ORDER BY HORA DESC`,
    [dia]
  );

  return {
    fecha: dia,
    planificados: planificados.length,
    visitadosPlan: planificados.length - noVisitados.length,
    noVisitados,
    visitas: visitas.map((v) => ({
      cliente: v.CLIENTE,
      nombre: v.NOM_CLT ?? v.CLIENTE,
      ruta: v.RUTA,
      inicio: v.INICIO,
      fin: v.FIN,
      razon: v.RAZON,
      estado: v.DESCRIPCION ?? (v.RAZON ? `Estado ${v.RAZON}` : 'Sin estado'),
      efectiva: String(v.RAZON ?? '').trim() === ESTADO_VISITA_EFECTIVA,
      notas: v.NOTAS,
    })),
    actividad: actividad.map((a) => ({
      tipo: a.TIPO,
      clave: a.CLAVE,
      hora: a.HORA,
      cliente: a.CLIENTE,
      nombre: a.NOM_CLT ?? a.CLIENTE,
      ruta: a.RUTA,
      documento: a.DOCUMENTO,
      monto: Number(a.MONTO ?? 0),
      detalle: leerDetalle(a.DETALLE),
    })),
  };
}
