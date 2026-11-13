import { getDatabase } from '../db/database';

// Tipos de descuento (DESCUENTO_CLIART.TIPO): 'P' = porcentaje; cualquier otro se muestra como monto.
export const TIPO_PORCENTAJE = 'P';

// Vigencia de un descuento respecto a hoy ('YYYY-MM-DD' local).
export const VIGENCIA = { vigente: 'vigente', proximo: 'proximo', vencido: 'vencido' };

export const hoyISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function vigenciaDescuento(d, hoy = hoyISO()) {
  if (d.fechaInicio > hoy) return VIGENCIA.proximo;
  if (d.fechaFin < hoy) return VIGENCIA.vencido;
  return VIGENCIA.vigente;
}

// Descuentos del cliente guardados en el equipo (Datos > Cargar datos), con la descripción del
// artículo si está en ARTICULO. Primero los vigentes, luego los próximos y al final los vencidos.
// Devuelve { descuentos, descargado } (descargado = ISO de la última carga; null si nunca).
export async function getDescuentosCliente(cliente) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT d.COMPANIA, d.ARTICULO, a.DES_ART, d.CANT_MIN, d.CANT_MAX, d.FECHA_INICIO, d.FECHA_FIN, d.TIPO, d.MONTO
       FROM DESCUENTO_CLIART d
       LEFT JOIN ARTICULO a ON a.COD_ART = d.ARTICULO
      WHERE d.CLIENTE = ?
      ORDER BY COALESCE(a.DES_ART, d.ARTICULO), d.CANT_MIN, d.FECHA_INICIO`,
    [cliente]
  );
  const meta = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_descuentos_at'");

  const hoy = hoyISO();
  const orden = { [VIGENCIA.vigente]: 0, [VIGENCIA.proximo]: 1, [VIGENCIA.vencido]: 2 };
  const descuentos = rows
    .map((r) => {
      const d = {
        compania: r.COMPANIA,
        articulo: r.ARTICULO,
        descripcion: r.DES_ART ?? null,
        cantMin: r.CANT_MIN,
        cantMax: r.CANT_MAX,
        fechaInicio: r.FECHA_INICIO,
        fechaFin: r.FECHA_FIN,
        tipo: r.TIPO,
        monto: r.MONTO,
      };
      return { ...d, vigencia: vigenciaDescuento(d, hoy) };
    })
    // sort es estable: dentro de cada grupo se respeta el orden de la consulta.
    .sort((a, b) => orden[a.vigencia] - orden[b.vigencia]);

  return { descuentos, descargado: meta?.value ?? null };
}

// Reglas de descuento del cliente para la captura de pedidos y cotizaciones: Map ARTICULO -> [regla].
// Solo filtra por cliente, igual que la pantalla Descuentos y promociones. NO se cruza por compañía:
// DESCUENTO_CLIART.COMPANIA y CLIENTE_CIA.COD_CIA no traen el mismo código (igual que en artículos).
// La fecha y la cantidad se validan en la app al capturar la línea (descuentoAplicable), porque la
// cantidad cambia mientras se escribe. Códigos sin espacios ni mayúsculas/minúsculas de diferencia.
export async function getReglasDescuentoCliente(cliente) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT ARTICULO, CANT_MIN, CANT_MAX, FECHA_INICIO, FECHA_FIN, TIPO, MONTO
       FROM DESCUENTO_CLIART
      WHERE UPPER(TRIM(CLIENTE)) = UPPER(TRIM(?))`,
    [cliente]
  );
  const reglas = new Map();
  for (const r of rows) {
    const regla = {
      cantMin: Number(r.CANT_MIN),
      cantMax: Number(r.CANT_MAX),
      fechaInicio: String(r.FECHA_INICIO ?? '').slice(0, 10),
      fechaFin: String(r.FECHA_FIN ?? '').slice(0, 10),
      tipo: String(r.TIPO ?? '').trim().toUpperCase(),
      monto: Number(r.MONTO),
    };
    const codigo = claveArticulo(r.ARTICULO);
    if (!reglas.has(codigo)) reglas.set(codigo, []);
    reglas.get(codigo).push(regla);
  }
  return reglas;
}

// Llave para cruzar el código del artículo con DESCUENTO_CLIART.ARTICULO.
export const claveArticulo = (codigo) => String(codigo ?? '').trim().toUpperCase();

// Reglas de porcentaje (TIPO 'P') vigentes en la fecha: FECHA_INICIO <= hoy <= FECHA_FIN.
export function reglasVigentes(reglas, hoy = hoyISO()) {
  return (reglas ?? []).filter(
    (r) => r.tipo === TIPO_PORCENTAJE && r.fechaInicio <= hoy && r.fechaFin >= hoy && r.monto > 0
  );
}

// Regla que aplica a una línea: vigente hoy y con CANT_MIN <= cantidad <= CANT_MAX (cantidad en
// unidades de almacén). Si varias aplican se toma la de mayor porcentaje. null si ninguna.
export function descuentoAplicable(reglas, cantidad, hoy = hoyISO()) {
  if (!(cantidad > 0)) return null;
  return reglasVigentes(reglas, hoy)
    .filter((r) => cantidad >= r.cantMin && cantidad <= r.cantMax)
    .reduce((mejor, r) => (!mejor || r.monto > mejor.monto ? r : mejor), null);
}
