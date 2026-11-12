import { getDatabase } from '../db/database';

// Cuentas bancarias de la empresa (alCXC_CTA_BCO, descargadas con Datos > Cargar datos).
// Con compania se devuelven solo las de esa compañía (las del documento que se cobra); si la
// compañía no trae cuentas se devuelven todas.
// [{ clave, compania, banco, cuenta, nombre, moneda }]
export async function getCuentasBanco({ compania } = {}) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT COD_CIA, COD_BCO, CTA_BCO, NOM_CTA, MONEDA FROM alCXC_CTA_BCO ORDER BY COD_BCO, NOM_CTA, CTA_BCO'
  );
  const cuentas = rows.map((r) => ({
    clave: `${r.COD_CIA}|${r.COD_BCO}|${r.CTA_BCO}`,
    compania: r.COD_CIA ?? '',
    banco: r.COD_BCO,
    cuenta: r.CTA_BCO,
    nombre: r.NOM_CTA ?? '',
    moneda: r.MONEDA ?? '',
  }));
  const cia = String(compania ?? '').trim();
  if (!cia) return cuentas;
  const deLaCia = cuentas.filter((c) => c.compania === cia);
  return deLaCia.length ? deLaCia : cuentas;
}
